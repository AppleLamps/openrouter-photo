const { redactKey } = require('../_middleware');
const { getEvolinkConfig, getModelPricing } = require('../model-catalog');
const { formatEvolinkError } = require('./format-errors');

// Evolink task polling budget. `api/generate.js` has a 120s `maxDuration` (see vercel.json);
// keep this comfortably below that so a slow-but-successful generation gets a real result
// instead of the platform killing the function mid-poll (which would surface as a bare 504
// with no JSON body). Leaves ~15s of headroom for upload/setup/response overhead.
const EVOLINK_POLL_BUDGET_MS = 105000;
const EVOLINK_POLL_INTERVAL_MS = 2000;

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
        const deadline = Date.now() + EVOLINK_POLL_BUDGET_MS;
        for (let attempt = 0; Date.now() < deadline; attempt++) {
            if (attempt > 0) await delay(EVOLINK_POLL_INTERVAL_MS);

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
        const { variant, apiModel, qualityOptions, qualityDefault, outputFormatOptions } = evolinkConfig;
        const costPerImage = getEvolinkImageCostPerImage(model);
        const uploadedImageUrls = normalizedInputImages.length > 0
            ? await Promise.all(normalizedInputImages.map(uploadEvolinkReferenceImage))
            : [];

        if (variant === 'z-image-turbo') {
            const allResults = [];
            const requestMeta = [];

            const taskResults = await Promise.all(Array.from({ length: parsedNumImages }, () => {
                const payload = buildZImageTurboPayload({
                    apiModel,
                    prompt,
                    normalizedAspectRatio,
                });
                return createAndPollTask(payload);
            }));

            for (const taskResult of taskResults) {
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

        const taskResults = await Promise.all(Array.from({ length: parsedNumImages }, () => {
            const payload = buildSeedreamPayload({
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
            return createAndPollTask(payload);
        }));

        for (const taskResult of taskResults) {
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
    normalizeSeedreamOutputFormat,
};
