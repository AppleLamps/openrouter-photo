const { withMiddleware, redactKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const XAI_API_KEY =
        req.headers['x-xai-api-key'] ||
        req.headers['x-xai-api_key'] ||
        process.env.XAI_API_KEY;

    if (!XAI_API_KEY) {
        return res.status(401).json({
            code: 'XAI_API_KEY_REQUIRED',
            error: 'xAI API key required',
            help: {
                message: 'Open Settings → paste your xAI API key. Create one at console.x.ai.',
                url: 'https://console.x.ai'
            }
        });
    }

    try {
        // Lightweight validation: list models. If the key is invalid xAI returns 401.
        const response = await fetch('https://api.x.ai/v1/models', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${XAI_API_KEY}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                code: 'XAI_KEY_INVALID',
                error: 'xAI API key test failed',
                details: redactKey(errorText)
            });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
