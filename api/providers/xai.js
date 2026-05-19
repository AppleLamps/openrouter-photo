const { redactKey } = require('../_middleware');
const { resolveCapabilities, getModelPricing } = require('../model-catalog');

function extractXaiImageUrls(payload) {
    const images = [];
    const dataArray = Array.isArray(payload?.data) ? payload.data : null;
    const candidates = dataArray || (Array.isArray(payload?.images) ? payload.images : []);

    if (Array.isArray(candidates)) {
        candidates.forEach((item) => {
            const base64 = item?.b64_json || item?.b64 || item?.image_base64 || null;
            const url = item?.url || item?.image_url || item?.imageUrl || null;
            if (base64) {
                images.push(`data:image/png;base64,${base64}`);
            } else if (url) {
                images.push(url);
            }
        });
    }

    const singleBase64 = payload?.b64_json || payload?.image;
    if (singleBase64 && images.length === 0) {
        images.push(`data:image/png;base64,${singleBase64}`);
    }

    const singleUrl = payload?.url || payload?.image_url || payload?.imageUrl;
    if (singleUrl && images.length === 0) {
        images.push(singleUrl);
    }

    return images;
}

async function handleXai(ctx) {
    const {
        res,
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        resolution,
        normalizedInputImages,
        xai_video_length,
        xai_video_quality,
        xaiKey,
    } = ctx;

    const modelCaps = resolveCapabilities(model);
    const pricing = getModelPricing(model);
    const isXaiImageModel = modelCaps.type === 'image';
    const isXaiVideoModel = modelCaps.type === 'text-to-video';
    const xaiPrompt = prompt.trim();
    const xaiHeaders = {
        Authorization: `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
    };

    try {
        if (isXaiImageModel) {
            const normalizedXaiAspectRatio =
                typeof normalizedAspectRatio === 'string' && normalizedAspectRatio.trim() !== ''
                    ? normalizedAspectRatio.trim()
                    : null;
            const normalizedXaiResolution =
                typeof resolution === 'string' && ['1K', '2K'].includes(resolution)
                    ? resolution.toLowerCase()
                    : null;

            const xaiPayload = {
                model,
                prompt: xaiPrompt,
                response_format: 'b64_json',
                n: parsedNumImages,
                ...(normalizedXaiAspectRatio ? { aspect_ratio: normalizedXaiAspectRatio } : {}),
                ...(normalizedXaiResolution ? { resolution: normalizedXaiResolution } : {}),
            };

            let xaiEndpoint = 'https://api.x.ai/v1/images/generations';
            if (normalizedInputImages.length > 0) {
                xaiEndpoint = 'https://api.x.ai/v1/images/edits';
                if (normalizedInputImages.length === 1) {
                    xaiPayload.image = { type: 'image_url', url: normalizedInputImages[0] };
                } else {
                    xaiPayload.images = normalizedInputImages.map((url) => ({
                        type: 'image_url',
                        url,
                    }));
                }
            }

            const response = await fetch(xaiEndpoint, {
                method: 'POST',
                headers: xaiHeaders,
                body: JSON.stringify(xaiPayload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return res.status(response.status).json({
                    error: 'Failed to generate image',
                    details: redactKey(errorText),
                });
            }

            const data = await response.json();
            const images = extractXaiImageUrls(data);
            if (images.length === 0) {
                return res.status(502).json({ error: 'No images returned from xAI' });
            }

            const hasInputImage = normalizedInputImages.length > 0;
            const inputImageCost = hasInputImage ? (pricing.inputImageCost || 0) : 0;
            const perImageOutputCost = pricing.perImageOutput || 0.02;
            const actualCount = Math.min(images.length, parsedNumImages);
            const totalCost = (perImageOutputCost * actualCount) + inputImageCost;

            return res.status(200).json({
                images: images.slice(0, parsedNumImages).map((url) => ({
                    url,
                    model,
                    cost: perImageOutputCost,
                    provider: 'xai',
                })),
                meta: {
                    total_usage: totalCost,
                    requests: [],
                    usage_pending: false,
                },
            });
        }

        if (isXaiVideoModel) {
            const videoUi = modelCaps.ui || {};
            const durationLimits = videoUi.videoLength || { min: 1, max: 15, default: 5 };
            const parsedDuration = parseInt(xai_video_length, 10);
            const normalizedDuration =
                Number.isFinite(parsedDuration)
                && parsedDuration >= durationLimits.min
                && parsedDuration <= durationLimits.max
                    ? parsedDuration
                    : durationLimits.default;

            const validResolutions = videoUi.videoQuality?.options || ['480p', '720p', '1080p'];
            const normalizedResolution =
                typeof xai_video_quality === 'string' && validResolutions.includes(xai_video_quality)
                    ? xai_video_quality
                    : (videoUi.videoQuality?.default || '720p');

            const normalizedXaiAspectRatio =
                typeof normalizedAspectRatio === 'string' && normalizedAspectRatio.trim() !== ''
                    ? normalizedAspectRatio.trim()
                    : null;

            const startPayload = {
                model,
                prompt: xaiPrompt,
                duration: normalizedDuration,
                resolution: normalizedResolution,
                ...(normalizedXaiAspectRatio ? { aspect_ratio: normalizedXaiAspectRatio } : {}),
            };

            if (normalizedInputImages.length > 0) {
                startPayload.image_url = normalizedInputImages[0];
            }

            const startResponse = await fetch('https://api.x.ai/v1/videos/generations', {
                method: 'POST',
                headers: xaiHeaders,
                body: JSON.stringify(startPayload),
            });

            if (!startResponse.ok) {
                const errorText = await startResponse.text();
                return res.status(startResponse.status).json({
                    error: 'Failed to start video generation',
                    details: redactKey(errorText),
                });
            }

            const startData = await startResponse.json();
            const requestId = startData?.request_id || startData?.requestId || startData?.id;
            if (!requestId) {
                return res.status(502).json({ error: 'xAI video request did not return a request ID' });
            }

            const hasInputImage = normalizedInputImages.length > 0;
            const inputImageCost = hasInputImage ? (pricing.inputImageCost || 0) : 0;
            const outputVideoCost = normalizedDuration * (pricing.perSecondOutput || 0.05);
            const videoCost = outputVideoCost + inputImageCost;

            return res.status(202).json({
                status: 'pending',
                request_id: requestId,
                model,
                estimated_cost: videoCost,
            });
        }
    } catch (error) {
        console.error('xAI API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }

    return res.status(400).json({ error: 'Unsupported xAI model type' });
}

module.exports = { handleXai };
