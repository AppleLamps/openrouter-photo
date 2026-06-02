const { redactKey } = require('../_middleware');
const { getEvolinkConfig, getModelPricing } = require('../model-catalog');
const { formatEvolinkError } = require('./format-errors');

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

function buildEvolinkProxyUrl(url) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function toEvolinkImage(url, model, cost) {
    return {
        url: buildEvolinkProxyUrl(url),
        source_url: url,
        sourceUrl: url,
        model,
        cost,
        provider: 'evolink',
    };
}

function extractEvolinkResults(data) {
    const candidates = [
        data?.results,
        data?.data?.results,
        data?.output,
        data?.data?.output,
        data?.images,
        data?.data?.images,
    ];
    for (const value of candidates) {
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === 'string') return item;
                    return item?.url || item?.image_url || item?.file_url || null;
                })
                .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
        }
    }
    return [];
}

function normalizeSeedreamQuality(resolution, qualityOptions) {
    const options = Array.isArray(qualityOptions) && qualityOptions.length > 0
        ? qualityOptions
        : ['2K', '4K'];
    if (options.includes(resolution)) return resolution;
    return options.includes('2K') ? '2K' : options[0];
}

function buildSeedreamPayload({
    apiModel,
    prompt,
    parsedNumImages,
    normalizedAspectRatio,
    resolution,
    uploadedImageUrls,
    qualityOptions,
    enableWebSearch = false,
}) {
    const quality = normalizeSeedreamQuality(resolution, qualityOptions);
    const normalizedSize = EVOLINK_SEEDREAM_ASPECT_RATIOS.has(normalizedAspectRatio)
        ? normalizedAspectRatio
        : 'auto';
    const supportsWebSearch = apiModel === 'doubao-seedream-5.0-lite';

    return {
        model: apiModel,
        prompt: prompt.trim(),
        n: parsedNumImages,
        size: normalizedSize,
        quality,
        prompt_priority: 'standard',
        ...(uploadedImageUrls.length > 0 ? { image_urls: uploadedImageUrls } : {}),
        ...(supportsWebSearch && enableWebSearch ? {
            model_params: {
                tools: [{ type: 'web_search' }],
            },
        } : {}),
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
        resolution,
        normalizedInputImages,
        enable_web_search,
        evolinkKey,
    } = ctx;

    const evolinkConfig = getEvolinkConfig(model);
    if (!evolinkConfig) {
        return res.status(500).json({ error: 'Evolink model configuration is missing' });
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

    const pollEvolinkTask = async (taskId) => {
        for (let attempt = 0; attempt < 45; attempt++) {
            if (attempt > 0) await delay(2000);

            const taskResponse = await fetch(`https://api.evolink.ai/v1/tasks/${encodeURIComponent(taskId)}`, {
                headers: { Authorization: `Bearer ${evolinkKey}` },
            });

            if (!taskResponse.ok) {
                const errorText = await taskResponse.text();
                return {
                    error: {
                        status: taskResponse.status,
                        payload: formatEvolinkError(errorText, 'Failed to retrieve Evolink task status'),
                    },
                };
            }

            const taskData = await taskResponse.json();
            const status = String(taskData?.status || taskData?.data?.status || '').toLowerCase();

            if (status === 'completed') {
                const results = extractEvolinkResults(taskData);
                if (results.length === 0) {
                    return {
                        error: {
                            status: 502,
                            payload: { error: 'Evolink completed without returning image URLs' },
                        },
                    };
                }
                return {
                    results,
                    taskData,
                };
            }

            if (status === 'failed') {
                const taskError = taskData?.error || taskData?.data?.error;
                return {
                    error: {
                        status: 502,
                        payload: formatEvolinkError(JSON.stringify(taskError || taskData), 'Evolink image generation failed'),
                    },
                };
            }
        }

        return {
            error: {
                status: 504,
                payload: { error: 'Evolink image generation timed out. Please try again.' },
            },
        };
    };

    const createAndPollTask = async (payload) => {
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
            };
        }

        const pollResult = await pollEvolinkTask(taskId);
        if (pollResult.error) return pollResult;

        return {
            results: pollResult.results,
            createData,
            taskData: pollResult.taskData,
            taskId,
        };
    };

    try {
        const { variant, apiModel, qualityOptions } = evolinkConfig;
        const costPerImage = getEvolinkImageCostPerImage(model);
        const uploadedImageUrls = normalizedInputImages.length > 0
            ? await Promise.all(normalizedInputImages.map(uploadEvolinkReferenceImage))
            : [];

        if (variant === 'z-image-turbo') {
            const allResults = [];
            const requestMeta = [];

            for (let index = 0; index < parsedNumImages; index++) {
                const payload = buildZImageTurboPayload({
                    apiModel,
                    prompt,
                    normalizedAspectRatio,
                });
                const taskResult = await createAndPollTask(payload);
                if (taskResult.error) {
                    return res.status(taskResult.error.status).json(taskResult.error.payload);
                }

                allResults.push(...taskResult.results.slice(0, 1));
                requestMeta.push({
                    model,
                    provider_name: 'evolink',
                    generation_id: taskResult.taskId,
                    created_at: taskResult.taskData?.created || taskResult.createData?.created || null,
                    usage: costPerImage,
                    credits_reserved: taskResult.createData?.usage?.credits_reserved || null,
                    imageCount: 1,
                    usage_pending: false,
                });
            }

            return res.status(200).json({
                images: allResults.map((url) => ({
                    ...toEvolinkImage(url, model, costPerImage),
                })),
                meta: {
                    total_usage: requestMeta.reduce((sum, req) => sum + (req.usage || 0), 0),
                    requests: requestMeta,
                    usage_pending: false,
                },
            });
        }

        const allResults = [];
        const requestMeta = [];

        for (let index = 0; index < parsedNumImages; index++) {
            const payload = buildSeedreamPayload({
                apiModel,
                prompt,
                parsedNumImages: 1,
                normalizedAspectRatio,
                resolution,
                uploadedImageUrls,
                qualityOptions,
                enableWebSearch: enable_web_search === true,
            });
            const taskResult = await createAndPollTask(payload);
            if (taskResult.error) {
                return res.status(taskResult.error.status).json(taskResult.error.payload);
            }

            allResults.push(...taskResult.results.slice(0, 1));
            requestMeta.push({
                model,
                provider_name: 'evolink',
                generation_id: taskResult.taskId,
                created_at: taskResult.taskData?.created || taskResult.createData?.created || null,
                usage: costPerImage,
                credits_reserved: taskResult.createData?.usage?.credits_reserved || null,
                imageCount: 1,
                usage_pending: false,
            });
        }

        return res.status(200).json({
            images: allResults.map((url) => toEvolinkImage(url, model, costPerImage)),
            meta: {
                total_usage: requestMeta.reduce((sum, req) => sum + (req.usage || 0), 0),
                requests: requestMeta,
                usage_pending: false,
            },
        });
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
};
