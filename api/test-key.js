const { withMiddleware, redactKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const OPENROUTER_API_KEY =
        req.headers['x-openrouter-api-key'] ||
        req.headers['x-openrouter-api_key'];

    if (!OPENROUTER_API_KEY) {
        return res.status(401).json({
            code: 'OPENROUTER_API_KEY_REQUIRED',
            error: 'OpenRouter API key required',
            help: {
                message: 'Open Settings → paste your OpenRouter API key. Create one at openrouter.ai/keys.',
                url: 'https://openrouter.ai/keys'
            }
        });
    }

    try {
        // Cheap validation call: list models. If the key is invalid, OpenRouter will return 401/403.
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': req.headers.referer || 'http://localhost',
                'X-Title': 'AI Image Generator',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                code: 'OPENROUTER_KEY_INVALID',
                error: 'OpenRouter API key test failed',
                details: redactKey(errorText)
            });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});

