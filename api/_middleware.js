/**
 * Shared middleware for API handlers.
 * Handles CORS, OPTIONS preflight, POST-only enforcement, and body parsing.
 */

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 60;
const rateLimitBuckets = new Map();
const SERVER_PROVIDER_KEY_ACCESS_HEADER = 'x-app-access-token';

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
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
};

const checkRateLimit = (req, options = {}) => {
    const windowMs = Number.parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '', 10) || options.windowMs || DEFAULT_RATE_LIMIT_WINDOW_MS;
    const max = Number.parseInt(process.env.API_RATE_LIMIT_MAX || '', 10) || options.max || DEFAULT_RATE_LIMIT_MAX;
    if (max <= 0) return { allowed: true, remaining: 0, resetMs: Date.now() + windowMs };

    const now = Date.now();
    const key = `${getClientId(req)}:${req.url || ''}`;
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
    };
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

function resolveFalApiKey(req) {
    return resolveProviderApiKey(req, [
        'x-fal-api-key',
        'x-fal-api_key',
    ], 'FAL_KEY');
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
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]+/gi, '[REDACTED_API_KEY]')
        .replace(/fal[_-][a-zA-Z0-9.\-_]{20,}/g, '[REDACTED_API_KEY]')
        .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[REDACTED_IMAGE_DATA]');
};

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
        allowHeaders = 'Content-Type, X-OpenRouter-Api-Key, X-XAI-Api-Key, X-FAL-Api-Key, X-App-Access-Token',
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
        const limit = checkRateLimit(req, rateLimit);
        res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(limit.resetMs / 1000)));
        if (!limit.allowed) {
            return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
        }

        // ---------- Body parsing (Vercel compatibility) ----------
        if (!skipBodyParse && req.method !== 'GET' && req.method !== 'HEAD') {
            if (!req.body || typeof req.body !== 'object') {
                try {
                    const chunks = [];
                    for await (const chunk of req) {
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

module.exports = { withMiddleware, redactKey, resolveOpenRouterApiKey, resolveXaiApiKey, resolveFalApiKey };
