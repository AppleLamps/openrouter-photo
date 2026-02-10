/**
 * Shared middleware for API handlers.
 * Handles CORS, OPTIONS preflight, POST-only enforcement, and body parsing.
 */

const resolveCorsOrigin = (req) => {
    const raw = process.env.ALLOWED_ORIGIN || '';
    const allowed = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (allowed.length === 0 || allowed.includes('*')) {
        return '*';
    }
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        return origin;
    }
    return allowed[0];
};

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
        .replace(/xai-[a-zA-Z0-9.\-_]+/g, '[REDACTED_API_KEY]');
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
        allowHeaders = 'Content-Type, X-OpenRouter-Api-Key, X-XAI-Api-Key',
        skipBodyParse = false,
    } = options;

    return async function wrappedHandler(req, res) {
        // ---------- CORS ----------
        const allowedOrigin = resolveCorsOrigin(req);
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        if (allowedOrigin !== '*') {
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', allowHeaders);

        // ---------- Preflight ----------
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // ---------- POST only ----------
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // ---------- Body parsing (Vercel compatibility) ----------
        if (!skipBodyParse) {
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

module.exports = { withMiddleware, redactKey };
