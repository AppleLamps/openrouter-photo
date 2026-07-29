const { withMiddleware } = require('./_middleware');

const MAX_IMAGE_PROXY_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PROXY_REDIRECTS = 3;
const IMAGE_PROXY_TIMEOUT_MS = 15000;

function normalizeProxyUrl(value) {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    return trimmed || null;
}

function isAllowedImageProxyUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:') return false;
        const host = parsed.hostname.toLowerCase();
        const isVolcengineObjectStore = host.endsWith('.volces.com') && host.includes('.tos-');
        const isEvolinkHost = host === 'files-api.evolink.ai' || host.endsWith('.evolink.ai');
        return isVolcengineObjectStore || isEvolinkHost;
    } catch {
        return false;
    }
}

async function fetchAllowedImage(rawUrl, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const signal = options.signal;
    let currentUrl = rawUrl;

    for (let redirectCount = 0; redirectCount <= MAX_IMAGE_PROXY_REDIRECTS; redirectCount++) {
        const upstream = await fetchImpl(currentUrl, {
            redirect: 'manual',
            signal,
        });

        if (upstream.status < 300 || upstream.status >= 400) {
            return upstream;
        }

        const location = upstream.headers.get('location');
        if (!location || redirectCount === MAX_IMAGE_PROXY_REDIRECTS) {
            const error = new Error('Too many or invalid image redirects');
            error.code = 'IMAGE_PROXY_REDIRECT_INVALID';
            throw error;
        }

        const nextUrl = new URL(location, currentUrl).toString();
        if (!isAllowedImageProxyUrl(nextUrl)) {
            const error = new Error('Image redirect target is not allowed');
            error.code = 'IMAGE_PROXY_REDIRECT_BLOCKED';
            throw error;
        }
        currentUrl = nextUrl;
    }

    throw new Error('Image redirect limit exceeded');
}

async function readBodyWithLimit(upstream, maxBytes = MAX_IMAGE_PROXY_BYTES) {
    if (!upstream.body || typeof upstream.body.getReader !== 'function') {
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.byteLength > maxBytes) {
            const error = new Error('Image is too large to proxy');
            error.code = 'IMAGE_PROXY_TOO_LARGE';
            throw error;
        }
        return bytes;
    }

    const reader = upstream.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            totalBytes += chunk.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel('Image proxy byte limit exceeded').catch(() => {});
                const error = new Error('Image is too large to proxy');
                error.code = 'IMAGE_PROXY_TOO_LARGE';
                throw error;
            }
            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock();
    }

    return Buffer.concat(chunks, totalBytes);
}

module.exports = withMiddleware(async function handler(req, res) {
    const rawUrl = normalizeProxyUrl(req.query?.url);
    if (!rawUrl) {
        return res.status(400).json({ error: 'url is required' });
    }
    if (!isAllowedImageProxyUrl(rawUrl)) {
        return res.status(400).json({ error: 'Unsupported image host' });
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), IMAGE_PROXY_TIMEOUT_MS);
    let upstream;
    try {
        upstream = await fetchAllowedImage(rawUrl, { signal: timeoutController.signal });
    } catch (error) {
        clearTimeout(timeout);
        if (error?.code === 'IMAGE_PROXY_REDIRECT_BLOCKED') {
            return res.status(400).json({ error: 'Unsupported image redirect host' });
        }
        if (error?.name === 'AbortError') {
            return res.status(504).json({ error: 'Image proxy request timed out' });
        }
        return res.status(502).json({ error: 'Failed to fetch image' });
    }
    if (!upstream.ok) {
        clearTimeout(timeout);
        return res.status(upstream.status).json({ error: 'Failed to fetch image' });
    }

    const contentLength = Number.parseInt(upstream.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_PROXY_BYTES) {
        clearTimeout(timeout);
        return res.status(413).json({ error: 'Image is too large to proxy' });
    }

    const contentType = upstream.headers.get('content-type');
    if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
        clearTimeout(timeout);
        return res.status(415).json({ error: 'Unsupported proxied content type' });
    }

    let bytes;
    try {
        bytes = await readBodyWithLimit(upstream);
    } catch (error) {
        clearTimeout(timeout);
        if (error?.code === 'IMAGE_PROXY_TOO_LARGE') {
            return res.status(413).json({ error: 'Image is too large to proxy' });
        }
        if (error?.name === 'AbortError') {
            return res.status(504).json({ error: 'Image proxy request timed out' });
        }
        return res.status(502).json({ error: 'Failed to read image' });
    }
    clearTimeout(timeout);
    if (bytes.byteLength > MAX_IMAGE_PROXY_BYTES) {
        return res.status(413).json({ error: 'Image is too large to proxy' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).send(bytes);
}, { methods: ['GET'], skipBodyParse: true });

module.exports.isAllowedImageProxyUrl = isAllowedImageProxyUrl;
module.exports.fetchAllowedImage = fetchAllowedImage;
module.exports.readBodyWithLimit = readBodyWithLimit;
module.exports.MAX_IMAGE_PROXY_BYTES = MAX_IMAGE_PROXY_BYTES;
