const { withMiddleware, redactKey, resolveXaiApiKey, resolveFalApiKey } = require('./_middleware');
const { getFalVideoModel } = require('./model-registry');

const DEFAULT_FAL_VIDEO_MODEL = 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video';

const normalizeStringParam = (value) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    return trimmed || null;
};

const resolveFalVideoModelId = (value) => {
    switch (normalizeStringParam(value)) {
        case 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video':
            return 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video';
        case 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video':
            return 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video';
        case 'fal-ai/bytedance/seedance-2.0/text-to-video':
            return 'fal-ai/bytedance/seedance-2.0/text-to-video';
        case 'fal-ai/bytedance/seedance-2.0/image-to-video':
            return 'fal-ai/bytedance/seedance-2.0/image-to-video';
        case 'bytedance/seedance-2.0/text-to-video':
            return 'bytedance/seedance-2.0/text-to-video';
        case 'fal-ai/pixverse/c1/image-to-video':
            return 'fal-ai/pixverse/c1/image-to-video';
        case 'alibaba/happy-horse/reference-to-video':
            return 'alibaba/happy-horse/reference-to-video';
        default:
            return null;
    }
};

const buildUniqueUrls = (urls) => {
    const seen = new Set();
    const out = [];
    for (const url of urls) {
        if (!url || typeof url !== 'string') continue;
        const trimmed = url.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
};

const isTrustedFalQueueUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
        const parsed = new URL(rawUrl);
        return parsed.protocol === 'https:' && parsed.hostname === 'queue.fal.run';
    } catch {
        return false;
    }
};

module.exports = withMiddleware(async function handler(req, res) {
    const input = req.method === 'GET' ? req.query : req.body;
    const requestId = normalizeStringParam(input?.request_id);
    const provider = normalizeStringParam(input?.provider);
    const model = resolveFalVideoModelId(input?.model);

    if (!requestId) {
        return res.status(400).json({ error: 'request_id is required' });
    }

    // ---------- Fal video polling ----------
    if (provider === 'fal') {
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

        const falModel = model && getFalVideoModel(model) ? model : DEFAULT_FAL_VIDEO_MODEL;
        const normalizedFalModel = falModel.startsWith('fal-ai/') ? falModel.slice('fal-ai/'.length) : falModel;

        const fetchFalJsonWithFallback = async (candidateUrls, errorPrefix) => {
            let lastStatus = 502;
            let lastBody = 'No response';
            for (const url of candidateUrls) {
                const resp = await fetch(url, {
                    headers: { Authorization: `Key ${FAL_KEY}` },
                });
                if (resp.ok) {
                    return { ok: true, data: await resp.json() };
                }
                lastStatus = resp.status;
                lastBody = await resp.text();
                // Continue trying alternates for not-found responses.
                if (resp.status !== 404) {
                    break;
                }
            }
            return {
                ok: false,
                status: lastStatus,
                body: lastBody,
                error: errorPrefix,
            };
        };

        const extractFalVideoUrl = (data) => (
            data?.video?.url ||
            data?.url ||
            data?.response?.video?.url ||
            data?.response?.url ||
            data?.data?.video?.url ||
            data?.data?.url ||
            null
        );

        try {
            // Only poll trusted Fal queue endpoints reconstructed from allowlisted model IDs.
            const statusCandidates = buildUniqueUrls([
                `https://queue.fal.run/${falModel}/requests/${encodeURIComponent(requestId)}/status`,
                `https://queue.fal.run/${normalizedFalModel}/requests/${encodeURIComponent(requestId)}/status`,
            ]);
            const statusResult = await fetchFalJsonWithFallback(statusCandidates, 'Failed to retrieve Fal video status');
            if (!statusResult.ok) {
                return res.status(statusResult.status).json({
                    error: statusResult.error,
                    details: redactKey(statusResult.body),
                });
            }

            const statusData = statusResult.data;
            const status = String(statusData?.status || '').toUpperCase();
            const resultBaseUrl = `https://queue.fal.run/${falModel}/requests/${encodeURIComponent(requestId)}`;
            const normalizedResultBaseUrl = `https://queue.fal.run/${normalizedFalModel}/requests/${encodeURIComponent(requestId)}`;
            const resultCandidates = buildUniqueUrls([
                isTrustedFalQueueUrl(statusData?.response_url) ? statusData.response_url : null,
                resultBaseUrl,
                `${resultBaseUrl}/response`,
                normalizedResultBaseUrl,
                `${normalizedResultBaseUrl}/response`,
            ]);

            const result = await fetchFalJsonWithFallback(resultCandidates, 'Failed to retrieve Fal video result');
            if (result.ok) {
                const videoUrl = extractFalVideoUrl(result.data);
                if (videoUrl) {
                    return res.status(200).json({ status: 'completed', url: videoUrl });
                }
            }

            if (status === 'COMPLETED') {
                if (!result.ok) {
                    return res.status(result.status).json({
                        error: result.error,
                        details: redactKey(result.body),
                    });
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
