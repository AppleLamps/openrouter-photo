const { withMiddleware, redactKey, resolveXaiApiKey, resolveEvolinkApiKey } = require('./_middleware');

const normalizeStringParam = (value) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    return trimmed || null;
};

const extractEvolinkVideoUrl = (data) => {
    const candidates = [
        data?.results,
        data?.data?.results,
        data?.output,
        data?.data?.output,
    ];
    for (const value of candidates) {
        if (Array.isArray(value)) {
            const url = value
                .map((item) => (typeof item === 'string' ? item : item?.url || item?.video_url || item?.file_url || null))
                .find((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
            if (url) return url;
        }
    }
    const single = data?.video?.url || data?.url || data?.data?.url;
    return typeof single === 'string' && /^https?:\/\//i.test(single) ? single : null;
};

module.exports = withMiddleware(async function handler(req, res) {
    const input = req.method === 'GET' ? req.query : req.body;
    const requestId = normalizeStringParam(input?.request_id);
    const provider = normalizeStringParam(input?.provider);

    if (!requestId) {
        return res.status(400).json({ error: 'request_id is required' });
    }

    // ---------- Evolink video polling ----------
    if (provider === 'evolink') {
        const EVOLINK_API_KEY = resolveEvolinkApiKey(req);

        if (!EVOLINK_API_KEY) {
            return res.status(401).json({
                code: 'EVOLINK_API_KEY_REQUIRED',
                error: 'Evolink API key required',
                help: {
                    message: 'Open Settings → paste your Evolink API key. Create one at evolink.ai/dashboard/keys.',
                    url: 'https://evolink.ai/dashboard/keys',
                },
            });
        }

        try {
            const taskResponse = await fetch(`https://api.evolink.ai/v1/tasks/${encodeURIComponent(requestId)}`, {
                headers: { Authorization: `Bearer ${EVOLINK_API_KEY}` },
            });

            if (!taskResponse.ok) {
                const errorText = await taskResponse.text();
                return res.status(taskResponse.status).json({
                    error: 'Failed to retrieve Evolink video status',
                    details: redactKey(errorText),
                });
            }

            const taskData = await taskResponse.json();
            const status = String(taskData?.status || taskData?.data?.status || '').toLowerCase();

            if (status === 'completed') {
                const videoUrl = extractEvolinkVideoUrl(taskData);
                if (videoUrl) {
                    return res.status(200).json({ status: 'completed', url: videoUrl });
                }
                return res.status(200).json({ status: 'failed' });
            }

            if (status === 'failed') {
                return res.status(200).json({ status: 'failed' });
            }

            // pending or processing → still pending
            return res.status(200).json({ status: 'pending' });
        } catch (error) {
            console.error('Evolink video status error:', redactKey(error));
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // ---------- xAI video polling (default) ----------
    const XAI_API_KEY = resolveXaiApiKey(req);

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
        const pollResponse = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`, {
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
}, {
    methods: ['GET', 'POST'],
});
