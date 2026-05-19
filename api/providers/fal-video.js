const { redactKey } = require('../_middleware');
const {
    resolveCapabilities,
    requiresInputImage,
    getFalVideoConfig,
    getFalVideoModel,
} = require('../model-catalog');
const { formatFalError } = require('./format-errors');

const FLASHHEAD_VOICES = new Set([
    'Aria', 'Roger', 'Sarah', 'Laura', 'Charlie', 'George', 'Callum', 'River', 'Liam', 'Charlotte',
    'Alice', 'Matilda', 'Will', 'Jessica', 'Eric', 'Chris', 'Brian', 'Daniel', 'Lily', 'Bill',
]);

function calculateFalVideoCost({
    falVideoConfig,
    variant,
    normalizedDuration,
    normalizedResolution,
    normalizedGenerateAudio,
}) {
    if (variant === 'flashhead') {
        return falVideoConfig?.price || 0;
    }

    if (variant === 'happyHorse' || variant === 'seedance15' || variant === 'seedance20') {
        return normalizedDuration * (falVideoConfig?.pricePerSecond?.[normalizedResolution] || 0);
    }

    if (variant === 'pixverse') {
        const pixverseRateTable = falVideoConfig?.pricePerSecond?.[normalizedGenerateAudio ? 'withAudio' : 'noAudio'];
        const pixverseRate = pixverseRateTable?.[normalizedResolution] || 0;
        return normalizedDuration * pixverseRate;
    }

    return 0;
}

async function handleFalVideo(ctx) {
    const {
        res,
        model,
        prompt,
        normalizedAspectRatio,
        normalizedInputImages,
        xai_video_length,
        xai_video_quality,
        generate_audio_switch,
        flashhead_voice,
        flashhead_stability,
        falKey,
    } = ctx;

    const modelCaps = resolveCapabilities(model);
    const falVideoConfig = getFalVideoModel(model);
    const falVideoCaps = getFalVideoConfig(model) || {};
    const falVideoUi = modelCaps.ui || {};
    const variant = falVideoCaps.variant || null;
    const isHappyHorse = variant === 'happyHorse';
    const isPixverseC1 = variant === 'pixverse';
    const isFlashHead = variant === 'flashhead';
    const isSeedance20 = variant === 'seedance20';

    const parsedDuration = parseInt(xai_video_length, 10);
    const durationLimits = falVideoUi.videoLength || { min: 4, max: 12, default: 5 };
    const normalizedDuration =
        Number.isFinite(parsedDuration)
        && parsedDuration >= durationLimits.min
        && parsedDuration <= durationLimits.max
            ? parsedDuration
            : durationLimits.default;

    const validResolutions = falVideoUi.videoQuality?.options || ['480p', '720p', '1080p'];
    const defaultResolution = falVideoUi.videoQuality?.default || (isHappyHorse ? '1080p' : '720p');
    const normalizedResolution =
        typeof xai_video_quality === 'string' && validResolutions.includes(xai_video_quality)
            ? xai_video_quality
            : defaultResolution;

    const normalizedGenerateAudio =
        typeof generate_audio_switch === 'boolean'
            ? generate_audio_switch
            : Boolean(falVideoCaps.defaultGenerateAudio);

    const validAspectRatios = falVideoCaps.aspectRatios
        || ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto'];
    const falAspectRatio =
        typeof normalizedAspectRatio === 'string' && validAspectRatios.includes(normalizedAspectRatio.trim())
            ? normalizedAspectRatio.trim()
            : (falVideoCaps.defaultAspectRatio || '16:9');

    const isFalImageToVideo = Boolean(falVideoCaps.imageToVideo);

    if (requiresInputImage(model) && normalizedInputImages.length === 0) {
        return res.status(400).json({
            error: 'Image-to-video requires at least one attached image (start frame). Please attach an image and try again.',
        });
    }

    const startImageUrl = normalizedInputImages[0];
    const normalizedFlashHeadVoice =
        typeof flashhead_voice === 'string' && FLASHHEAD_VOICES.has(flashhead_voice)
            ? flashhead_voice
            : 'Aria';
    const parsedFlashHeadStability = Number.parseFloat(flashhead_stability);
    const normalizedFlashHeadStability =
        Number.isFinite(parsedFlashHeadStability)
            ? Math.min(Math.max(parsedFlashHeadStability, 0), 1)
            : 0.5;

    const falVideoPayload = isFlashHead
        ? {
            image_url: startImageUrl,
            text: prompt.trim(),
            voice: normalizedFlashHeadVoice,
            stability: normalizedFlashHeadStability,
            enable_safety_checker: false,
        }
        : {
            prompt: prompt.trim(),
            resolution: normalizedResolution,
            duration: isHappyHorse || isPixverseC1 ? normalizedDuration : String(normalizedDuration),
        };

    if (isPixverseC1) {
        falVideoPayload.generate_audio_switch = normalizedGenerateAudio;
    } else if (!isHappyHorse && !isFlashHead) {
        falVideoPayload.generate_audio = true;
    }

    if (!isPixverseC1 && !isFlashHead) {
        falVideoPayload.aspect_ratio = falAspectRatio;
    }

    if (!isFlashHead && (isPixverseC1 || !isSeedance20 || isHappyHorse)) {
        falVideoPayload.enable_safety_checker = false;
    }

    if (isHappyHorse) {
        falVideoPayload.image_urls = normalizedInputImages;
    } else if (isPixverseC1) {
        falVideoPayload.image_url = startImageUrl;
    } else if (isFalImageToVideo && !isFlashHead) {
        falVideoPayload.image_url = startImageUrl;
        if (normalizedInputImages[1]) {
            falVideoPayload.end_image_url = normalizedInputImages[1];
        }
    }

    try {
        const submitResponse = await fetch(`https://queue.fal.run/${model}`, {
            method: 'POST',
            headers: {
                Authorization: `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(falVideoPayload),
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            return res.status(submitResponse.status).json({
                ...formatFalError(errorText, 'Failed to start video generation via Fal'),
            });
        }

        const submitData = await submitResponse.json();
        const requestId = submitData?.request_id;
        if (!requestId) {
            return res.status(502).json({ error: 'Fal video request did not return a request ID' });
        }

        const videoCost = calculateFalVideoCost({
            falVideoConfig,
            variant,
            normalizedDuration,
            normalizedResolution,
            normalizedGenerateAudio,
        });

        return res.status(202).json({
            status: 'pending',
            request_id: requestId,
            model,
            provider: 'fal',
            estimated_cost: videoCost,
        });
    } catch (error) {
        console.error('Fal video API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { handleFalVideo, calculateFalVideoCost };
