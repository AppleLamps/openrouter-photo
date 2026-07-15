const { withMiddleware, redactKey, resolveXaiApiKey, resolveEvolinkApiKey } = require('./_middleware');
const { formatEvolinkError } = require('./providers/format-errors');
const { buildEvolinkProxyUrl, extractEvolinkResultUrls } = require('./providers/evolink-task');

const normalizeStringParam = (value) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    return trimmed || null;
};

async function handleEvolinkStatus(req, res, requestId, mediaType) {
    const evolinkKey = resolveEvolinkApiKey(req);
    if (!evolinkKey) {
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
            headers: { Authorization: `Bearer ${evolinkKey}` },
        });
        if (!taskResponse.ok) {
            const errorText = await taskResponse.text();
            const formatted = formatEvolinkError(errorText, 'Failed to retrieve Evolink generation status');
            return res.status(taskResponse.status).json(formatted);
        }

        const taskData = await taskResponse.json();
        const status = String(taskData?.status || taskData?.data?.status || '').toLowerCase();
        if (status === 'completed') {
            const url = extractEvolinkResultUrls(taskData)[0];
            if (!url) {
                return res.status(200).json({
                    status: 'failed',
                    error: `Task completed but returned no ${mediaType} URL.`,
                });
            }
            return res.status(200).json({
                status: 'completed',
                media_type: mediaType,
                url: mediaType === 'image' ? buildEvolinkProxyUrl(url) : url,
                ...(mediaType === 'image' ? { source_url: url } : {}),
            });
        }

        if (status === 'failed') {
            const taskError = taskData?.error || taskData?.data?.error || taskData;
            const formatted = formatEvolinkError(JSON.stringify(taskError), 'Evolink generation failed');
            return res.status(200).json({
                status: 'failed',
                error: formatted.details || formatted.error,
            });
        }

        return res.status(200).json({ status: 'pending', media_type: mediaType });
    } catch (error) {
        console.error('Evolink generation status error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

async function handleXaiStatus(req, res, requestId) {
    const xaiKey = resolveXaiApiKey(req);
    if (!xaiKey) {
        return res.status(401).json({
            code: 'XAI_API_KEY_REQUIRED',
            error: 'xAI API key required',
            help: {
                message: 'Open Settings → paste your xAI API key. Create one at console.x.ai.',
                url: 'https://console.x.ai',
            },
        });
    }

    try {
        const pollResponse = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`, {
            headers: { Authorization: `Bearer ${xaiKey}` },
        });
        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            return res.status(pollResponse.status).json({
                error: 'Failed to retrieve video generation status',
                details: redactKey(errorText),
            });
        }

        const pollData = await pollResponse.json();
        const url = pollData?.url || pollData?.video?.url || pollData?.response?.video?.url || pollData?.response?.url || null;
        const status = String(pollData?.status || pollData?.state || '').toUpperCase();
        if (url) return res.status(200).json({ status: 'completed', media_type: 'video', url });
        if (['EXPIRED', 'FAILED', 'ERROR', 'CANCELLED'].includes(status)) {
            return res.status(200).json({
                status: 'failed',
                error: redactKey(pollData?.error?.message || pollData?.error || pollData?.message || ''),
            });
        }
        return res.status(200).json({ status: 'pending', media_type: 'video' });
    } catch (error) {
        console.error('xAI generation status error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

const handler = withMiddleware(async function generationStatusHandler(req, res) {
    const input = req.method === 'GET' ? req.query : req.body;
    const requestId = normalizeStringParam(input?.request_id);
    const provider = normalizeStringParam(input?.provider) || 'xai';
    const mediaType = normalizeStringParam(input?.media_type) === 'image' ? 'image' : 'video';

    if (!requestId) return res.status(400).json({ error: 'request_id is required' });
    if (provider === 'evolink') return handleEvolinkStatus(req, res, requestId, mediaType);
    if (provider === 'xai') return handleXaiStatus(req, res, requestId);
    return res.status(400).json({ error: 'Unsupported generation provider' });
}, { methods: ['GET', 'POST'] });

module.exports = handler;
module.exports.handleEvolinkStatus = handleEvolinkStatus;
module.exports.handleXaiStatus = handleXaiStatus;
