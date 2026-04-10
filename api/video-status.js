const { withMiddleware, redactKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const { request_id, provider, model, fal_status_url, fal_response_url } = req.body;

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
        const normalizedFalModel = falModel.startsWith('fal-ai/') ? falModel.slice('fal-ai/'.length) : falModel;

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

        try {
            // Prefer Fal-provided status URL, then fallback to constructed URLs.
            const statusCandidates = buildUniqueUrls([
                fal_status_url,
                `https://queue.fal.run/${falModel}/requests/${encodeURIComponent(request_id)}/status`,
                `https://queue.fal.run/${normalizedFalModel}/requests/${encodeURIComponent(request_id)}/status`,
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

            if (status === 'COMPLETED') {
                // Use explicit response URL first, then status payload URL, then robust constructed fallbacks.
                const resultBaseUrl = `https://queue.fal.run/${falModel}/requests/${encodeURIComponent(request_id)}`;
                const normalizedResultBaseUrl = `https://queue.fal.run/${normalizedFalModel}/requests/${encodeURIComponent(request_id)}`;
                const resultCandidates = buildUniqueUrls([
                    fal_response_url,
                    statusData?.response_url,
                    resultBaseUrl,
                    `${resultBaseUrl}/response`,
                    normalizedResultBaseUrl,
                    `${normalizedResultBaseUrl}/response`,
                ]);

                const result = await fetchFalJsonWithFallback(resultCandidates, 'Failed to retrieve Fal video result');
                if (!result.ok) {
                    return res.status(result.status).json({
                        error: result.error,
                        details: redactKey(result.body),
                    });
                }

                const resultData = result.data;
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
