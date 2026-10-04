const { redactKey } = require('../_middleware');
const {
    getEvolinkConfig,
    getImageOutputPrice,
    getInputImagePrice,
    getResolutionMultiplier,
    evolinkCreditsToUsd,
} = require('../model-catalog');
const { formatEvolinkError } = require('./format-errors');
const { buildEvolinkProxyUrl } = require('./evolink-task');

const EVOLINK_SEEDREAM_ASPECT_RATIOS = new Set(['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const Z_IMAGE_TURBO_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '1:2', '2:1']);
const Z_IMAGE_ASPECT_FALLBACK = {
    '21:9': '16:9',
    '9:21': '9:16',
    '4:5': '3:4',
    '5:4': '4:3',
    auto: '1:1',
};

// GPT Image 2.5 accepts `auto`, 15 aspect ratios, or explicit WxH pixels.
const GPT_IMAGE_ASPECT_RATIOS = new Set([
    'auto', '1:1', '1:2', '2:1', '1:3', '3:1', '2:3', '3:2', '3:4', '4:3',
    '4:5', '5:4', '9:16', '16:9', '9:21', '21:9',
]);
const GPT_IMAGE_RESOLUTIONS = ['1K', '2K', '4K'];
const GPT_IMAGE_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max'];
const GPT_IMAGE_1K_PIXELS = 1048576;

function normalizeZImageAspectRatio(ratio) {
    if (Z_IMAGE_TURBO_ASPECT_RATIOS.has(ratio)) return ratio;
    return Z_IMAGE_ASPECT_FALLBACK[ratio] || '1:1';
}

/**
 * Estimated cost of one Evolink image task, in USD.
 * Evolink bills the generated image at its quality tier and, on models such as
 * Seedream 5.0 Pro, each reference image on top of that. Token-billed models
 * (GPT Image 2.5) additionally scale with the resolution tier; `resolution`
 * is ignored for models without `resolutionMultipliers` in the catalog.
 */
function getEvolinkImageCostPerImage(model, { quality, resolution, inputImageCount = 0 } = {}) {
    const outputPrice = getImageOutputPrice(model, quality, resolution);
    const billableInputs = Number.isFinite(inputImageCount) && inputImageCount > 0
        ? Math.floor(inputImageCount)
        : 0;
    return outputPrice + (getInputImagePrice(model) * billableInputs);
}

function normalizeSeedreamQuality(resolution, qualityOptions, qualityDefault) {
    const options = Array.isArray(qualityOptions) && qualityOptions.length > 0
        ? qualityOptions
        : ['2K', '4K'];
    if (options.includes(resolution)) return resolution;
    return options.includes(qualityDefault) ? qualityDefault : options[0];
}

// Seedream 5.0 Pro tiers by output pixel count: 1K presets sit near 1024x1024
// (~1.05M px) and 2K presets near 2048x2048 (~4.19M px).
const SEEDREAM_2K_PIXEL_THRESHOLD = 2097152;

/**
 * The quality tier Evolink bills for. When an exact WxH size is requested the
 * `quality` field is omitted from the payload and Evolink derives the tier from
 * the pixel count, so mirror that here instead of using the UI resolution.
 */
function resolveBilledQuality({ exactImageSize, resolution, qualityOptions, qualityDefault }) {
    if (typeof exactImageSize === 'string' && exactImageSize) {
        const [width, height] = exactImageSize.split('x').map((value) => parseInt(value, 10));
        if (Number.isFinite(width) && Number.isFinite(height)) {
            return width * height >= SEEDREAM_2K_PIXEL_THRESHOLD ? '2K' : '1K';
        }
    }
    return normalizeSeedreamQuality(resolution, qualityOptions, qualityDefault);
}

function normalizeSeedreamOutputFormat(outputFormat, outputFormatOptions) {
    const options = Array.isArray(outputFormatOptions) ? outputFormatOptions : [];
    return typeof outputFormat === 'string' && options.includes(outputFormat)
        ? outputFormat
        : null;
}

function buildSeedreamPayload({
    apiModel,
    prompt,
    parsedNumImages,
    normalizedAspectRatio,
    exactImageSize,
    resolution,
    uploadedImageUrls,
    qualityOptions,
    qualityDefault,
    outputFormat,
    outputFormatOptions,
    enableWebSearch = false,
}) {
    const quality = normalizeSeedreamQuality(resolution, qualityOptions, qualityDefault);
    const normalizedSize = EVOLINK_SEEDREAM_ASPECT_RATIOS.has(normalizedAspectRatio)
        ? normalizedAspectRatio
        : 'auto';
    const supportsWebSearch = apiModel === 'doubao-seedream-5.0-lite';
    const normalizedOutputFormat = normalizeSeedreamOutputFormat(outputFormat, outputFormatOptions);
    const modelParams = {
        ...(normalizedOutputFormat ? { output_format: normalizedOutputFormat } : {}),
        ...(supportsWebSearch && enableWebSearch ? { tools: [{ type: 'web_search' }] } : {}),
    };

    return {
        model: apiModel,
        prompt: prompt.trim(),
        n: parsedNumImages,
        size: exactImageSize || normalizedSize,
        ...(!exactImageSize ? { quality } : {}),
        prompt_priority: 'standard',
        ...(uploadedImageUrls.length > 0 ? { image_urls: uploadedImageUrls } : {}),
        ...(Object.keys(modelParams).length > 0 ? { model_params: modelParams } : {}),
    };
}

function buildZImageTurboPayload({ apiModel, prompt, normalizedAspectRatio }) {
    return {
        model: apiModel,
        prompt: prompt.trim(),
        size: normalizeZImageAspectRatio(normalizedAspectRatio),
        nsfw_check: false,
    };
}

function normalizeGptImageAspectRatio(ratio) {
    return GPT_IMAGE_ASPECT_RATIOS.has(ratio) ? ratio : 'auto';
}

function normalizeGptImageResolution(resolution, resolutionOptions, resolutionDefault) {
    const options = Array.isArray(resolutionOptions) && resolutionOptions.length > 0
        ? resolutionOptions
        : GPT_IMAGE_RESOLUTIONS;
    const candidate = typeof resolution === 'string' ? resolution.toUpperCase() : '';
    if (options.includes(candidate)) return candidate;
    return options.includes(resolutionDefault) ? resolutionDefault : options[0];
}

function normalizeGptImageQuality(quality, qualityOptions, qualityDefault) {
    const options = Array.isArray(qualityOptions) && qualityOptions.length > 0
        ? qualityOptions
        : GPT_IMAGE_QUALITIES;
    const candidate = typeof quality === 'string' ? quality.toLowerCase() : '';
    if (options.includes(candidate)) return candidate;
    if (options.includes(qualityDefault)) return qualityDefault;
    return options.includes('medium') ? 'medium' : options[0];
}

/**
 * Resolution tier GPT Image 2.5 is billed at. In ratio mode the requested tier
 * applies; `auto` lets the model pick (we assume 1K); explicit WxH sizes bill
 * by pixel count, so pick the tier whose pixel budget the request lands in.
 */
function resolveGptImageBilledResolution({ exactImageSize, size, resolution }) {
    if (typeof exactImageSize === 'string' && exactImageSize) {
        const [width, height] = exactImageSize.split('x').map((value) => parseInt(value, 10));
        if (Number.isFinite(width) && Number.isFinite(height)) {
            const pixels = width * height;
            if (pixels > GPT_IMAGE_1K_PIXELS * 4) return '4K';
            if (pixels > GPT_IMAGE_1K_PIXELS) return '2K';
        }
        return '1K';
    }
    if (size === 'auto') return '1K';
    return resolution;
}

/**
 * Payload for the GPT Image 2.5 route (gpt-image-2.5-sunburst / -flare).
 * Shares the Seedream endpoint but not its fields: `resolution` only applies in
 * ratio mode, `quality` is a rendering tier (low…max), and output format is a
 * top-level field rather than `model_params`.
 */
function buildGptImagePayload({
    apiModel,
    prompt,
    normalizedAspectRatio,
    exactImageSize,
    resolution,
    resolutionOptions,
    resolutionDefault,
    imageQuality,
    qualityOptions,
    qualityDefault,
    uploadedImageUrls = [],
    outputFormat,
    outputFormatOptions,
}) {
    const size = exactImageSize || normalizeGptImageAspectRatio(normalizedAspectRatio);
    const ratioMode = !exactImageSize && size !== 'auto';
    const normalizedOutputFormat = normalizeSeedreamOutputFormat(outputFormat, outputFormatOptions);

    return {
        model: apiModel,
        prompt: prompt.trim(),
        n: 1,
        size,
        ...(ratioMode ? { resolution: normalizeGptImageResolution(resolution, resolutionOptions, resolutionDefault) } : {}),
        quality: normalizeGptImageQuality(imageQuality, qualityOptions, qualityDefault),
        ...(normalizedOutputFormat ? { output_format: normalizedOutputFormat } : {}),
        ...(uploadedImageUrls.length > 0 ? { image_urls: uploadedImageUrls } : {}),
    };
}

async function handleEvolink(ctx) {
    const {
        res,
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        exactImageSize,
        resolution,
        image_quality,
        output_format,
        normalizedInputImages,
        enable_web_search,
        evolinkKey,
    } = ctx;

    const evolinkConfig = getEvolinkConfig(model);
    if (!evolinkConfig) {
        return res.status(500).json({ error: 'Evolink model configuration is missing' });
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
                file_name: `reference-${Date.now()}-${index + 1}.jpg`,
            }),
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            const formatted = formatEvolinkError(errorText, 'Failed to upload reference image to Evolink');
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

    const createTask = async (payload, index) => {
        const createResponse = await fetch('https://api.evolink.ai/v1/images/generations', {
            method: 'POST',
            headers: evolinkHeaders,
            body: JSON.stringify(payload),
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            return {
                error: {
                    status: createResponse.status,
                    payload: formatEvolinkError(errorText, 'Failed to start image generation via Evolink'),
                },
                index,
            };
        }

        const createData = await createResponse.json();
        const taskId = createData?.id || createData?.task_id || createData?.data?.id;
        if (!taskId) {
            return {
                error: {
                    status: 502,
                    payload: { error: 'Evolink request did not return a task ID' },
                },
                index,
            };
        }
        return {
            createData,
            taskId,
            index,
        };
    };

    try {
        const {
            variant,
            apiModel,
            qualityOptions,
            qualityDefault,
            outputFormatOptions,
            qualityTierOptions,
            qualityTierDefault,
        } = evolinkConfig;
        const isGptImage = variant === 'gpt-image';
        const gptImageQuality = isGptImage
            ? normalizeGptImageQuality(image_quality, qualityTierOptions, qualityTierDefault)
            : null;
        const gptImageResolution = isGptImage
            ? resolveGptImageBilledResolution({
                exactImageSize,
                size: normalizeGptImageAspectRatio(normalizedAspectRatio),
                resolution: normalizeGptImageResolution(resolution, qualityOptions, qualityDefault),
            })
            : null;
        const costPerImage = getEvolinkImageCostPerImage(model, {
            quality: isGptImage
                ? gptImageQuality
                : resolveBilledQuality({ exactImageSize, resolution, qualityOptions, qualityDefault }),
            resolution: gptImageResolution,
            // Every task uploads its own copy of the reference set, and Evolink
            // bills each billable input image per task.
            inputImageCount: variant === 'z-image-turbo' ? 0 : normalizedInputImages.length,
        });

        const taskResults = await Promise.all(Array.from({ length: parsedNumImages }, async (_, index) => {
            // Each output is a separate Evolink task. Upload an independent
            // reference set for every task so concurrent edits cannot consume
            // or otherwise interfere with a shared set of uploaded URLs.
            const uploadedImageUrls = normalizedInputImages.length > 0
                ? await Promise.all(normalizedInputImages.map((dataUrl, imageIndex) => (
                    uploadEvolinkReferenceImage(dataUrl, (index * normalizedInputImages.length) + imageIndex)
                )))
                : [];
            let payload;
            if (variant === 'z-image-turbo') {
                payload = buildZImageTurboPayload({ apiModel, prompt, normalizedAspectRatio });
            } else if (isGptImage) {
                payload = buildGptImagePayload({
                    apiModel,
                    prompt,
                    normalizedAspectRatio,
                    exactImageSize,
                    resolution,
                    resolutionOptions: qualityOptions,
                    resolutionDefault: qualityDefault,
                    imageQuality: image_quality,
                    qualityOptions: qualityTierOptions,
                    qualityDefault: qualityTierDefault,
                    uploadedImageUrls,
                    outputFormat: output_format,
                    outputFormatOptions,
                });
            } else {
                payload = buildSeedreamPayload({
                    apiModel,
                    prompt,
                    parsedNumImages: 1,
                    normalizedAspectRatio,
                    exactImageSize,
                    resolution,
                    uploadedImageUrls,
                    qualityOptions,
                    qualityDefault,
                    outputFormat: output_format,
                    outputFormatOptions,
                    enableWebSearch: enable_web_search === true,
                });
            }
            return createTask(payload, index);
        }));

        const requests = taskResults
            .filter((result) => !result.error)
            .map((result) => {
                const creditsReserved = result.createData?.usage?.credits_reserved ?? null;
                // Evolink reserves the exact credits it will charge, so prefer that
                // over the catalog price whenever the create response carries it.
                const reservedCost = evolinkCreditsToUsd(creditsReserved);
                return {
                    index: result.index,
                    request_id: result.taskId,
                    estimated_cost: reservedCost ?? costPerImage,
                    credits_reserved: creditsReserved,
                    usage_estimated: true,
                };
            });
        const errors = taskResults
            .filter((result) => result.error)
            .map((result) => ({
                index: result.index,
                error: result.error.payload?.details || result.error.payload?.error || 'Failed to start Evolink image task',
            }));

        if (requests.length === 0) {
            const firstError = taskResults.find((result) => result.error)?.error;
            return res.status(firstError?.status || 502).json(firstError?.payload || { error: 'Failed to start Evolink image generation' });
        }

        const response = {
            status: 'pending',
            provider: 'evolink',
            model,
            media_type: 'image',
            requests,
            meta: {
                total_usage: requests.reduce((sum, request) => sum + request.estimated_cost, 0),
                usage_pending: true,
                requests: requests.map((request) => ({
                    model,
                    provider_name: 'evolink',
                    generation_id: request.request_id,
                    usage: request.estimated_cost,
                    imageCount: 0,
                    delivered_count: 0,
                    usage_pending: true,
                    usage_estimated: true,
                    media_type: 'image',
                })),
            },
            ...(errors.length > 0 ? { errors } : {}),
        };
        if (requests.length === 1 && errors.length === 0) {
            response.request_id = requests[0].request_id;
            response.estimated_cost = requests[0].estimated_cost;
        }
        return res.status(202).json(response);
    } catch (error) {
        if (error?.payload) {
            return res.status(error.status || 502).json(error.payload);
        }
        console.error('Evolink API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    handleEvolink,
    buildSeedreamPayload,
    buildZImageTurboPayload,
    buildGptImagePayload,
    buildEvolinkProxyUrl,
    getEvolinkImageCostPerImage,
    resolveBilledQuality,
    resolveGptImageBilledResolution,
    normalizeZImageAspectRatio,
    normalizeGptImageAspectRatio,
    normalizeGptImageResolution,
    normalizeGptImageQuality,
    normalizeSeedreamQuality,
    normalizeSeedreamOutputFormat,
};
