module.exports = async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Api-Key');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        prompt,
        model = 'black-forest-labs/flux.2-pro',
        num_images = 1,
        // UI sends these; only Gemini models currently support image_config options reliably
        aspect_ratio,
        image_size, // legacy "preset" from UI; used to derive aspect ratio if aspect_ratio isn't set
        resolution, // legacy UI field; repurposed as Gemini image_config.image_size (1K/2K/4K)
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

    const OPENROUTER_API_KEY =
        req.headers['x-openrouter-api-key'] ||
        req.headers['x-openrouter-api_key'];

    if (!OPENROUTER_API_KEY) {
        return res.status(401).json({
            code: 'OPENROUTER_API_KEY_REQUIRED',
            error: 'OpenRouter API key required',
            help: {
                message: 'Open Settings → paste your OpenRouter API key. Create one at openrouter.ai/keys.',
                url: 'https://openrouter.ai/keys'
            }
        });
    }

    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    const isGeminiModel = typeof model === 'string' && model.startsWith('google/gemini-');

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

    const buildPayload = () => {
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

    const fetchGenerationCost = async (generationId, retries = 3) => {
        if (!generationId) return 0;

        // Small delay to allow OpenRouter to calculate cost
        await new Promise((resolve) => setTimeout(resolve, 500));

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                    headers: {
                        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    },
                });

                if (!response.ok) {
                    console.error(`Generation cost fetch failed (attempt ${attempt + 1}):`, response.status);
                    if (attempt < retries - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        continue;
                    }
                    return 0;
                }

                const stats = await response.json();
                console.log(`Generation stats for ${generationId}:`, JSON.stringify(stats, null, 2));

                // OpenRouter returns cost in the `usage` field (in USD) - check both wrapped and unwrapped
                const data = stats?.data || stats;
                const cost = data?.usage ?? data?.total_cost ?? data?.cost ?? 0;
                console.log(`Extracted cost: ${cost}`);

                if (typeof cost === 'number' && cost > 0) {
                    return cost;
                }

                // If cost is still 0, might need to wait for calculation
                if (attempt < retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    continue;
                }

                return typeof cost === 'number' ? cost : parseFloat(cost || 0);
            } catch (e) {
                console.error(`Error fetching generation cost (attempt ${attempt + 1}):`, e);
                if (attempt < retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    continue;
                }
                return 0;
            }
        }
        return 0;
    };

    const extractUsageMeta = (openRouterJson) => {
        return {
            model: openRouterJson?.model || model,
            provider_name: openRouterJson?.provider_name || openRouterJson?.provider || null,
            generation_id: openRouterJson?.generation_id || openRouterJson?.id || null,
            created_at: openRouterJson?.created_at || null,
            usage: extractUsageNumber(openRouterJson),
        };
    };

    const requestSingle = async () => {
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'http://localhost',
                'X-Title': 'AI Image Generator',
            },
            body: JSON.stringify(buildPayload()),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { ok: false, status: response.status, errorText };
        }

        const data = await response.json();
        console.log('Completion response keys:', Object.keys(data));
        return { ok: true, data };
    };

    try {
        /** @type {Array<{url: string, model: string, cost: number, provider: string|null}>} */
        const imageResults = [];
        /** @type {Array<{model: string, provider_name: (string|null), generation_id: (string|number|null), created_at: (string|null), usage: number}>} */
        const usageRequests = [];
        let totalUsage = 0;

        // First call: some models may return multiple images in one response.
        const first = await requestSingle();
        if (!first.ok) {
            console.error('OpenRouter API error:', first.errorText);
            return res.status(first.status).json({
                error: 'Failed to generate image',
                details: first.errorText,
            });
        }

        const firstUrls = extractImageUrls(first.data);
        const firstMeta = extractUsageMeta(first.data);
        console.log('Completion response id:', first.data?.id, 'generation_id:', first.data?.generation_id);
        console.log('Extracted generation_id:', firstMeta.generation_id);

        // Always fetch cost from generation endpoint for image generation
        // (completion response only has token counts, not actual USD cost)
        if (firstMeta.generation_id) {
            const fetchedCost = await fetchGenerationCost(firstMeta.generation_id);
            if (fetchedCost > 0) {
                firstMeta.usage = fetchedCost;
            }
        }

        usageRequests.push(firstMeta);
        totalUsage += firstMeta.usage;

        // Pro-rate cost per image from this request
        const firstCostPerImage = firstUrls.length > 0 ? firstMeta.usage / firstUrls.length : 0;
        firstUrls.forEach((url) => {
            imageResults.push({
                url,
                model: firstMeta.model,
                cost: firstCostPerImage,
                provider: firstMeta.provider_name
            });
        });

        // Fallback: if the provider only returns 1 image, loop up to num_images.
        while (imageResults.length < parsedNumImages) {
            const next = await requestSingle();
            if (!next.ok) {
                console.error('OpenRouter API error:', next.errorText);
                return res.status(next.status).json({
                    error: 'Failed to generate image',
                    details: next.errorText,
                });
            }

            const nextUrls = extractImageUrls(next.data);
            const nextMeta = extractUsageMeta(next.data);

            // Always fetch cost from generation endpoint for image generation
            if (nextMeta.generation_id) {
                const fetchedCost = await fetchGenerationCost(nextMeta.generation_id);
                if (fetchedCost > 0) {
                    nextMeta.usage = fetchedCost;
                }
            }

            usageRequests.push(nextMeta);
            totalUsage += nextMeta.usage;

            // Pro-rate cost per image from this request
            const nextCostPerImage = nextUrls.length > 0 ? nextMeta.usage / nextUrls.length : 0;
            nextUrls.forEach((url) => {
                imageResults.push({
                    url,
                    model: nextMeta.model,
                    cost: nextCostPerImage,
                    provider: nextMeta.provider_name
                });
            });
        }

        // Trim to requested count
        const limited = imageResults.slice(0, parsedNumImages);
        if (limited.length === 0) {
            return res.status(502).json({
                error: 'No images returned from OpenRouter',
            });
        }

        return res.status(200).json({
            images: limited,
            meta: {
                total_usage: totalUsage,
                requests: usageRequests,
            },
        });
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
