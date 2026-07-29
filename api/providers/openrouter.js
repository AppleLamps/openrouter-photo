const { redactKey } = require('../_middleware');
const { getOpenRouterConfig } = require('../model-catalog');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildOpenRouterPayload({
    model,
    prompt,
    normalizedAspectRatio,
    resolution,
    normalizedInputImages,
    openRouterConfig,
    includeAspectRatio = true,
}) {
    const userContent = normalizedInputImages.length > 0
        ? [
            { type: 'text', text: prompt.trim() },
            ...normalizedInputImages.map((url) => ({
                type: 'image_url',
                image_url: { url },
            })),
        ]
        : prompt.trim();

    const payload = {
        model,
        messages: [{ role: 'user', content: userContent }],
        modalities: openRouterConfig.gemini ? ['image', 'text'] : ['image'],
        stream: false,
    };

    if (openRouterConfig.gemini) {
        payload.image_config = { aspect_ratio: normalizedAspectRatio };
        if (typeof resolution === 'string' && ['1K', '2K', '4K'].includes(resolution)) {
            payload.image_config.image_size = resolution;
        }
    } else if (openRouterConfig.seedream && includeAspectRatio) {
        payload.image_config = { aspect_ratio: normalizedAspectRatio };
    }

    return payload;
}

function extractImageUrls(openRouterJson) {
    const message = openRouterJson?.choices?.[0]?.message;
    const images = message?.images;
    if (!Array.isArray(images)) return [];
    return images
        .map((img) => img?.image_url?.url || img?.imageUrl?.url)
        .filter((url) => typeof url === 'string' && url.startsWith('data:image/'));
}

function extractUsageNumber(openRouterJson) {
    if (typeof openRouterJson?.usage?.total_cost === 'number') return openRouterJson.usage.total_cost;
    if (typeof openRouterJson?.usage === 'number') return openRouterJson.usage;
    return 0;
}

function calculateBilledUsage({ usageRequests, deliveredImages }) {
    const deliveredByMeta = new Map();
    for (const img of deliveredImages) {
        deliveredByMeta.set(img.metaIndex, (deliveredByMeta.get(img.metaIndex) || 0) + 1);
    }

    let totalUsage = 0;
    const billedRequests = usageRequests.map((meta, metaIndex) => {
        const deliveredCount = deliveredByMeta.get(metaIndex) || 0;
        const producedCount = meta.imageCount > 0 ? meta.imageCount : deliveredCount;
        const deliveredUsage = producedCount > 0
            ? meta.usage * Math.min(deliveredCount, producedCount) / producedCount
            : 0;

        totalUsage += meta.usage;

        return {
            ...meta,
            imageCount: deliveredCount,
            delivered_count: deliveredCount,
            generated_count: producedCount,
            delivered_usage: deliveredUsage,
        };
    });

    return { totalUsage, billedRequests };
}

async function fetchGenerationCost(generationId, openRouterApiKey, retries = 2) {
    if (!generationId) return { cost: 0, pending: false };

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                headers: { Authorization: `Bearer ${openRouterApiKey}` },
            });

            if (!response.ok) {
                if (attempt < retries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    continue;
                }
                return { cost: 0, pending: true };
            }

            const stats = await response.json();
            const data = stats?.data || stats;
            const cost = data?.usage ?? data?.total_cost ?? data?.cost ?? 0;

            if (typeof cost === 'number' && cost > 0) {
                return { cost, pending: false };
            }

            if (attempt < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                continue;
            }

            const parsed = typeof cost === 'number' ? cost : parseFloat(cost || 0);
            return { cost: Number.isFinite(parsed) ? parsed : 0, pending: false };
        } catch (e) {
            if (attempt < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                continue;
            }
            return { cost: 0, pending: true };
        }
    }
    return { cost: 0, pending: true };
}

async function handleOpenRouter(ctx) {
    const {
        req,
        res,
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        resolution,
        normalizedInputImages,
        openRouterApiKey,
    } = ctx;

    const openRouterConfig = getOpenRouterConfig(model);

    const extractUsageMeta = (openRouterJson) => ({
        model: openRouterJson?.model || model,
        provider_name: openRouterJson?.provider_name || openRouterJson?.provider || null,
        generation_id: openRouterJson?.generation_id || openRouterJson?.id || null,
        created_at: openRouterJson?.created_at || null,
        usage: extractUsageNumber(openRouterJson),
        usage_pending: false,
    });

    const requestSingle = async (options = {}) => {
        const { includeAspectRatio = true } = options;
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openRouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'http://localhost',
                'X-Title': 'AI Image Generator',
            },
            body: JSON.stringify(buildOpenRouterPayload({
                model,
                prompt,
                normalizedAspectRatio,
                resolution,
                normalizedInputImages,
                openRouterConfig,
                includeAspectRatio,
            })),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { ok: false, status: response.status, errorText };
        }

        const data = await response.json();
        return { ok: true, data };
    };

    const requestSingleWithFallback = async () => {
        const result = await requestSingle({ includeAspectRatio: true });
        if (!result.ok && openRouterConfig.aspectRatioFallback) {
            console.log('Seedream request failed with aspect_ratio, retrying without it...');
            return requestSingle({ includeAspectRatio: false });
        }
        return result;
    };

    try {
        const imageResults = [];
        const usageRequests = [];

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

        firstUrls.forEach((url) => {
            imageResults.push({
                url,
                model: firstMeta.model,
                cost: 0,
                provider: firstMeta.provider_name,
                metaIndex: 0,
            });
        });

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
                        metaIndex,
                    });
                });
            }
        }

        const limited = imageResults.slice(0, parsedNumImages);
        if (limited.length === 0) {
            return res.status(502).json({ error: 'No images returned from OpenRouter' });
        }

        await new Promise((resolve) => setTimeout(resolve, 150));

        await Promise.all(usageRequests.map(async (meta) => {
            if (meta.generation_id) {
                const initialUsage = meta.usage;
                const { cost, pending } = await fetchGenerationCost(meta.generation_id, openRouterApiKey);
                if (cost > 0) {
                    meta.usage = cost;
                } else if (pending && (!Number.isFinite(initialUsage) || initialUsage <= 0)) {
                    meta.usage_pending = true;
                }
            }
            return meta.usage;
        }));

        const { totalUsage, billedRequests } = calculateBilledUsage({
            usageRequests,
            deliveredImages: limited,
        });

        for (const img of limited) {
            const meta = usageRequests[img.metaIndex];
            const deliveredCount = billedRequests[img.metaIndex]?.delivered_count || 0;
            img.cost = deliveredCount > 0 ? meta.usage / deliveredCount : 0;
            delete img.metaIndex;
        }

        return res.status(200).json({
            images: limited,
            meta: {
                total_usage: totalUsage,
                requests: billedRequests,
                usage_pending: billedRequests.some((meta) => meta.usage_pending),
            },
        });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { handleOpenRouter, calculateBilledUsage };
