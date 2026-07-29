/**
 * Shared middleware for API handlers.
 * Handles CORS, OPTIONS preflight, POST-only enforcement, and body parsing.
 */

const { createHash } = require('node:crypto');

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 60;
const DEFAULT_DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS = 1500;
const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_PRUNE_INTERVAL_MS = 60 * 1000;
const API_CORS_ALLOW_HEADERS = 'Content-Type, X-OpenRouter-Api-Key, X-XAI-Api-Key, X-Evolink-Api-Key, X-App-Access-Token';
const rateLimitBuckets = new Map();
const SERVER_PROVIDER_KEY_ACCESS_HEADER = 'x-app-access-token';
const DISTRIBUTED_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;
let lastRateLimitPruneMs = 0;
let didWarnDistributedRateLimit = false;

const parseOptionalInteger = (raw) => {
    if (raw == null || String(raw).trim() === '') return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const resolveIntegerSetting = (envName, optionValue, defaultValue) => {
    const envValue = parseOptionalInteger(process.env[envName]);
    if (envValue !== null) return envValue;
    if (typeof optionValue === 'number' && Number.isFinite(optionValue)) return optionValue;
    return defaultValue;
};

const getRequestOrigin = (req) => {
    const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return host ? `${proto}://${host}` : null;
};

const resolveCorsOrigin = (req) => {
    const raw = process.env.ALLOWED_ORIGIN || '';
    const allowed = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (allowed.includes('*')) {
        return { origin: '*', blocked: false };
    }
    if (allowed.length === 0) {
        const origin = req.headers.origin;
        if (!origin) {
            return { origin: null, blocked: false };
        }
        return { origin, blocked: origin !== getRequestOrigin(req) };
    }
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        return { origin, blocked: false };
    }
    return { origin: allowed[0], blocked: Boolean(origin) };
};

const getClientId = (req) => {
    const trustForwardedFor = process.env.VERCEL === '1' || process.env.TRUST_PROXY === 'true';
    const forwardedFor = trustForwardedFor ? req.headers['x-forwarded-for'] : null;
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
};

const getRateLimitRoute = (req) => {
    try {
        return new URL(req.url || '/', 'http://rate-limit.local').pathname;
    } catch {
        return '/';
    }
};

const getDistributedRateLimitConfig = () => {
    const url = getEnvValue('UPSTASH_REDIS_REST_URL') || getEnvValue('KV_REST_API_URL');
    const token = getEnvValue('UPSTASH_REDIS_REST_TOKEN') || getEnvValue('KV_REST_API_TOKEN');
    return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
};

const buildRateLimitKey = (req) => {
    const identity = `${getClientId(req)}:${String(req.method || 'GET').toUpperCase()}:${getRateLimitRoute(req)}`;
    return `api-rate-limit:${createHash('sha256').update(identity).digest('hex')}`;
};

function pruneExpiredRateLimitBuckets(now = Date.now()) {
    for (const [key, bucket] of rateLimitBuckets.entries()) {
        if (!bucket || bucket.resetMs <= now) {
            rateLimitBuckets.delete(key);
        }
    }
    lastRateLimitPruneMs = now;
}

function maybePruneExpiredRateLimitBuckets(now) {
    if (now - lastRateLimitPruneMs >= RATE_LIMIT_PRUNE_INTERVAL_MS) {
        pruneExpiredRateLimitBuckets(now);
    }
}

const checkLocalRateLimit = (key, windowMs, max) => {
    const now = Date.now();
    maybePruneExpiredRateLimitBuckets(now);
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetMs <= now) {
        bucket = { count: 0, resetMs: now + windowMs };
        rateLimitBuckets.set(key, bucket);
    }

    bucket.count += 1;
    return {
        allowed: bucket.count <= max,
        remaining: Math.max(max - bucket.count, 0),
        resetMs: bucket.resetMs,
        source: 'local',
    };
};

