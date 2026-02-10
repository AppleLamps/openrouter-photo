const { withMiddleware, redactKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const { request_id } = req.body;

    if (!request_id || typeof request_id !== 'string') {
        return res.status(400).json({ error: 'request_id is required' });
    }

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
        const pollResponse = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(request_id)}`, {
            headers: {
                Authorization: `Bearer ${XAI_API_KEY}`,
            },
        });

        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            return res.status(pollResponse.status).json({
                error: 'Failed to retrieve video generation status',
                details: redactKey(errorText),
            });
        }

        const pollData = await pollResponse.json();
        const videoUrl =
            pollData?.url ||
            pollData?.video?.url ||
            pollData?.response?.video?.url ||
            pollData?.response?.url ||
            null;
        const status = String(pollData?.status || pollData?.state || '').toUpperCase();

        if (videoUrl) {
            return res.status(200).json({ status: 'completed', url: videoUrl });
        }

        if (['FAILED', 'ERROR', 'EXPIRED'].includes(status)) {
            return res.status(200).json({ status: 'failed' });
        }

        // Still processing
        return res.status(200).json({ status: 'pending' });
    } catch (error) {
        console.error('Video status error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
