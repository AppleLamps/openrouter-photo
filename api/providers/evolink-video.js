const { redactKey } = require('../_middleware');
const { resolveCapabilities, getModelPricing } = require('../model-catalog');
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

function estimateVideoCost(model, duration) {
    const pricePerSecond = getModelPricing(model)?.pricePerSecond;
    if (pricePerSecond && Number.isFinite(pricePerSecond)) {
        return pricePerSecond * duration;
    }
    return 0;
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
            error: 'Seedance 2.0 requires at least one attached image. Attach a start frame and try again.',
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
        const aspectRatio = normalizeVideoAspectRatio(
            normalizedAspectRatio,
            evolink.defaultAspectRatio || '16:9',
        );
        const generateAudio = generate_audio_switch !== false;

        const payload = {
            model: apiModel,
            prompt: prompt.trim(),
            duration,
            quality,
            aspect_ratio: aspectRatio,
            generate_audio: generateAudio,
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

        return res.status(202).json({
            status: 'pending',
            request_id: taskId,
            provider: 'evolink',
            model,
            estimated_cost: estimateVideoCost(model, duration),
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
