const { withMiddleware, redactKey, resolveEvolinkApiKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const EVOLINK_API_KEY = resolveEvolinkApiKey(req);

    if (!EVOLINK_API_KEY) {
        return res.status(401).json({
            code: 'EVOLINK_API_KEY_REQUIRED',
            error: 'Evolink API key required',
            help: {
                message: 'Open Settings, paste your Evolink API key, then try again.',
                url: 'https://evolink.ai/dashboard/keys'
            }
        });
    }

    try {
        const response = await fetch('https://api.evolink.ai/v1/credits', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${EVOLINK_API_KEY}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                code: 'EVOLINK_KEY_INVALID',
                error: 'Evolink API key test failed',
                details: redactKey(errorText)
            });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
