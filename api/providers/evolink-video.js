const { redactKey } = require('../_middleware');
const { resolveCapabilities, getVideoPricePerSecond, evolinkCreditsToUsd } = require('../model-catalog');
const { formatEvolinkError } = require('./format-errors');

const EVOLINK_VIDEO_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive']);
const EVOLINK_VIDEO_QUALITIES = ['480p', '720p', '1080p'];

function normalizeVideoAspectRatio(ratio, fallback = 'adaptive') {
    if (typeof ratio === 'string' && EVOLINK_VIDEO_ASPECT_RATIOS.has(ratio)) return ratio;
    return fallback;
}

function normalizeVideoDuration(value, limits) {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= limits.min && parsed <= limits.max) return parsed;
    return limits.default;
}

function normalizeVideoQuality(value, options, fallback) {
    if (typeof value === 'string' && options.includes(value)) return value;
    return fallback;
}

/**
 * Evolink video routes bill per second of output at a rate that varies by
 * resolution (e.g. Seedance 2.0 is 480p $0.092/s, 720p $0.199/s, 1080p $0.496/s).
 */
function estimateVideoCost(model, duration, quality) {
    const pricePerSecond = getVideoPricePerSecond(model, quality);
    if (!Number.isFinite(pricePerSecond) || !Number.isFinite(duration)) return 0;
    return pricePerSecond * duration;
}

/**
 * Evolink Seedance 2.0 video (text-to-video and image-to-video).
 * Async: create a task, return 202 + request_id so the client polls /api/video-status?provider=evolink.
 */
async function handleEvolinkVideo(ctx) {
    const {
        res,
        model,
        modelCaps,
        prompt,
        normalizedInputImages,
        normalizedAspectRatio,
        xai_video_length,
        xai_video_quality,
        generate_audio_switch,
        enable_web_search,
        evolinkKey,
    } = ctx;

    const caps = modelCaps || resolveCapabilities(model);
    const evolink = caps.evolink || {};
    const apiModel = evolink.apiModel || 'seedance-2.0-text-to-video';
    const videoUi = caps.ui || {};
    const isImageToVideo = caps.type === 'image-to-video';

    if (isImageToVideo && (!Array.isArray(normalizedInputImages) || normalizedInputImages.length === 0)) {
        return res.status(400).json({
            error: 'This image-to-video model requires at least one attached image. Attach a start frame and try again.',
        });
    }

    const evolinkHeaders = {
        Authorization: `Bearer ${evolinkKey}`,
        'Content-Type': 'application/json',
    };

    const uploadEvolinkReferenceImage = async (dataUrl, index) => {
        const uploadResponse = await fetch('https://files-api.evolink.ai/api/v1/files/upload/base64', {
            method: 'POST',
            headers: evolinkHeaders,
            body: JSON.stringify({
                base64_data: dataUrl,
                file_name: `seedance-frame-${Date.now()}-${index + 1}.jpg`,
            }),
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            const formatted = formatEvolinkError(errorText, 'Failed to upload frame image to Evolink');
            const error = new Error(formatted.details || formatted.error);
            error.status = uploadResponse.status;
            error.payload = formatted;
            throw error;
        }

        const uploadData = await uploadResponse.json();
        const fileUrl = uploadData?.data?.file_url || uploadData?.data?.download_url || uploadData?.file_url;
        if (!fileUrl || typeof fileUrl !== 'string') {
            const error = new Error('Evolink file upload did not return a usable image URL');
            error.status = 502;
            error.payload = { error: error.message };
            throw error;
        }
        return fileUrl;
    };

    try {
        // Seedance 2.0 i2v accepts 1 image (first frame) or 2 images (first + last frame).
        const imageUrls = isImageToVideo
            ? await Promise.all(normalizedInputImages.slice(0, 2).map(uploadEvolinkReferenceImage))
            : [];

        const durationLimits = videoUi.videoLength || { min: 4, max: 15, default: 5 };
        const duration = normalizeVideoDuration(xai_video_length, durationLimits);
        const qualityOptions = videoUi.videoQuality?.options || EVOLINK_VIDEO_QUALITIES;
        const quality = normalizeVideoQuality(
            xai_video_quality,
            qualityOptions,
            videoUi.videoQuality?.default || '720p',
        );
        // Some Evolink video models (e.g. HappyHorse 1.0 i2v) derive the aspect ratio from
        // the first frame and reject aspect_ratio/generate_audio; only send them when supported.
        const supportsAspectRatio = videoUi.aspectRatio === true;
        const supportsGenerateAudio = evolink.supportsGenerateAudio === true;

        const payload = {
            model: apiModel,
            prompt: prompt.trim(),
            duration,
            quality,
            ...(supportsAspectRatio
                ? {
                      aspect_ratio: normalizeVideoAspectRatio(
                          normalizedAspectRatio,
                          evolink.defaultAspectRatio || '16:9',
                      ),
                  }
                : {}),
            ...(supportsGenerateAudio ? { generate_audio: generate_audio_switch !== false } : {}),
            ...(isImageToVideo ? { image_urls: imageUrls } : {}),
            ...(!isImageToVideo && evolink.supportsWebSearch && enable_web_search === true
                ? { model_params: { web_search: true } }
                : {}),
        };

        const createResponse = await fetch('https://api.evolink.ai/v1/videos/generations', {
            method: 'POST',
            headers: evolinkHeaders,
            body: JSON.stringify(payload),
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            const formatted = formatEvolinkError(errorText, 'Failed to start video generation via Evolink');
            return res.status(createResponse.status).json(formatted);
        }

        const createData = await createResponse.json();
        const taskId = createData?.id || createData?.task_id || createData?.data?.id;
        if (!taskId) {
            return res.status(502).json({ error: 'Evolink video request did not return a task ID' });
        }

        const creditsReserved = createData?.usage?.credits_reserved ?? null;
        // Evolink reserves the exact credits it will charge; fall back to the
        // catalog per-second rate for the requested resolution.
        const estimatedCost = evolinkCreditsToUsd(creditsReserved) ?? estimateVideoCost(model, duration, quality);
        const request = {
            index: 0,
            request_id: taskId,
            estimated_cost: estimatedCost,
            usage_estimated: true,
        };
        return res.status(202).json({
            status: 'pending',
            request_id: taskId,
            provider: 'evolink',
            model,
            media_type: 'video',
            estimated_cost: estimatedCost,
            requests: [request],
            meta: {
                total_usage: estimatedCost,
                usage_pending: true,
                requests: [{
                    model,
                    provider_name: 'evolink',
                    generation_id: taskId,
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
        if (error?.payload) {
            return res.status(error.status || 502).json(error.payload);
        }
        console.error('Evolink video API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    handleEvolinkVideo,
    normalizeVideoAspectRatio,
    normalizeVideoDuration,
    normalizeVideoQuality,
    estimateVideoCost,
};
