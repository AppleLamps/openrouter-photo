const { withMiddleware, redactKey } = require('./_middleware');

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

    const FAL_MODEL_IDS = [
        'fal-ai/bytedance/seedream/v4.5/text-to-image',
        'fal-ai/bytedance/seedream/v4.5/edit',
        'fal-ai/bytedance/seedream/v5/lite/text-to-image',
        'fal-ai/bytedance/seedream/v5/lite/edit',
        'fal-ai/wan/v2.7/text-to-image',
        'fal-ai/wan/v2.7/pro/text-to-image',
        'fal-ai/wan/v2.7/edit',
        'fal-ai/wan/v2.7/pro/edit',
    ];
    const FAL_VIDEO_MODEL_IDS = [
        'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
        'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
        'fal-ai/bytedance/seedance-2.0/text-to-video',
        'fal-ai/bytedance/seedance-2.0/image-to-video',
    ];
    const isFalModel = FAL_MODEL_IDS.includes(model);
    const isFalVideoModel = FAL_VIDEO_MODEL_IDS.includes(model);
    const isFalEditModel = model === 'fal-ai/bytedance/seedream/v4.5/edit' || model === 'fal-ai/bytedance/seedream/v5/lite/edit' ||
        model === 'fal-ai/wan/v2.7/edit' || model === 'fal-ai/wan/v2.7/pro/edit';

    const XAI_API_KEY =
        req.headers['x-xai-api-key'] ||
        req.headers['x-xai-api_key'] ||
        process.env.XAI_API_KEY;

    const FAL_KEY =
        req.headers['x-fal-api-key'] ||
        req.headers['x-fal-api_key'] ||
        process.env.FAL_KEY;

    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    const OPENROUTER_API_KEY =
        req.headers['x-openrouter-api-key'] ||
        req.headers['x-openrouter-api_key'];

    if (!isXaiModel && !isFalModel && !isFalVideoModel && !OPENROUTER_API_KEY) {
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

    if ((isFalModel || isFalVideoModel) && !FAL_KEY) {
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

    const normalizedInputImages = Array.isArray(image_urls)
        ? image_urls
            .filter((u) => typeof u === 'string' && u.startsWith('data:image/'))
            .slice(0, 3)
        : [];

    // ---------- Fal Seedream models ----------
    if (isFalModel) {
        // Edit models require at least one input image
        if (isFalEditModel && normalizedInputImages.length === 0) {
            return res.status(400).json({
                error: 'Edit models require at least one attached image. Please attach an image and try again.',
            });
        }

        // Map UI aspect ratio (e.g. "1:1", "4:3") to Fal image_size enum
        const aspectRatioToFalImageSize = (ar) => {
            switch (ar) {
                case '1:1': return 'square_hd';
                case '4:3': return 'landscape_4_3';
                case '3:4': return 'portrait_4_3';
                case '16:9': return 'landscape_16_9';
                case '9:16': return 'portrait_16_9';
                default: return 'auto_2K';
            }
        };

        const falImageSize = aspectRatioToFalImageSize(normalizedAspectRatio);

        const falPayload = {
            prompt: prompt.trim(),
            image_size: falImageSize,
            num_images: parsedNumImages,
            enable_safety_checker: false,
            enable_output_safety_checker: false,
        };

        if (isFalEditModel) {
            falPayload.image_urls = normalizedInputImages;
        }

        try {
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

            // Fal pricing: $0.04 per image for Seedream models
            const costPerImage = 0.04;
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

    // ---------- Fal Seedance video model ----------
    if (isFalVideoModel) {
        // Reuse xai_video_length / xai_video_quality fields (shared video settings UI)
        const parsedDuration = parseInt(xai_video_length, 10);
        const isSeedance20 =
            model === 'fal-ai/bytedance/seedance-2.0/text-to-video' ||
            model === 'fal-ai/bytedance/seedance-2.0/image-to-video';
        const maxFalDuration = isSeedance20 ? 15 : 12;
        const normalizedDuration =
            Number.isFinite(parsedDuration) && parsedDuration >= 4 && parsedDuration <= maxFalDuration
                ? String(parsedDuration)
                : '5';
        const validResolutions = isSeedance20
            ? ['480p', '720p']
            : ['480p', '720p', '1080p'];
        const normalizedResolution =
            typeof xai_video_quality === 'string' && validResolutions.includes(xai_video_quality)
                ? xai_video_quality
                : '720p';

        // Seedance supports: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, auto
        const validAspectRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto'];
        const falAspectRatio =
            typeof aspect_ratio === 'string' && validAspectRatios.includes(aspect_ratio.trim())
                ? aspect_ratio.trim()
                : '16:9';

        const isFalImageToVideo =
            model === 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' ||
            model === 'fal-ai/bytedance/seedance-2.0/image-to-video';

        if (isFalImageToVideo && normalizedInputImages.length === 0) {
            return res.status(400).json({
                error: 'Image-to-video requires at least one attached image (start frame). Please attach an image and try again.',
            });
        }

        const falVideoPayload = {
            prompt: prompt.trim(),
            aspect_ratio: falAspectRatio,
            resolution: normalizedResolution,
            duration: normalizedDuration,
            generate_audio: true,
        };

        if (!isSeedance20) {
            falVideoPayload.enable_safety_checker = false;
        }

        if (isFalImageToVideo) {
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

            // Estimated cost for Seedance video generation (flat approximation per request)
            const videoCost = 0.10;

            // Return immediately — client will poll /api/video-status
            return res.status(202).json({
                status: 'pending',
                request_id: requestId,
                model,
                provider: 'fal',
                estimated_cost: videoCost,
                fal_status_url: submitData?.status_url || null,
                fal_response_url: submitData?.response_url || null,
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
