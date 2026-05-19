const { withMiddleware } = require('./_middleware');

const MAX_IMAGE_PROXY_BYTES = 20 * 1024 * 1024;

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

module.exports = withMiddleware(async function handler(req, res) {
    const rawUrl = normalizeProxyUrl(req.query?.url);
    if (!rawUrl) {
        return res.status(400).json({ error: 'url is required' });
    }
    if (!isAllowedImageProxyUrl(rawUrl)) {
        return res.status(400).json({ error: 'Unsupported image host' });
    }

    const upstream = await fetch(rawUrl);
    if (!upstream.ok) {
        return res.status(upstream.status).json({ error: 'Failed to fetch image' });
    }

    const contentLength = Number.parseInt(upstream.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_PROXY_BYTES) {
        return res.status(413).json({ error: 'Image is too large to proxy' });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
        return res.status(415).json({ error: 'Unsupported proxied content type' });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_PROXY_BYTES) {
        return res.status(413).json({ error: 'Image is too large to proxy' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).send(bytes);
}, { methods: ['GET'], skipBodyParse: true });

module.exports.isAllowedImageProxyUrl = isAllowedImageProxyUrl;
module.exports.MAX_IMAGE_PROXY_BYTES = MAX_IMAGE_PROXY_BYTES;
