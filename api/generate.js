const resolveCorsOrigin = (req) => {
    const raw = process.env.ALLOWED_ORIGIN || '';
    const allowed = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
    if (allowed.length === 0 || allowed.includes('*')) {
        return '*';
    }
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        return origin;
    }
    return allowed[0];
};

module.exports = async function handler(req, res) {
    // Set CORS headers
    const allowedOrigin = resolveCorsOrigin(req);
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    if (allowedOrigin !== '*') {
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Api-Key, X-XAI-Api-Key');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Parse body if not already parsed (Vercel compatibility)
    if (!req.body || typeof req.body !== 'object') {
        try {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const body = Buffer.concat(chunks).toString();
            req.body = JSON.parse(body);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }
    }

    const {
        prompt,
        model = 'black-forest-labs/flux.2-pro',
        num_images = 1,
        // UI sends these; only Gemini models currently support image_config options reliably
        aspect_ratio,
        image_size, // legacy "preset" from UI; used to derive aspect ratio if aspect_ratio isn't set
        resolution, // legacy UI field; repurposed as Gemini image_config.image_size (1K/2K/4K)
        xai_image_size,
        xai_image_quality,
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

    const XAI_API_KEY =
        req.headers['x-xai-api-key'] ||
        req.headers['x-xai-api_key'] ||
        process.env.XAI_API_KEY;

    const redactKey = (text) => {
        if (!text) return text;
        const str = String(text);
        return str.replace(/sk-or-v1-[a-zA-Z0-9.\-_]+/g, '[REDACTED_API_KEY]');
    };

    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    const OPENROUTER_API_KEY =
        req.headers['x-openrouter-api-key'] ||
        req.headers['x-openrouter-api_key'];

    if (!isXaiModel && !OPENROUTER_API_KEY) {
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

        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        try {
            if (isXaiImageModel) {
                const normalizedXaiImageSize =
                    typeof xai_image_size === 'string' && xai_image_size.trim() !== ''
                        ? xai_image_size.trim()
                        : null;
                const normalizedXaiImageQuality =
                    typeof xai_image_quality === 'string' && xai_image_quality.trim() !== ''
                        ? xai_image_quality.trim()
                        : null;
                const normalizedXaiAspectRatio =
                    typeof aspect_ratio === 'string' && aspect_ratio.trim() !== ''
                        ? aspect_ratio.trim()
                        : null;

                const xaiPayload = {
                    model,
                    prompt: xaiPrompt,
                    response_format: 'b64_json',
                    n: parsedNumImages,
                    ...(normalizedXaiImageSize ? { size: normalizedXaiImageSize } : {}),
                    ...(normalizedXaiImageQuality ? { quality: normalizedXaiImageQuality } : {}),
                    ...(normalizedXaiAspectRatio ? { aspect_ratio: normalizedXaiAspectRatio } : {}),
                };

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

                return res.status(200).json({
                    images: images.slice(0, parsedNumImages).map((url) => ({
                        url,
                        model,
                        cost: 0,
                        provider: 'xai',
                    })),
                    meta: {
                        total_usage: 0,
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

                const maxAttempts = 20;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    await sleep(2000);

                    const pollResponse = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
                        headers: {
                            Authorization: `Bearer ${XAI_API_KEY}`,
                        },
                    });

                    if (!pollResponse.ok) {
                        const errorText = await pollResponse.text();
                        return res.status(pollResponse.status).json({
                            error: 'Failed to retrieve video generation status',
                            details: redactKey(errorText),
                        });
                    }

                    const pollData = await pollResponse.json();
                    const videoUrl =
                        pollData?.url ||
                        pollData?.video?.url ||
                        pollData?.response?.video?.url ||
                        pollData?.response?.url ||
                        null;
                    const status = String(pollData?.status || pollData?.state || '').toUpperCase();

                    if (videoUrl) {
                        return res.status(200).json({
                            images: [
                                {
                                    url: videoUrl,
                                    model,
                                    cost: 0,
                                    provider: 'xai',
                                    media_type: 'video',
                                },
                            ],
                            meta: {
                                total_usage: 0,
                                requests: [],
                                usage_pending: false,
                            },
                        });
                    }

                    if (['FAILED', 'ERROR', 'EXPIRED'].includes(status)) {
                        return res.status(502).json({ error: 'xAI video generation failed' });
                    }
                }

                return res.status(504).json({ error: 'xAI video generation timed out' });
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
            modalities: ['image', 'text'],
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
        console.log('Completion response keys:', Object.keys(data));
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
}
