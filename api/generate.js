const {
    withMiddleware,
    resolveOpenRouterApiKey,
    resolveXaiApiKey,
    resolveEvolinkApiKey,
} = require('./_middleware');
const {
    normalizeModelId,
    resolveCapabilities,
    getMaxInputImages,
    getApiKey,
    getInputConstraints,
    getOutputConstraints,
} = require('./model-catalog');
const {
    normalizeInputImages,
    validateRequiredInputImages,
    normalizeExactImageSize,
} = require('./generation-routing');
const { handleEvolink } = require('./providers/evolink');
const { handleEvolinkVideo } = require('./providers/evolink-video');
const { handleXai } = require('./providers/xai');
const { handleOpenRouter } = require('./providers/openrouter');
const { handleOpenRouterVideo } = require('./providers/openrouter-video');

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
        output_format,
        xai_video_length,
        xai_video_quality,
        generate_audio_switch,
        content_filter_switch,
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

    const promptMaxLength = getInputConstraints(model).promptMaxLength;
    if (Number.isInteger(promptMaxLength) && Array.from(normalizedPrompt).length > promptMaxLength) {
        return res.status(400).json({ error: `Prompt must be ${promptMaxLength} characters or fewer for this model` });
    }

    const parsedNumImages = parseInt(num_images, 10);
    const maxOutputImages = getOutputConstraints(model).maxImages;
    if (!Number.isInteger(parsedNumImages) || parsedNumImages < 1 || parsedNumImages > maxOutputImages) {
        return res.status(400).json({ error: `\`num_images\` must be an integer between 1 and ${maxOutputImages}` });
    }

    const exactSizeResult = normalizeExactImageSize(model, image_size);
    if (exactSizeResult?.error) {
        return res.status(400).json({ error: exactSizeResult.error });
    }

    const modelCaps = resolveCapabilities(model);
    const requiredApiKey = getApiKey(model);

    const openRouterApiKey = resolveOpenRouterApiKey(req);
    const xaiKey = resolveXaiApiKey(req);
    const evolinkKey = resolveEvolinkApiKey(req);

    const apiKeys = {
        openrouter: openRouterApiKey,
        xai: xaiKey,
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
        exactImageSize: exactSizeResult?.value || null,
        resolution,
        output_format,
        normalizedInputImages,
        xai_video_length,
        xai_video_quality,
        generate_audio_switch,
        content_filter_switch,
        enable_web_search,
        flashhead_voice,
        flashhead_stability,
        openRouterApiKey,
        xaiKey,
        evolinkKey,
    };

    switch (modelCaps.backend) {
        case 'evolink':
            return handleEvolink(ctx);
        case 'evolink-video':
            return handleEvolinkVideo(ctx);
        case 'xai':
            return handleXai(ctx);
        case 'openrouter-video':
            return handleOpenRouterVideo(ctx);
        case 'openrouter':
        default:
            return handleOpenRouter(ctx);
    }
});
