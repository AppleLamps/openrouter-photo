const {
    withMiddleware,
    resolveOpenRouterApiKey,
    resolveXaiApiKey,
    resolveFalApiKey,
    resolveEvolinkApiKey,
} = require('./_middleware');
const {
    normalizeModelId,
    resolveCapabilities,
    getMaxInputImages,
    getApiKey,
} = require('./model-catalog');
const {
    normalizeInputImages,
    validateRequiredInputImages,
} = require('./generation-routing');
const { handleEvolink } = require('./providers/evolink');
const { handleFalImage } = require('./providers/fal-image');
const { handleFalVideo } = require('./providers/fal-video');
const { handleXai } = require('./providers/xai');
const { handleOpenRouter } = require('./providers/openrouter');

const imageSizePresetToAspectRatio = (preset) => {
    switch (preset) {
        case 'portrait_4_3':
            return '3:4';
        case 'portrait_16_9':
            return '9:16';
        case 'landscape_4_3':
            return '4:3';
        case 'landscape_16_9':
            return '16:9';
        case 'square':
        case 'square_hd':
        default:
            return '1:1';
    }
};

const API_KEY_HELP = {
    openrouter: {
        code: 'OPENROUTER_API_KEY_REQUIRED',
        error: 'OpenRouter API key required',
        help: {
            message: 'Open Settings → paste your OpenRouter API key. Create one at openrouter.ai/keys.',
            url: 'https://openrouter.ai/keys',
        },
    },
    xai: {
        code: 'XAI_API_KEY_REQUIRED',
        error: 'xAI API key required',
        help: {
            message: 'Open Settings → paste your xAI API key. Create one at console.x.ai.',
            url: 'https://console.x.ai',
        },
    },
    fal: {
        code: 'FAL_API_KEY_REQUIRED',
        error: 'Fal API key required',
        help: {
            message: 'Open Settings → paste your Fal API key. Create one at fal.ai/dashboard/keys.',
            url: 'https://fal.ai/dashboard/keys',
        },
    },
    evolink: {
        code: 'EVOLINK_API_KEY_REQUIRED',
        error: 'Evolink API key required',
        help: {
            message: 'Open Settings, paste your Evolink API key, then try again.',
            url: 'https://evolink.ai/dashboard/keys',
        },
    },
};

module.exports = withMiddleware(async function handler(req, res) {
    const {
        prompt,
        model: requestedModel = 'black-forest-labs/flux.2-pro',
        num_images = 1,
        aspect_ratio,
        image_size,
        resolution,
        xai_video_length,
        xai_video_quality,
        generate_audio_switch,
        enable_web_search,
        flashhead_voice,
        flashhead_stability,
        image_urls = [],
    } = req.body;

    const model = normalizeModelId(requestedModel);

    const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';

    if (!normalizedPrompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const parsedNumImages = parseInt(num_images, 10);
    if (!Number.isInteger(parsedNumImages) || parsedNumImages < 1 || parsedNumImages > 4) {
        return res.status(400).json({ error: '`num_images` must be an integer between 1 and 4' });
    }

    const modelCaps = resolveCapabilities(model);
    const requiredApiKey = getApiKey(model);

    const openRouterApiKey = resolveOpenRouterApiKey(req);
    const xaiKey = resolveXaiApiKey(req);
    const falKey = resolveFalApiKey(req);
    const evolinkKey = resolveEvolinkApiKey(req);

    const apiKeys = {
        openrouter: openRouterApiKey,
        xai: xaiKey,
        fal: falKey,
        evolink: evolinkKey,
    };

    if (!apiKeys[requiredApiKey]) {
        const help = API_KEY_HELP[requiredApiKey];
        if (help) {
            return res.status(401).json(help);
        }
    }

    const normalizedAspectRatio =
        typeof aspect_ratio === 'string' && aspect_ratio.trim() !== ''
            ? aspect_ratio.trim()
            : imageSizePresetToAspectRatio(image_size);

    const maxInputImages = getMaxInputImages(model);
    const normalizedInputImages = normalizeInputImages(image_urls, maxInputImages);

    const inputError = validateRequiredInputImages(model, image_urls);
    if (inputError) {
        return res.status(inputError.status).json({ error: inputError.error });
    }

    const ctx = {
        req,
        res,
        model,
        modelCaps,
        prompt: normalizedPrompt,
        parsedNumImages,
        normalizedAspectRatio,
        resolution,
        normalizedInputImages,
        xai_video_length,
        xai_video_quality,
        generate_audio_switch,
        enable_web_search,
        flashhead_voice,
        flashhead_stability,
        openRouterApiKey,
        xaiKey,
        falKey,
        evolinkKey,
    };

    switch (modelCaps.backend) {
        case 'evolink':
            return handleEvolink(ctx);
        case 'fal-image':
            return handleFalImage(ctx);
        case 'fal-video':
            return handleFalVideo(ctx);
        case 'xai':
            return handleXai(ctx);
        case 'openrouter':
        default:
            return handleOpenRouter(ctx);
    }
});