const checkDistributedRateLimit = async (key, windowMs, max, config) => {
    const timeoutMs = resolveIntegerSetting(
        'API_RATE_LIMIT_TIMEOUT_MS',
        null,
        DEFAULT_DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS
    );
    const response = await fetch(config.url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(['EVAL', DISTRIBUTED_RATE_LIMIT_SCRIPT, '1', key, String(windowMs)]),
        signal: AbortSignal.timeout(Math.max(timeoutMs, 1)),
    });
    if (!response.ok) {
        throw new Error(`Distributed rate limiter returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.result;
    if (!Array.isArray(result) || result.length < 2) {
        throw new Error('Distributed rate limiter returned an invalid response');
    }

    const count = Number(result[0]);
    const ttl = Number(result[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
        throw new Error('Distributed rate limiter returned invalid counters');
    }

    const now = Date.now();
    return {
        allowed: count <= max,
        remaining: Math.max(max - count, 0),
        resetMs: now + Math.max(ttl, 0),
        source: 'distributed',
    };
};

const checkRateLimit = async (req, options = {}) => {
    const windowMs = resolveIntegerSetting('API_RATE_LIMIT_WINDOW_MS', options.windowMs, DEFAULT_RATE_LIMIT_WINDOW_MS);
    const max = resolveIntegerSetting('API_RATE_LIMIT_MAX', options.max, DEFAULT_RATE_LIMIT_MAX);
    if (max <= 0) {
        return { allowed: true, remaining: 0, resetMs: Date.now() + windowMs, source: 'disabled' };
    }

    const key = buildRateLimitKey(req);
    const distributedConfig = getDistributedRateLimitConfig();
    if (distributedConfig) {
        try {
            return await checkDistributedRateLimit(key, windowMs, max, distributedConfig);
        } catch (error) {
            if (!didWarnDistributedRateLimit) {
                console.error('Distributed API rate limiter unavailable; using local fallback:', error);
                didWarnDistributedRateLimit = true;
            }
            if (process.env.API_RATE_LIMIT_FAIL_CLOSED === 'true') {
                return {
                    allowed: false,
                    unavailable: true,
                    remaining: 0,
                    resetMs: Date.now() + windowMs,
                    source: 'distributed-error',
                };
            }
        }
    }

    return checkLocalRateLimit(key, windowMs, max);
};

const getHeaderValue = (req, names) => {
    for (const name of names) {
        const raw = req.headers[name];
        if (Array.isArray(raw)) {
            const value = raw.find((item) => typeof item === 'string' && item.trim());
            if (value) return value.trim();
        } else if (typeof raw === 'string' && raw.trim()) {
            return raw.trim();
        }
    }
    return null;
};

const getEnvValue = (name) => {
    const raw = process.env[name];
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    return trimmed.length > 0 ? trimmed : null;
};

const isProductionRuntime = () =>
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

const canUseServerProviderKey = (req) => {
    if (process.env.ALLOW_PUBLIC_SERVER_PROVIDER_KEYS === 'true') {
        return true;
    }
    if (!isProductionRuntime() && process.env.ALLOW_PUBLIC_SERVER_PROVIDER_KEYS !== 'false') {
        return true;
    }

    const requiredToken = getEnvValue('APP_ACCESS_TOKEN');
    if (!requiredToken) {
        return false;
    }

    const suppliedToken = getHeaderValue(req, [
        SERVER_PROVIDER_KEY_ACCESS_HEADER,
        'x-app_access_token',
    ]);
    return suppliedToken === requiredToken;
};

const resolveProviderApiKey = (req, headerNames, envName) => {
    const fromHeader = getHeaderValue(req, headerNames);
    if (fromHeader) return fromHeader;

    const fromEnv = getEnvValue(envName);
    if (!fromEnv) return null;

    return canUseServerProviderKey(req) ? fromEnv : null;
};

/**
 * OpenRouter key: prefer client header, then server env. Trims; empty string → null.
 * Accepts the header spellings the app historically used, plus `x-openrouter-api_key`.
 * @param {import('http').IncomingMessage} req
 * @returns {string | null}
 */
function resolveOpenRouterApiKey(req) {
    return resolveProviderApiKey(req, [
        'x-openrouter-api-key',
        'x-openrouter_api_key',
        'x-openrouter-api_key',
    ], 'OPENROUTER_API_KEY');
}

function resolveXaiApiKey(req) {
    return resolveProviderApiKey(req, [
        'x-xai-api-key',
        'x-xai-api_key',
    ], 'XAI_API_KEY');
}

function resolveEvolinkApiKey(req) {
    return resolveProviderApiKey(req, [
        'x-evolink-api-key',
        'x-evolink-api_key',
    ], 'EVOLINK_API_KEY');
}

/**
 * Redact OpenRouter API keys from text to prevent leaking secrets in logs/responses.
 * @param {string} text
 * @returns {string}
 */

const redactKey = (text) => {
    if (!text) return text;
    const str = String(text);
    return str
        .replace(/sk-or-v1-[a-zA-Z0-9.\-_]+/g, '[REDACTED_API_KEY]')
        .replace(/xai-[a-zA-Z0-9.\-_]+/g, '[REDACTED_API_KEY]')
        .replace(/Bearer\s+[a-zA-Z0-9._:\-]{16,}/gi, 'Bearer [REDACTED_API_KEY]')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]+/gi, '[REDACTED_API_KEY]')
        .replace(/fal[_-][a-zA-Z0-9.\-_]{20,}/g, '[REDACTED_API_KEY]')
        .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[REDACTED_IMAGE_DATA]');
};

function parseContentLength(req) {
    const raw = req.headers?.['content-length'];
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function payloadTooLargeResponse(res) {
    return res.status(413).json({
        code: 'REQUEST_PAYLOAD_TOO_LARGE',
        error: 'Attached images are too large for deployment. Use fewer or smaller reference images.',
    });
}

/**
 * Wrap an async handler with standard CORS, method-check, and body-parsing boilerplate.
 *
 * @param {(req, res) => Promise<void>} handler  – The actual route logic
 * @param {Object}  [options]
 * @param {string}  [options.allowHeaders]  – Value for Access-Control-Allow-Headers
 * @param {boolean} [options.skipBodyParse] – Skip JSON body parsing (e.g. for endpoints that don't need a body)
 * @returns {(req, res) => Promise<void>}
 */
function withMiddleware(handler, options = {}) {
    const {
        allowHeaders = API_CORS_ALLOW_HEADERS,
        skipBodyParse = false,
        rateLimit = {},
        methods = ['POST'],
    } = options;
    const allowedMethods = Array.from(new Set(
        (Array.isArray(methods) ? methods : [methods])
            .map((method) => String(method || '').toUpperCase())
            .filter(Boolean)
    ));
    const allowMethodsHeader = [...allowedMethods, 'OPTIONS'].join(', ');

    return async function wrappedHandler(req, res) {
        // ---------- CORS ----------
        const cors = resolveCorsOrigin(req);
        if (cors.origin) {
            res.setHeader('Access-Control-Allow-Origin', cors.origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', allowMethodsHeader);
        res.setHeader('Access-Control-Allow-Headers', allowHeaders);

        if (cors.blocked) {
            return res.status(403).json({ error: 'Origin not allowed' });
        }

        // ---------- Preflight ----------
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // ---------- Method check ----------
        if (!allowedMethods.includes(req.method)) {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // ---------- Rate limiting ----------
        const limit = await checkRateLimit(req, rateLimit);
        res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(limit.resetMs / 1000)));
        res.setHeader('X-RateLimit-Source', limit.source);
        if (limit.unavailable) {
            return res.status(503).json({ error: 'Rate limit service unavailable. Please try again.' });
        }
        if (!limit.allowed) {
            return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
        }

        // ---------- Body parsing (Vercel compatibility) ----------
        if (!skipBodyParse && req.method !== 'GET' && req.method !== 'HEAD') {
            const contentLength = parseContentLength(req);
            if (contentLength !== null && contentLength > VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES) {
                return payloadTooLargeResponse(res);
            }

            if (!req.body || typeof req.body !== 'object') {
                try {
                    const chunks = [];
                    let totalBytes = 0;
                    for await (const chunk of req) {
                        totalBytes += Buffer.byteLength(chunk);
                        if (totalBytes > VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES) {
                            return payloadTooLargeResponse(res);
                        }
                        chunks.push(chunk);
                    }
                    const body = Buffer.concat(chunks).toString();
                    req.body = JSON.parse(body);
                } catch (_error) {
                    return res.status(400).json({ error: 'Invalid JSON body' });
                }
            }
        }

        // ---------- Delegate to handler ----------
        return handler(req, res);
    };
}

module.exports = {
    withMiddleware,
    redactKey,
    resolveOpenRouterApiKey,
    resolveXaiApiKey,
    resolveEvolinkApiKey,
    VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES,
    API_CORS_ALLOW_HEADERS,
    __test: {
        rateLimitBuckets,
        pruneExpiredRateLimitBuckets,
        buildRateLimitKey,
        getRateLimitRoute,
        checkRateLimit,
    },
};
