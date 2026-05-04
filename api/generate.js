const {
    withMiddleware,
    redactKey,
    resolveOpenRouterApiKey,
    resolveXaiApiKey,
    resolveFalApiKey,
} = require('./_middleware');
const {
    getFalImageCostPerImage,
    isFalImageModel,
    isFalVideoModel,
    isFalEditModel,
    getFalVideoModel,
} = require('./model-registry');

module.exports = withMiddleware(async function handler(req, res) {
    const {
        prompt,
        model = 'black-forest-labs/flux.2-pro',
        num_images = 1,
        // UI sends these; only Gemini models currently support image_config options reliably
        aspect_ratio,
        image_size, // legacy "preset" from UI; used to derive aspect ratio if aspect_ratio isn't set
        resolution, // legacy UI field; repurposed as Gemini image_config.image_size (1K/2K/4K)
        xai_video_length,
        xai_video_quality,
        image_urls = [], // optional image inputs (data URLs) for all models
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    // Validate num_images
    const parsedNumImages = parseInt(num_images, 10);
    if (!Number.isInteger(parsedNumImages) || parsedNumImages < 1 || parsedNumImages > 4) {
        return res.status(400).json({ error: '`num_images` must be an integer between 1 and 4' });
    }

    const isXaiImageModel = model === 'grok-imagine-image' || model === 'grok-imagine-image-pro';
    const isXaiVideoModel = model === 'grok-imagine-video';
    const isXaiModel = isXaiImageModel || isXaiVideoModel;

    const isFalModel = isFalImageModel(model);
    const isFalVideoModelForRequest = isFalVideoModel(model);
    const isReveEditModel = model === 'fal-ai/reve/edit';
    const isFalEditModelForRequest = isFalEditModel(model);

    const XAI_API_KEY = resolveXaiApiKey(req);
    const FAL_KEY = resolveFalApiKey(req);

    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    const OPENROUTER_API_KEY = resolveOpenRouterApiKey(req);

    if (!isXaiModel && !isFalModel && !isFalVideoModelForRequest && !OPENROUTER_API_KEY) {
        return res.status(401).json({
            code: 'OPENROUTER_API_KEY_REQUIRED',
            error: 'OpenRouter API key required',
            help: {
                message: 'Open Settings → paste your OpenRouter API key. Create one at openrouter.ai/keys.',
                url: 'https://openrouter.ai/keys'
            }
        });
    }

    if (isXaiModel && !XAI_API_KEY) {
        return res.status(401).json({
            code: 'XAI_API_KEY_REQUIRED',
            error: 'xAI API key required',
            help: {
                message: 'Open Settings → paste your xAI API key. Create one at console.x.ai.',
                url: 'https://console.x.ai'
            }
        });
    }

    if ((isFalModel || isFalVideoModelForRequest) && !FAL_KEY) {
        return res.status(401).json({
            code: 'FAL_API_KEY_REQUIRED',
            error: 'Fal API key required',
            help: {
                message: 'Open Settings → paste your Fal API key. Create one at fal.ai/dashboard/keys.',
                url: 'https://fal.ai/dashboard/keys'
            }
        });
    }

    const isGeminiModel = typeof model === 'string' && model.startsWith('google/gemini-');
    const isSeedreamModel = typeof model === 'string' && model.includes('seedream');

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

    const normalizedAspectRatio =
        typeof aspect_ratio === 'string' && aspect_ratio.trim() !== ''
            ? aspect_ratio.trim()
            : imageSizePresetToAspectRatio(image_size);

    const maxInputImages =
        model === 'fal-ai/phota/edit' ? 10 :
            model === 'alibaba/happy-horse/reference-to-video' ? 9 :
                3;
    const normalizedInputImages = Array.isArray(image_urls)
        ? image_urls
            .filter((u) => typeof u === 'string' && u.startsWith('data:image/'))
            .slice(0, maxInputImages)
        : [];

    // ---------- Fal Seedream models ----------
    if (isFalModel) {
        // Edit models require at least one input image
        if (isFalEditModelForRequest && normalizedInputImages.length === 0) {
            return res.status(400).json({
                error: 'Edit models require at least one attached image. Please attach an image and try again.',
            });
        }

        // Nucleus uses aspect_ratio presets, not image_size (see fal-ai/nucleus-image)
        const isNucleusImageModel = model === 'fal-ai/nucleus-image';
        const normalizeNucleusAspectRatio = (ar) => {
            const allowed = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
            if (typeof ar === 'string' && allowed.has(ar.trim())) {
                return ar.trim();
            }
            return '1:1';
        };

        // Map UI aspect ratio (e.g. "1:1", "4:3") to Fal image_size enum (or a
        // custom { width, height } for ratios outside the enum).
        const isErnieTurboModel = model === 'fal-ai/ernie-image/lora/turbo';
        const isErnieImageModel =
            model === 'fal-ai/ernie-image/lora' || isErnieTurboModel;
        const isZImageModel = model === 'fal-ai/z-image/turbo/lora';
        const isBitdanceModel = model === 'fal-ai/bitdance';
        const isPhotaModel = model === 'fal-ai/phota';
        const isPhotaEditModel = model === 'fal-ai/phota/edit';
        const isQwenImageMaxT2IModel = model === 'fal-ai/qwen-image-max/text-to-image';
        const isQwenImageMaxEditModel = model === 'fal-ai/qwen-image-max/edit';
        const isQwenImageMaxModel = isQwenImageMaxT2IModel || isQwenImageMaxEditModel;
        const usesPresetImageSize = isErnieImageModel || isZImageModel || isBitdanceModel || isQwenImageMaxModel;
        const aspectRatioToFalImageSize = (ar) => {
            switch (ar) {
                case '1:1':  return 'square_hd';
                case '4:3':  return 'landscape_4_3';
                case '3:4':  return 'portrait_4_3';
                case '16:9': return 'landscape_16_9';
                case '9:16': return 'portrait_16_9';
                // Custom dimensions targeting ~1 Mpix in multiples of 64.
                case '3:2':  return { width: 1216, height: 832 };
                case '2:3':  return { width: 832,  height: 1216 };
                case '21:9': return { width: 1568, height: 672 };
                case '9:21': return { width: 672,  height: 1568 };
                default:     return usesPresetImageSize ? 'landscape_4_3' : 'auto_2K';
            }
        };

        let falImageSize;
        if (!isNucleusImageModel && !isPhotaModel && !isPhotaEditModel) {
            falImageSize = aspectRatioToFalImageSize(normalizedAspectRatio);
        }

        /** Approximate megapixels for the Fal image_size value — used for $/Mpix pricing. */
        const estimateMegapixelsFromImageSize = (imageSize) => {
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
        };

        /** @type {Record<string, unknown>} */
        let falPayload;
        if (isNucleusImageModel) {
            // https://fal.ai/models/fal-ai/nucleus-image/api
            falPayload = {
                prompt: prompt.trim(),
                aspect_ratio: normalizeNucleusAspectRatio(normalizedAspectRatio),
                num_images: parsedNumImages,
                num_inference_steps: 50,
                guidance_scale: 8,
                enable_safety_checker: false,
                output_format: 'png',
            };
        } else if (isErnieImageModel) {
            // Turbo: 8 / 1 (turbo-optimized). Base lora: 50 / 5 per
            // https://fal.ai/models/fal-ai/ernie-image/lora/turbo/api
            falPayload = {
                prompt: prompt.trim(),
                image_size: falImageSize,
                num_images: parsedNumImages,
                num_inference_steps: isErnieTurboModel ? 8 : 50,
                guidance_scale: isErnieTurboModel ? 1 : 5,
                enable_safety_checker: false,
                enable_prompt_expansion: isErnieTurboModel ? true : false,
                output_format: isErnieTurboModel ? 'jpeg' : 'png',
            };
            if (isErnieTurboModel) {
                falPayload.acceleration = 'regular';
                falPayload.loras = [];
            }
        } else if (isZImageModel) {
            // Z-Image Turbo (Tongyi-MAI 6B). Steps capped at 8; "regular" acceleration.
            // https://fal.ai/models/fal-ai/z-image/turbo/lora/api
            falPayload = {
                prompt: prompt.trim(),
                image_size: falImageSize,
                num_images: parsedNumImages,
                num_inference_steps: 8,
                acceleration: 'regular',
                output_format: 'png',
                enable_safety_checker: false,
                enable_prompt_expansion: false,
            };
        } else if (model === 'fal-ai/ovis-image') {
            // Ovis Image is optimized for quick, high-quality text rendering.
            // https://fal.ai/models/fal-ai/ovis-image/api
            falPayload = {
                prompt: prompt.trim(),
                negative_prompt: '',
                image_size: falImageSize,
                num_inference_steps: 28,
                guidance_scale: 5,
                sync_mode: false,
                num_images: parsedNumImages,
                enable_safety_checker: false,
                output_format: 'png',
                acceleration: 'regular',
            };
        } else if (model === 'fal-ai/glm-image') {
            // GLM Image supports image_size, prompt expansion, and strong text rendering.
            // https://fal.ai/models/fal-ai/glm-image/api
            falPayload = {
                prompt: prompt.trim(),
                image_size: falImageSize,
                num_inference_steps: 30,
                guidance_scale: 1.5,
                num_images: parsedNumImages,
                enable_safety_checker: false,
                output_format: 'jpeg',
                sync_mode: false,
                enable_prompt_expansion: false,
            };
        } else if (model === 'fal-ai/nucleus-image') {
            // Nucleus Image uses aspect_ratio presets instead of image_size.
            // https://fal.ai/models/fal-ai/nucleus-image/api
            const validNucleusAspectRatios = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
            const nucleusAspectRatio = validNucleusAspectRatios.has(normalizedAspectRatio)
                ? normalizedAspectRatio
                : '1:1';

            falPayload = {
                prompt: prompt.trim(),
                negative_prompt: '',
                aspect_ratio: nucleusAspectRatio,
                num_inference_steps: 50,
                guidance_scale: 8,
                num_images: Math.min(parsedNumImages, 2),
                sync_mode: false,
                enable_safety_checker: false,
                output_format: 'png',
            };
        } else if (isBitdanceModel) {
            // BitDance autoregressive image model — flat $0.01/image.
            // https://fal.ai/models/fal-ai/bitdance/api
            falPayload = {
                prompt: prompt.trim(),
                image_size: falImageSize,
                num_images: parsedNumImages,
                num_inference_steps: 25,
                guidance_scale: 7.5,
                output_format: 'png',
                enable_safety_checker: false,
            };
        } else if (isPhotaModel || isPhotaEditModel) {
            // Phota uses the Fal queue API and aspect_ratio/resolution fields.
            // https://fal.ai/models/fal-ai/phota/api
            const validPhotaAspectRatios = new Set(['auto', '1:1', '16:9', '4:3', '3:4', '9:16']);
            const photaAspectRatio = validPhotaAspectRatios.has(normalizedAspectRatio)
                ? normalizedAspectRatio
                : 'auto';
            const photaResolution = resolution === '4K' ? '4K' : '1K';
            falImageSize = photaResolution;

            falPayload = {
                prompt: prompt.trim(),
                num_images: parsedNumImages,
                output_format: 'jpeg',
                sync_mode: false,
                resolution: photaResolution,
                aspect_ratio: photaAspectRatio,
            };
        } else if (isQwenImageMaxModel) {
            // Qwen-Image-Max (text-to-image and edit) — flat $0.075/image.
            // 800-char prompt limit; built-in LLM prompt expansion.
            // image_urls is appended below by the shared isFalEditModel block.
            // https://fal.ai/models/fal-ai/qwen-image-max
            falPayload = {
                prompt: prompt.trim().slice(0, 800),
                image_size: falImageSize,
                num_images: parsedNumImages,
                output_format: 'png',
                enable_prompt_expansion: true,
                enable_safety_checker: false,
            };
        } else if (isReveEditModel) {
            // Reve edit — flat $0.04/image. No image_size / steps / guidance.
            // Takes a single `image_url` (string), not `image_urls` (array).
            // https://fal.ai/models/fal-ai/reve/edit/api
            falPayload = {
                prompt: prompt.trim(),
                num_images: parsedNumImages,
                output_format: 'png',
            };
        } else {
            falPayload = {
                prompt: prompt.trim(),
                image_size: falImageSize,
                num_images: parsedNumImages,
                enable_safety_checker: false,
                enable_output_safety_checker: false,
            };
        }

        if (isFalEditModelForRequest) {
            // Reve takes a single `image_url`; the others take an `image_urls` array.
            if (isReveEditModel) {
                falPayload.image_url = normalizedInputImages[0];
            } else {
                falPayload.image_urls = normalizedInputImages;
            }
        }

        try {
            if (isPhotaModel) {
                const submitResponse = await fetch(`https://queue.fal.run/${model}`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Key ${FAL_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(falPayload),
                });

                if (!submitResponse.ok) {
                    const errorText = await submitResponse.text();
                    return res.status(submitResponse.status).json({
                        error: 'Failed to start image generation via Fal',
                        details: redactKey(errorText),
                    });
                }

                const submitData = await submitResponse.json();
                const requestId = submitData?.request_id;
                if (!requestId) {
                    return res.status(502).json({ error: 'Fal Phota request did not return a request ID' });
                }

                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                const statusUrl = submitData?.status_url
                    || `https://queue.fal.run/${model}/requests/${encodeURIComponent(requestId)}/status`;
                const responseUrl = submitData?.response_url
                    || `https://queue.fal.run/${model}/requests/${encodeURIComponent(requestId)}`;

                for (let attempt = 0; attempt < 30; attempt++) {
                    if (attempt > 0) {
                        await delay(2000);
                    }

                    const statusResponse = await fetch(statusUrl, {
                        headers: { Authorization: `Key ${FAL_KEY}` },
                    });
                    if (!statusResponse.ok) {
                        const errorText = await statusResponse.text();
                        return res.status(statusResponse.status).json({
                            error: 'Failed to retrieve Fal image status',
                            details: redactKey(errorText),
                        });
                    }

                    const statusData = await statusResponse.json();
                    const status = String(statusData?.status || '').toUpperCase();
                    if (status === 'COMPLETED') {
                        const resultResponse = await fetch(statusData?.response_url || responseUrl, {
                            headers: { Authorization: `Key ${FAL_KEY}` },
                        });
                        if (!resultResponse.ok) {
                            const errorText = await resultResponse.text();
                            return res.status(resultResponse.status).json({
                                error: 'Failed to retrieve Fal image result',
                                details: redactKey(errorText),
                            });
                        }

                        const data = await resultResponse.json();
                        const falImages = Array.isArray(data?.images) ? data.images : [];
                        if (falImages.length === 0) {
                            return res.status(502).json({ error: 'No images returned from Fal' });
                        }

                        const costPerImage = getFalImageCostPerImage(model, falImageSize, estimateMegapixelsFromImageSize);
                        const limited = falImages.slice(0, parsedNumImages);
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
                    }

                    if (['FAILED', 'ERROR'].includes(status)) {
                        return res.status(502).json({ error: 'Fal image generation failed' });
                    }
                }

                return res.status(504).json({ error: 'Fal image generation timed out' });
            }

            // Use Fal sync endpoint for immediate results
            const falUrl = `https://fal.run/${model}`;
            const response = await fetch(falUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Key ${FAL_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(falPayload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return res.status(response.status).json({
                    error: 'Failed to generate image via Fal',
                    details: redactKey(errorText),
                });
            }

            const data = await response.json();
            const falImages = Array.isArray(data?.images) ? data.images : [];

            if (falImages.length === 0) {
                return res.status(502).json({ error: 'No images returned from Fal' });
            }

            // Fal pricing: flat $0.04/image (Seedream/Wan/Nucleus);
            //   Ernie: ~$0.015/Mpix; Z-Image Turbo: $0.0085/Mpix;
            //   BitDance: flat $0.01/image; Qwen-Image-Max: flat $0.075/image.
            const costPerImage = getFalImageCostPerImage(model, falImageSize, estimateMegapixelsFromImageSize);
            const limited = falImages.slice(0, parsedNumImages);
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

    // ---------- Fal video models ----------
    if (isFalVideoModelForRequest) {
        const falVideoConfig = getFalVideoModel(model);
        const isHappyHorse = model === 'alibaba/happy-horse/reference-to-video';
        const isSeedance20Advanced = model === 'bytedance/seedance-2.0/text-to-video';
        // Reuse xai_video_length / xai_video_quality fields (shared video settings UI)
        const parsedDuration = parseInt(xai_video_length, 10);
        const isSeedance20 =
            model === 'fal-ai/bytedance/seedance-2.0/text-to-video' ||
            model === 'fal-ai/bytedance/seedance-2.0/image-to-video' ||
            isSeedance20Advanced;
        const minFalDuration = isHappyHorse ? 3 : 4;
        const maxFalDuration = isSeedance20 || isHappyHorse ? 15 : 12;
        const normalizedDuration =
            Number.isFinite(parsedDuration) && parsedDuration >= minFalDuration && parsedDuration <= maxFalDuration
                ? parsedDuration
                : 5;
        const validResolutions = isHappyHorse || isSeedance20Advanced
            ? ['720p', '1080p']
            : isSeedance20
            ? ['480p', '720p']
            : ['480p', '720p', '1080p'];
        const normalizedResolution =
            typeof xai_video_quality === 'string' && validResolutions.includes(xai_video_quality)
                ? xai_video_quality
                : isHappyHorse ? '1080p' : '720p';

        // Seedance supports: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, auto.
        // Happy Horse supports: 16:9, 9:16, 1:1, 4:3, 3:4.
        const validAspectRatios = isHappyHorse
            ? ['16:9', '9:16', '1:1', '4:3', '3:4']
            : ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto'];
        const falAspectRatio =
            typeof aspect_ratio === 'string' && validAspectRatios.includes(aspect_ratio.trim())
                ? aspect_ratio.trim()
                : '16:9';

        const isFalImageToVideo =
            model === 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' ||
            model === 'fal-ai/bytedance/seedance-2.0/image-to-video' ||
            falVideoConfig?.imageToVideo === true;

        if (isFalImageToVideo && normalizedInputImages.length === 0) {
            return res.status(400).json({
                error: 'Image-to-video requires at least one attached image (start frame). Please attach an image and try again.',
            });
        }

        const falVideoPayload = {
            prompt: prompt.trim(),
            aspect_ratio: falAspectRatio,
            resolution: normalizedResolution,
            duration: isHappyHorse ? normalizedDuration : String(normalizedDuration),
        };

        if (!isHappyHorse) {
            falVideoPayload.generate_audio = true;
        }

        if (!isSeedance20 || isHappyHorse || isSeedance20Advanced) {
            falVideoPayload.enable_safety_checker = false;
        }

        if (isHappyHorse) {
            falVideoPayload.image_urls = normalizedInputImages;
        } else if (isFalImageToVideo) {
            falVideoPayload.image_url = normalizedInputImages[0];
            if (normalizedInputImages[1]) {
                falVideoPayload.end_image_url = normalizedInputImages[1];
            }
        }

        try {
            // Use Fal queue endpoint for async video generation
            const falQueueUrl = `https://queue.fal.run/${model}`;
            const submitResponse = await fetch(falQueueUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Key ${FAL_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(falVideoPayload),
            });

            if (!submitResponse.ok) {
                const errorText = await submitResponse.text();
                return res.status(submitResponse.status).json({
                    error: 'Failed to start video generation via Fal',
                    details: redactKey(errorText),
                });
            }

            const submitData = await submitResponse.json();
            const requestId = submitData?.request_id;

            if (!requestId) {
                return res.status(502).json({ error: 'Fal video request did not return a request ID' });
            }

            const videoCost = isHappyHorse
                ? normalizedDuration * (falVideoConfig?.pricePerSecond?.[normalizedResolution] || 0)
                : isSeedance20Advanced
                    ? normalizedDuration * (falVideoConfig?.pricePerSecond?.[normalizedResolution] || 0)
                : 0.10;

            // Return immediately — client will poll /api/video-status
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

    if (isXaiModel) {
        const xaiPrompt = prompt.trim();
        const xaiHeaders = {
            Authorization: `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        };

        const extractXaiImageUrls = (payload) => {
            const images = [];
            const dataArray = Array.isArray(payload?.data) ? payload.data : null;
            const candidates = dataArray || (Array.isArray(payload?.images) ? payload.images : []);

            if (Array.isArray(candidates)) {
                candidates.forEach((item) => {
                    const base64 = item?.b64_json || item?.b64 || item?.image_base64 || null;
                    const url = item?.url || item?.image_url || item?.imageUrl || null;
                    if (base64) {
                        images.push(`data:image/png;base64,${base64}`);
                    } else if (url) {
                        images.push(url);
                    }
                });
            }

            const singleBase64 = payload?.b64_json || payload?.image;
            if (singleBase64 && images.length === 0) {
                images.push(`data:image/png;base64,${singleBase64}`);
            }

            const singleUrl = payload?.url || payload?.image_url || payload?.imageUrl;
            if (singleUrl && images.length === 0) {
                images.push(singleUrl);
            }

            return images;
        };

        try {
            if (isXaiImageModel) {
                const normalizedXaiAspectRatio =
                    typeof aspect_ratio === 'string' && aspect_ratio.trim() !== ''
                        ? aspect_ratio.trim()
                        : null;

                // xAI image API supports: model, prompt, n, response_format, aspect_ratio, image_url
                // It does NOT support: size, quality
                const xaiPayload = {
                    model,
                    prompt: xaiPrompt,
                    response_format: 'b64_json',
                    n: parsedNumImages,
                    ...(normalizedXaiAspectRatio ? { aspect_ratio: normalizedXaiAspectRatio } : {}),
                };

                // Pass first input image for image editing
                if (normalizedInputImages.length > 0) {
                    xaiPayload.image_url = normalizedInputImages[0];
                }

                const response = await fetch('https://api.x.ai/v1/images/generations', {
                    method: 'POST',
                    headers: xaiHeaders,
                    body: JSON.stringify(xaiPayload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    return res.status(response.status).json({
                        error: 'Failed to generate image',
                        details: redactKey(errorText),
                    });
                }

                const data = await response.json();
                const images = extractXaiImageUrls(data);

                if (images.length === 0) {
                    return res.status(502).json({ error: 'No images returned from xAI' });
                }

                // Calculate cost per image based on model
                const hasInputImage = normalizedInputImages.length > 0;
                const inputImageCost = hasInputImage ? 0.002 : 0;
                const perImageOutputCost = model === 'grok-imagine-image-pro' ? 0.07 : 0.02;
                const actualCount = Math.min(images.length, parsedNumImages);
                const totalCost = (perImageOutputCost * actualCount) + inputImageCost;

                return res.status(200).json({
                    images: images.slice(0, parsedNumImages).map((url) => ({
                        url,
                        model,
                        cost: perImageOutputCost,
                        provider: 'xai',
                    })),
                    meta: {
                        total_usage: totalCost,
                        requests: [],
                        usage_pending: false,
                    },
                });
            }

            if (isXaiVideoModel) {
                const parsedDuration = parseInt(xai_video_length, 10);
                const normalizedDuration =
                    Number.isFinite(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 15
                        ? parsedDuration
                        : 5;
                const normalizedResolution =
                    typeof xai_video_quality === 'string' && ['720p', '480p'].includes(xai_video_quality)
                        ? xai_video_quality
                        : '720p';
                const normalizedXaiAspectRatio =
                    typeof aspect_ratio === 'string' && aspect_ratio.trim() !== ''
                        ? aspect_ratio.trim()
                        : null;

                const startPayload = {
                    model,
                    prompt: xaiPrompt,
                    duration: normalizedDuration,
                    resolution: normalizedResolution,
                    ...(normalizedXaiAspectRatio ? { aspect_ratio: normalizedXaiAspectRatio } : {}),
                };

                // Pass first input image for image-to-video generation
                if (normalizedInputImages.length > 0) {
                    startPayload.image_url = normalizedInputImages[0];
                }

                const startResponse = await fetch('https://api.x.ai/v1/videos/generations', {
                    method: 'POST',
                    headers: xaiHeaders,
                    body: JSON.stringify(startPayload),
                });

                if (!startResponse.ok) {
                    const errorText = await startResponse.text();
                    return res.status(startResponse.status).json({
                        error: 'Failed to start video generation',
                        details: redactKey(errorText),
                    });
                }

                const startData = await startResponse.json();
                const requestId = startData?.request_id || startData?.requestId || startData?.id;

                if (!requestId) {
                    return res.status(502).json({ error: 'xAI video request did not return a request ID' });
                }

                // Calculate estimated video cost
                const hasInputImage = normalizedInputImages.length > 0;
                const inputImageCost = hasInputImage ? 0.002 : 0;
                const outputVideoCost = normalizedDuration * 0.05;
                const videoCost = outputVideoCost + inputImageCost;

                // Return immediately with the request ID — the client will poll /api/video-status
                return res.status(202).json({
                    status: 'pending',
                    request_id: requestId,
                    model,
                    estimated_cost: videoCost,
                });
            }
        } catch (error) {
            console.error('xAI API error:', redactKey(error));
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    const buildPayload = (options = {}) => {
        const { includeAspectRatio = true } = options;

        /** @type {any} */
        const userContent =
            normalizedInputImages.length > 0
                ? [
                    { type: 'text', text: prompt.trim() },
                    ...normalizedInputImages.map((url) => ({
                        type: 'image_url',
                        image_url: { url },
                    })),
                ]
                : prompt.trim();

        /** @type {any} */
        const payload = {
            model,
            messages: [
                {
                    role: 'user',
                    content: userContent,
                },
            ],
            // Gemini models can return both image + text; pure image models (Seedream, Flux, etc.)
            // only support the 'image' modality — requesting 'text' causes endpoint lookup failures.
            modalities: isGeminiModel ? ['image', 'text'] : ['image'],
            stream: false,
        };

        if (isGeminiModel) {
            payload.image_config = {
                aspect_ratio: normalizedAspectRatio,
            };

            if (typeof resolution === 'string' && ['1K', '2K', '4K'].includes(resolution)) {
                payload.image_config.image_size = resolution;
            }
        } else if (isSeedreamModel && includeAspectRatio) {
            // Seedream may support aspect_ratio - include it with fallback retry if it fails
            payload.image_config = {
                aspect_ratio: normalizedAspectRatio,
            };
        }

        return payload;
    };

    const extractImageUrls = (openRouterJson) => {
        const message = openRouterJson?.choices?.[0]?.message;
        const images = message?.images;
        if (!Array.isArray(images)) return [];
        return images
            .map((img) => img?.image_url?.url || img?.imageUrl?.url)
            .filter((url) => typeof url === 'string' && url.startsWith('data:image/'));
    };

    const extractUsageNumber = (openRouterJson) => {
        // OpenRouter returns cost in usage.total_cost (in USD)
        if (typeof openRouterJson?.usage?.total_cost === 'number') return openRouterJson.usage.total_cost;
        // Fallback: some responses may have usage as a direct number
        if (typeof openRouterJson?.usage === 'number') return openRouterJson.usage;
        return 0;
    };

    const fetchGenerationCost = async (generationId, retries = 2) => {
        if (!generationId) return { cost: 0, pending: false };

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                    headers: {
                        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    },
                });

                if (!response.ok) {
                    let errorBody = '';
                    try {
                        errorBody = await response.text();
                    } catch {
                        errorBody = '';
                    }
                    console.error(`Generation cost fetch failed (attempt ${attempt + 1}):`, {
                        generationId,
                        status: response.status,
                        body: redactKey(errorBody),
                    });
                    if (attempt < retries - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 200));
                        continue;
                    }
                    return { cost: 0, pending: true };
                }

                const stats = await response.json();

                // OpenRouter returns cost in the `usage` field (in USD) - check both wrapped and unwrapped
                const data = stats?.data || stats;
                const cost = data?.usage ?? data?.total_cost ?? data?.cost ?? 0;

                if (typeof cost === 'number' && cost > 0) {
                    return { cost, pending: false };
                }

                // If cost is still 0, might need to wait for calculation
                if (attempt < retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    continue;
                }

                const parsed = typeof cost === 'number' ? cost : parseFloat(cost || 0);
                return { cost: Number.isFinite(parsed) ? parsed : 0, pending: false };
            } catch (e) {
                console.error(`Error fetching generation cost (attempt ${attempt + 1}):`, {
                    generationId,
                    error: redactKey(e),
                });
                if (attempt < retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    continue;
                }
                return { cost: 0, pending: true };
            }
        }
        return { cost: 0, pending: true };
    };

    const extractUsageMeta = (openRouterJson) => {
        return {
            model: openRouterJson?.model || model,
            provider_name: openRouterJson?.provider_name || openRouterJson?.provider || null,
            generation_id: openRouterJson?.generation_id || openRouterJson?.id || null,
            created_at: openRouterJson?.created_at || null,
            usage: extractUsageNumber(openRouterJson),
            usage_pending: false,
        };
    };

    const requestSingle = async (options = {}) => {
        const { includeAspectRatio = true } = options;

        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'http://localhost',
                'X-Title': 'AI Image Generator',
            },
            body: JSON.stringify(buildPayload({ includeAspectRatio })),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { ok: false, status: response.status, errorText };
        }

        const data = await response.json();
        return { ok: true, data };
    };

    // Wrapper that retries seedream requests without aspect_ratio on failure
    const requestSingleWithFallback = async () => {
        const result = await requestSingle({ includeAspectRatio: true });

        // If seedream fails and we included aspect_ratio, retry without it
        if (!result.ok && isSeedreamModel) {
            console.log('Seedream request failed with aspect_ratio, retrying without it...');
            return requestSingle({ includeAspectRatio: false });
        }

        return result;
    };

    try {
        /** @type {Array<{url: string, model: string, cost: number, provider: string|null, metaIndex: number}>} */
        const imageResults = [];
        /** @type {Array<{model: string, provider_name: (string|null), generation_id: (string|number|null), created_at: (string|null), usage: number, imageCount: number}>} */
        const usageRequests = [];

        // First call: some models may return multiple images in one response.
        const first = await requestSingleWithFallback();
        if (!first.ok) {
            console.error('OpenRouter API error:', redactKey(first.errorText));
            return res.status(first.status).json({
                error: 'Failed to generate image',
                details: redactKey(first.errorText),
            });
        }

        const firstUrls = extractImageUrls(first.data);
        const firstMeta = extractUsageMeta(first.data);
        firstMeta.imageCount = firstUrls.length;
        usageRequests.push(firstMeta);

        // Store images with reference to their meta index for cost assignment later
        firstUrls.forEach((url) => {
            imageResults.push({
                url,
                model: firstMeta.model,
                cost: 0, // Will be filled in after parallel cost fetch
                provider: firstMeta.provider_name,
                metaIndex: 0
            });
        });

        // Fallback: if the provider only returns 1 image, make remaining requests in parallel.
        const remaining = parsedNumImages - imageResults.length;
        if (remaining > 0) {
            const parallelResults = await Promise.all(
                Array(remaining).fill().map(() => requestSingleWithFallback())
            );

            for (const next of parallelResults) {
                if (!next.ok) {
                    console.error('OpenRouter API error:', redactKey(next.errorText));
                    continue;
                }

                const nextUrls = extractImageUrls(next.data);
                const nextMeta = extractUsageMeta(next.data);
                nextMeta.imageCount = nextUrls.length;
                const metaIndex = usageRequests.length;
                usageRequests.push(nextMeta);

                nextUrls.forEach((url) => {
                    imageResults.push({
                        url,
                        model: nextMeta.model,
                        cost: 0,
                        provider: nextMeta.provider_name,
                        metaIndex
                    });
                });
            }
        }

        // Trim to requested count
        const limited = imageResults.slice(0, parsedNumImages);
        if (limited.length === 0) {
            return res.status(502).json({
                error: 'No images returned from OpenRouter',
            });
        }

        // Fetch all costs in parallel (non-blocking for image delivery)
        // Small initial delay to allow OpenRouter to calculate costs
        await new Promise((resolve) => setTimeout(resolve, 150));

        const costPromises = usageRequests.map(async (meta) => {
            if (meta.generation_id) {
                const initialUsage = meta.usage;
                const { cost, pending } = await fetchGenerationCost(meta.generation_id);
                if (cost > 0) {
                    meta.usage = cost;
                } else if (pending && (!Number.isFinite(initialUsage) || initialUsage <= 0)) {
                    meta.usage_pending = true;
                }
            }
            return meta.usage;
        });

        await Promise.all(costPromises);

        // Calculate total usage and assign pro-rated costs to images
        let totalUsage = 0;
        for (const meta of usageRequests) {
            totalUsage += meta.usage;
        }

        // Assign pro-rated costs to each image
        for (const img of limited) {
            const meta = usageRequests[img.metaIndex];
            img.cost = meta.imageCount > 0 ? meta.usage / meta.imageCount : 0;
            delete img.metaIndex; // Clean up internal property
        }

        return res.status(200).json({
            images: limited,
            meta: {
                total_usage: totalUsage,
                requests: usageRequests,
                usage_pending: usageRequests.some((meta) => meta.usage_pending),
            },
        });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
