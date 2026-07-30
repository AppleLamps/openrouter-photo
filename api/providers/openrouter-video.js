const { redactKey } = require('../_middleware');
const { resolveCapabilities, getVideoPricePerSecond, getInputImagePrice } = require('../model-catalog');

const OPENROUTER_VIDEO_URL = 'https://openrouter.ai/api/v1/videos';
const GROK_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']);

function normalizeDuration(value, limits) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= limits.min && parsed <= limits.max) return parsed;
    return limits.default;
}

function normalizeQuality(value, options, fallback) {
    return typeof value === 'string' && options.includes(value) ? value : fallback;
}

function estimateCost(model, duration, quality, inputImageCount) {
    return (getVideoPricePerSecond(model, quality) * duration)
        + (getInputImagePrice(model) * inputImageCount);
}

function buildPayload({
    model,
    prompt,
    duration,
    quality,
    aspectRatio,
    inputImages,
    supportsAspectRatio,
}) {
    return {
        model,
        prompt,
        duration,
        resolution: quality,
        ...(supportsAspectRatio && GROK_ASPECT_RATIOS.has(aspectRatio) ? { aspect_ratio: aspectRatio } : {}),
        ...(inputImages.length > 0 ? {
            frame_images: [{
                type: 'image_url',
                image_url: { url: inputImages[0] },
                frame_type: 'first_frame',
            }],
        } : {}),
    };
}

async function handleOpenRouterVideo(ctx) {
    const {
        req,
        res,
        model,
        modelCaps,
        prompt,
        normalizedInputImages,
        normalizedAspectRatio,
        xai_video_length,
        xai_video_quality,
        openRouterApiKey,
    } = ctx;

    const caps = modelCaps || resolveCapabilities(model);
    const ui = caps.ui || {};
    const durationLimits = ui.videoLength || { min: 1, max: 15, default: 10 };
    const qualityOptions = ui.videoQuality?.options || ['480p', '720p'];
    const duration = normalizeDuration(xai_video_length, durationLimits);
    const quality = normalizeQuality(xai_video_quality, qualityOptions, ui.videoQuality?.default || '720p');
    const inputImages = Array.isArray(normalizedInputImages) ? normalizedInputImages.slice(0, 1) : [];

    try {
        const response = await fetch(OPENROUTER_VIDEO_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openRouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'http://localhost',
                'X-Title': 'AI Image Generator',
            },
            body: JSON.stringify(buildPayload({
                model,
                prompt,
                duration,
                quality,
                aspectRatio: normalizedAspectRatio,
                inputImages,
                supportsAspectRatio: ui.aspectRatio === true,
            })),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                error: 'Failed to start video generation via OpenRouter',
                details: redactKey(errorText),
            });
        }

        const data = await response.json();
        const requestId = data?.id;
        if (typeof requestId !== 'string' || !requestId) {
            return res.status(502).json({ error: 'OpenRouter video request did not return a job ID' });
        }

        const estimatedCost = estimateCost(model, duration, quality, inputImages.length);
        const request = {
            index: 0,
            request_id: requestId,
            estimated_cost: estimatedCost,
            usage_estimated: true,
            media_type: 'video',
        };

        return res.status(202).json({
            status: 'pending',
            request_id: requestId,
            provider: 'openrouter',
            model,
            media_type: 'video',
            estimated_cost: estimatedCost,
            requests: [request],
            meta: {
                total_usage: estimatedCost,
                usage_pending: true,
                requests: [{
                    model,
                    provider_name: 'openrouter',
                    generation_id: data?.generation_id || requestId,
                    usage: estimatedCost,
                    imageCount: 0,
                    delivered_count: 0,
                    usage_pending: true,
                    usage_estimated: true,
                    media_type: 'video',
                }],
            },
        });
    } catch (error) {
        console.error('OpenRouter video API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    handleOpenRouterVideo,
    buildPayload,
    normalizeDuration,
    normalizeQuality,
    estimateCost,
};
