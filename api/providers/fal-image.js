const { redactKey } = require('../_middleware');
const { requiresInputImage, getFalImageConfig, getFalImageCostPerImage, isFalEditModel } = require('../model-catalog');
const { formatFalError } = require('./format-errors');

/**
 * Fal image payload variants (see shared/model-catalog.json → falImageVariants):
 * | Variant           | Example models              | Notes                          |
 * |-------------------|-----------------------------|--------------------------------|
 * | seedream-default  | Wan, Seedream fal endpoints | Generic sync; dual safety off  |
 * | z-image           | Z-Image Turbo               | Preset image_size, 8 steps     |
 * | nucleus           | Nucleus                     | aspect_ratio, not image_size   |
 * | phota             | Phota, Phota Edit           | Queue polling when asyncQueue  |
 * | ernie / ernie-turbo | Ernie LoRA                | Preset image_size              |
 * | ovis, glm, bitdance | Various                   | Preset image_size              |
 * | flux-klein-edit   | Flux 2 Klein edit           | Edit + loras                   |
 * | flux-pro          | Flux 1.1 Pro                | safety_tolerance               |
 * | qwen-max          | Qwen-Image Max              | Prompt expansion               |
 */

const NUCLEUS_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
const PHOTA_ASPECT_RATIOS = new Set(['auto', '1:1', '16:9', '4:3', '3:4', '9:16']);

function aspectRatioToFalImageSize(ar, usesPresetImageSize) {
    switch (ar) {
        case '1:1': return 'square_hd';
        case '4:3': return 'landscape_4_3';
        case '3:4': return 'portrait_4_3';
        case '16:9': return 'landscape_16_9';
        case '9:16': return 'portrait_16_9';
        case '3:2': return { width: 1216, height: 832 };
        case '2:3': return { width: 832, height: 1216 };
        case '21:9': return { width: 1568, height: 672 };
        case '9:21': return { width: 672, height: 1568 };
        default: return 'landscape_4_3';
    }
}

function estimateMegapixelsFromImageSize(imageSize) {
    if (imageSize && typeof imageSize === 'object'
        && Number.isFinite(imageSize.width) && Number.isFinite(imageSize.height)) {
        return (imageSize.width * imageSize.height) / 1_000_000;
    }
    switch (imageSize) {
        case 'square':
        case 'square_hd':
            return 1.0;
        case 'landscape_4_3':
        case 'portrait_4_3':
            return 1.2;
        case 'landscape_16_9':
        case 'portrait_16_9':
            return 1.6;
        default:
            return 1.0;
    }
}

function buildFalImagePayload({
    model,
    prompt,
    parsedNumImages,
    normalizedAspectRatio,
    resolution,
    falImageConfig,
    falImageSize,
}) {
    const variant = falImageConfig?.variant || 'seedream-default';
    const trimmedPrompt = prompt.trim();
    const defaults = falImageConfig?.payloadDefaults || {};

    const withDefaults = (extra) => ({
        ...defaults,
        prompt: trimmedPrompt,
        ...extra,
    });

    switch (variant) {
        case 'nucleus':
            return withDefaults({
                aspect_ratio: NUCLEUS_ASPECT_RATIOS.has(normalizedAspectRatio)
                    ? normalizedAspectRatio
                    : '1:1',
                num_images: Math.min(parsedNumImages, 2),
            });
        case 'ernie-turbo':
        case 'ernie':
        case 'z-image':
        case 'ovis':
        case 'glm':
        case 'bitdance':
        case 'flux-klein-edit':
            return withDefaults({
                image_size: falImageSize,
                num_images: parsedNumImages,
            });
        case 'phota': {
            const photaAspectRatio = PHOTA_ASPECT_RATIOS.has(normalizedAspectRatio)
                ? normalizedAspectRatio
                : 'auto';
            const photaResolution = resolution === '4K' ? '4K' : '1K';
            return withDefaults({
                num_images: parsedNumImages,
                resolution: photaResolution,
                aspect_ratio: photaAspectRatio,
            });
        }
        case 'flux-pro':
        case 'qwen-max':
            return withDefaults({
                image_size: falImageSize,
                num_images: parsedNumImages,
                ...(variant === 'qwen-max' ? { prompt: trimmedPrompt.slice(0, 800) } : {}),
            });
        default:
            return withDefaults({
                image_size: falImageSize,
                num_images: parsedNumImages,
            });
    }
}

