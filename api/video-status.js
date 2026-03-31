const { withMiddleware, redactKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const { request_id, provider, model } = req.body;

    if (!request_id || typeof request_id !== 'string') {
        return res.status(400).json({ error: 'request_id is required' });
    }

    // ---------- Fal video polling ----------
    if (provider === 'fal') {
        const FAL_KEY =
            req.headers['x-fal-api-key'] ||
            req.headers['x-fal-api_key'] ||
            process.env.FAL_KEY;

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

        const falModel = model || 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video';

        try {
            // Check status first
            const statusUrl = `https://queue.fal.run/${falModel}/requests/${encodeURIComponent(request_id)}/status`;
            const statusResponse = await fetch(statusUrl, {
                headers: { Authorization: `Key ${FAL_KEY}` },
            });

            if (!statusResponse.ok) {
                const errorText = await statusResponse.text();
                return res.status(statusResponse.status).json({
                    error: 'Failed to retrieve Fal video status',
                    details: redactKey(errorText),
                });
            }

            const statusData = await statusResponse.json();
            const status = String(statusData?.status || '').toUpperCase();

            if (status === 'COMPLETED') {
                // Fetch the result to get the video URL
                const resultUrl = `https://queue.fal.run/${falModel}/requests/${encodeURIComponent(request_id)}`;
                const resultResponse = await fetch(resultUrl, {
                    headers: { Authorization: `Key ${FAL_KEY}` },
                });

                if (!resultResponse.ok) {
                    const errorText = await resultResponse.text();
                    return res.status(resultResponse.status).json({
                        error: 'Failed to retrieve Fal video result',
                        details: redactKey(errorText),
                    });
                }

                const resultData = await resultResponse.json();
                const videoUrl = resultData?.video?.url || null;

                if (videoUrl) {
                    return res.status(200).json({ status: 'completed', url: videoUrl });
                }

                return res.status(200).json({ status: 'failed' });
            }

            if (['FAILED', 'ERROR'].includes(status)) {
                return res.status(200).json({ status: 'failed' });
            }

            // IN_QUEUE or IN_PROGRESS → still pending
            return res.status(200).json({ status: 'pending' });
        } catch (error) {
            console.error('Fal video status error:', redactKey(error));
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // ---------- xAI video polling (default) ----------
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
