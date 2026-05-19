const { withMiddleware, redactKey, resolveFalApiKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const FAL_KEY = resolveFalApiKey(req);

    if (!FAL_KEY) {
        return res.status(401).json({
            code: 'FAL_API_KEY_REQUIRED',
            error: 'Fal API key required',
            help: {
                message: 'Open Settings → paste your Fal API key. Create one at fal.ai/dashboard/keys.',
                url: 'https://fal.ai/dashboard/keys'
            }
        });
    }

    try {
        // Lightweight validation: list one model through the platform API.
        // This checks auth without submitting a billable generation job.
        const response = await fetch('https://api.fal.ai/v1/models?limit=1', {
            method: 'GET',
            headers: {
                Authorization: `Key ${FAL_KEY}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            // 401/403 means invalid key
            if (response.status === 401 || response.status === 403) {
                return res.status(response.status).json({
                    code: 'FAL_KEY_INVALID',
                    error: 'Fal API key test failed',
                    details: redactKey(errorText)
                });
            }
            // Other platform errors still prove the key was accepted by auth.
            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