async function pollPhotaQueue({ model, falKey, falPayload, parsedNumImages, normalizedInputImages, falImageSize }) {
    const submitResponse = await fetch(`https://queue.fal.run/${model}`, {
        method: 'POST',
        headers: {
            Authorization: `Key ${falKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(falPayload),
    });

    if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        return {
            ok: false,
            status: submitResponse.status,
            body: formatFalError(errorText, 'Failed to start image generation via Fal'),
        };
    }

    const submitData = await submitResponse.json();
    const requestId = submitData?.request_id;
    if (!requestId) {
        return { ok: false, status: 502, body: { error: 'Fal Phota request did not return a request ID' } };
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const statusUrl = submitData?.status_url
        || `https://queue.fal.run/${model}/requests/${encodeURIComponent(requestId)}/status`;
    const responseUrl = submitData?.response_url
        || `https://queue.fal.run/${model}/requests/${encodeURIComponent(requestId)}`;

    for (let attempt = 0; attempt < 30; attempt++) {
        if (attempt > 0) await delay(2000);

        const statusResponse = await fetch(statusUrl, {
            headers: { Authorization: `Key ${falKey}` },
        });
        if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            return {
                ok: false,
                status: statusResponse.status,
                body: formatFalError(errorText, 'Failed to retrieve Fal image status'),
            };
        }

        const statusData = await statusResponse.json();
        const status = String(statusData?.status || '').toUpperCase();
        if (status === 'COMPLETED') {
            const resultResponse = await fetch(statusData?.response_url || responseUrl, {
                headers: { Authorization: `Key ${falKey}` },
            });
            if (!resultResponse.ok) {
                const errorText = await resultResponse.text();
                return {
                    ok: false,
                    status: resultResponse.status,
                    body: formatFalError(errorText, 'Failed to retrieve Fal image result'),
                };
            }

            const data = await resultResponse.json();
            const falImages = Array.isArray(data?.images) ? data.images : [];
            if (falImages.length === 0) {
                return { ok: false, status: 502, body: { error: 'No images returned from Fal' } };
            }

            const limited = falImages.slice(0, parsedNumImages);
            const billingSize = falPayload.resolution || falImageSize;
            const costPerImage = getFalImageCostPerImage(model, billingSize, estimateMegapixelsFromImageSize, {
                imageCount: limited.length,
                inputImageCount: normalizedInputImages.length,
            });
            const totalCost = costPerImage * limited.length;

            return {
                ok: true,
                body: {
                    images: limited.map((img) => ({
                        url: img.url,
                        model,
                        cost: costPerImage,
                        provider: 'fal',
                    })),
                    meta: {
                        total_usage: totalCost,
                        requests: [{
                            model,
                            provider_name: 'fal',
                            usage: totalCost,
                            imageCount: limited.length,
                        }],
                        usage_pending: false,
                    },
                },
            };
        }

        if (['FAILED', 'ERROR'].includes(status)) {
            return { ok: false, status: 502, body: { error: 'Fal image generation failed' } };
        }
    }

    return { ok: false, status: 504, body: { error: 'Fal image generation timed out' } };
}

async function handleFalImage(ctx) {
    const {
        res,
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        resolution,
        normalizedInputImages,
        falKey,
    } = ctx;

    if (requiresInputImage(model) && normalizedInputImages.length === 0) {
        return res.status(400).json({
            error: 'Edit models require at least one attached image. Please attach an image and try again.',
        });
    }

    const falImageConfig = getFalImageConfig(model);
    const variant = falImageConfig?.variant || 'seedream-default';
    const usesPresetImageSize = Boolean(falImageConfig?.usesPresetImageSize);
    const skipImageSize = variant === 'nucleus' || variant === 'phota';

    let falImageSize;
    if (!skipImageSize) {
        falImageSize = aspectRatioToFalImageSize(normalizedAspectRatio, usesPresetImageSize);
    }

    let falPayload = buildFalImagePayload({
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        resolution,
        falImageConfig,
        falImageSize,
    });

    if (isFalEditModel(model)) {
        falPayload.image_urls = normalizedInputImages;
    }

    try {
        if (falImageConfig?.asyncQueue) {
            const result = await pollPhotaQueue({
                model,
                falKey,
                falPayload,
                parsedNumImages,
                normalizedInputImages,
                falImageSize,
            });
            if (!result.ok) {
                return res.status(result.status).json(result.body);
            }
            return res.status(200).json(result.body);
        }

        const response = await fetch(`https://fal.run/${model}`, {
            method: 'POST',
            headers: {
                Authorization: `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(falPayload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                ...formatFalError(errorText, 'Failed to generate image via Fal'),
            });
        }

        const data = await response.json();
        const falImages = Array.isArray(data?.images) ? data.images : [];
        if (falImages.length === 0) {
            return res.status(502).json({ error: 'No images returned from Fal' });
        }

        const limited = falImages.slice(0, parsedNumImages);
        const billingSize = falPayload.resolution || falImageSize;
        const costPerImage = getFalImageCostPerImage(model, billingSize, estimateMegapixelsFromImageSize, {
            imageCount: limited.length,
            inputImageCount: normalizedInputImages.length,
        });
        const totalCost = costPerImage * limited.length;

        return res.status(200).json({
            images: limited.map((img) => ({
                url: img.url,
                model,
                cost: costPerImage,
                provider: 'fal',
            })),
            meta: {
                total_usage: totalCost,
                requests: [{
                    model,
                    provider_name: 'fal',
                    usage: totalCost,
                    imageCount: limited.length,
                }],
                usage_pending: false,
            },
        });
    } catch (error) {
        console.error('Fal API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    handleFalImage,
    buildFalImagePayload,
    aspectRatioToFalImageSize,
    estimateMegapixelsFromImageSize,
};
