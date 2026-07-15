const { redactKey } = require('../_middleware');
const { getEvolinkConfig, getModelPricing } = require('../model-catalog');
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

function normalizeZImageAspectRatio(ratio) {
    if (Z_IMAGE_TURBO_ASPECT_RATIOS.has(ratio)) return ratio;
    return Z_IMAGE_ASPECT_FALLBACK[ratio] || '1:1';
}

function getEvolinkImageCostPerImage(model) {
    const price = getModelPricing(model)?.price;
    if (price?.type === 'flat' && Number.isFinite(price.amount)) {
        return price.amount;
    }
    return 0;
}

function normalizeSeedreamQuality(resolution, qualityOptions, qualityDefault) {
    const options = Array.isArray(qualityOptions) && qualityOptions.length > 0
        ? qualityOptions
        : ['2K', '4K'];
    if (options.includes(resolution)) return resolution;
    return options.includes(qualityDefault) ? qualityDefault : options[0];
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

async function handleEvolink(ctx) {
    const {
        res,
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        exactImageSize,
        resolution,
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
                file_name: `seedream-reference-${Date.now()}-${index + 1}.jpg`,
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
        const { variant, apiModel, qualityOptions, qualityDefault, outputFormatOptions } = evolinkConfig;
        const costPerImage = getEvolinkImageCostPerImage(model);
        const uploadedImageUrls = normalizedInputImages.length > 0
            ? await Promise.all(normalizedInputImages.map(uploadEvolinkReferenceImage))
            : [];

        const taskResults = await Promise.all(Array.from({ length: parsedNumImages }, (_, index) => {
            const payload = variant === 'z-image-turbo'
                ? buildZImageTurboPayload({ apiModel, prompt, normalizedAspectRatio })
                : buildSeedreamPayload({
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
            return createTask(payload, index);
        }));

        const requests = taskResults
            .filter((result) => !result.error)
            .map((result) => ({
                index: result.index,
                request_id: result.taskId,
                estimated_cost: costPerImage,
                credits_reserved: result.createData?.usage?.credits_reserved || null,
                usage_estimated: false,
            }));
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
                    usage_estimated: false,
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
    buildEvolinkProxyUrl,
    getEvolinkImageCostPerImage,
    normalizeZImageAspectRatio,
    normalizeSeedreamQuality,
    normalizeSeedreamOutputFormat,
};
