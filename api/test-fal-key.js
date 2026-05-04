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
        // Lightweight validation: call a cheap text-to-image model with a minimal request.
        // Using the queue submit endpoint so we can quickly check auth without waiting for a result.
        const response = await fetch('https://queue.fal.run/fal-ai/bytedance/seedream/v5/lite/text-to-image', {
            method: 'POST',
            headers: {
                Authorization: `Key ${FAL_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: 'test',
                num_images: 1,
            }),
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
            // Other errors (e.g. 422) may still mean the key is valid but request was bad
            // A queue submission returning anything other than auth errors means the key works
            return res.status(200).json({ ok: true });
        }

        // If we got a request_id back, the key is valid. Cancel the queued request if possible.
        const data = await response.json().catch(() => ({}));
        if (data.request_id) {
            // Best-effort cancel to avoid wasting compute
            fetch(`https://queue.fal.run/fal-ai/bytedance/seedream/v5/lite/text-to-image/requests/${data.request_id}/cancel`, {
                method: 'PUT',
                headers: { Authorization: `Key ${FAL_KEY}` },
            }).catch(() => { });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
