/**
 * Model capability resolution (CommonJS) — mirrors js/model-capabilities.js.
 */

const catalog = require('../shared/model-catalog.json');

const { capabilityProfiles, models, legacyRedirects, defaultModelId, defaults, providers } = catalog;

// Evolink bills in credits; the dashboard publishes the credit → USD rate.
const EVOLINK_CREDIT_USD = Number(providers?.evolink?.creditUsd) || 0.0147;

function deepMerge(base, override) {
    if (!override) return base ? { ...base } : {};
    const out = base ? { ...base } : {};
    for (const key of Object.keys(override)) {
        const value = override[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            out[key] = deepMerge(out[key] || {}, value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

function findModel(id) {
    if (!id || typeof id !== 'string') return null;
    return models.find((m) => m.id === id) || null;
}

function normalizeModelId(id) {
    if (!id || typeof id !== 'string') return defaultModelId;
    const redirected = legacyRedirects[id] || id;
    return findModel(redirected) ? redirected : defaultModelId;
}

function resolveCapabilities(modelId) {
    const id = normalizeModelId(modelId);
    const entry = findModel(id);
    if (!entry) {
        return {
            apiKey: 'openrouter',
            backend: 'openrouter',
            ui: {},
            input: { maxImages: 3, required: false },
        };
    }

    const profile = capabilityProfiles[entry.profile] || {};
    const merged = deepMerge(profile, entry.capabilities || {});

    if (entry.evolink) {
        merged.evolink = deepMerge(merged.evolink || {}, entry.evolink);
    }

    if (entry.pricing) {
        merged.pricing = { ...(profile.pricing || {}), ...entry.pricing };
    } else if (profile.pricing) {
        merged.pricing = profile.pricing;
    }

    merged.modelId = id;
    merged.type = entry.type;
    return merged;
}

function getApiKey(modelId) {
    return resolveCapabilities(modelId).apiKey;
}

function getBackend(modelId) {
    return resolveCapabilities(modelId).backend;
}

function getMaxInputImages(modelId) {
    return resolveCapabilities(modelId).input?.maxImages ?? 3;
}

function requiresInputImage(modelId) {
    return Boolean(resolveCapabilities(modelId).input?.required);
}

function getInputConstraints(modelId) {
    return resolveCapabilities(modelId).input || {};
}

function getOutputConstraints(modelId) {
    const output = resolveCapabilities(modelId).output || {};
    return {
        maxImages: Number.isInteger(output.maxImages) ? output.maxImages : 4,
        defaultImages: Number.isInteger(output.defaultImages) ? output.defaultImages : 2,
    };
}

function isXaiModel(modelId) {
    return getBackend(modelId) === 'xai';
}

function isEvolinkModel(modelId) {
    return getBackend(modelId) === 'evolink';
}

function isEvolinkVideoModel(modelId) {
    return getBackend(modelId) === 'evolink-video';
}

function getEvolinkConfig(modelId) {
    const caps = resolveCapabilities(modelId);
    if (caps.backend !== 'evolink') return null;
    const evolink = caps.evolink || { variant: 'seedream', apiModel: 'doubao-seedream-4.5' };
    const qualityOptions = caps.ui?.resolution?.options || ['2K', '4K'];
    const qualityDefault = caps.ui?.resolution?.default || qualityOptions[0];
    const outputFormatOptions = caps.ui?.outputFormat?.options || [];
    return {
        variant: evolink.variant || 'seedream',
        apiModel: evolink.apiModel || 'doubao-seedream-4.5',
        qualityOptions,
        qualityDefault,
        outputFormatOptions,
    };
}

function getOpenRouterConfig(modelId) {
    const caps = resolveCapabilities(modelId);
    if (caps.backend !== 'openrouter') return {};
    return caps.openrouter || {};
}

function getModelPricing(modelId) {
    const caps = resolveCapabilities(modelId);
    return caps.pricing || {};
}

function pickTieredAmount(amounts, tier, fallbackTier) {
    if (!amounts || typeof amounts !== 'object') return null;
    const candidates = [tier, fallbackTier, ...Object.keys(amounts)];
    for (const key of candidates) {
        const amount = Number(amounts[key]);
        if (Number.isFinite(amount) && amount >= 0) return amount;
    }
    return null;
}

/**
 * Price of a single generated image, in USD.
 * Supports flat pricing and per-quality tiers (e.g. Seedream 5.0 Pro 1K vs 2K).
 */
function getImageOutputPrice(modelId, quality) {
    const price = getModelPricing(modelId).price;
    if (!price) return 0;
    if (price.type === 'byQuality') {
        return pickTieredAmount(price.amounts, quality, price.default) ?? 0;
    }
    if (price.type === 'flat' && Number.isFinite(price.amount)) return price.amount;
    return 0;
}

/** Per-billable-input-image surcharge, in USD (Evolink bills reference images separately). */
function getInputImagePrice(modelId) {
    const amount = Number(getModelPricing(modelId).inputImageCost);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Price per second of generated video, in USD.
 * Supports a flat number and per-quality tiers (480p/720p/1080p).
 */
function getVideoPricePerSecond(modelId, quality) {
    const pricing = getModelPricing(modelId);
    const perSecond = pricing.pricePerSecond ?? pricing.perSecondOutput;
    if (Number.isFinite(perSecond)) return perSecond;
    return pickTieredAmount(perSecond, quality, pricing.defaultQuality) ?? 0;
}

/**
 * Convert Evolink credits to USD. Returns null when no credit figure is
 * available so callers fall back to an estimate instead of recording $0
 * (`Number(null)` is 0, so the type check has to come first).
 */
function evolinkCreditsToUsd(credits) {
    if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) return null;
    return credits * EVOLINK_CREDIT_USD;
}

function getUiCapabilities(modelId) {
    const ui = resolveCapabilities(modelId).ui || {};
    return {
        aspectRatio: Boolean(ui.aspectRatio),
        aspectRatioOptions: ui.aspectRatioOptions || null,
        exactSize: ui.exactSize || null,
        resolution: ui.resolution || null,
        outputFormat: ui.outputFormat || null,
        videoLength: ui.videoLength || null,
        videoQuality: ui.videoQuality || null,
        generateAudio: Boolean(ui.generateAudio),
        contentFilter: Boolean(ui.contentFilter),
        webSearch: Boolean(ui.webSearch),
        flashhead: Boolean(ui.flashhead),
        imageToVideoHint: Boolean(ui.imageToVideoHint),
    };
}

module.exports = {
    catalog,
    findModel,
    normalizeModelId,
    resolveCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    requiresInputImage,
    getInputConstraints,
    getOutputConstraints,
    isXaiModel,
    isEvolinkModel,
    isEvolinkVideoModel,
    getEvolinkConfig,
    getOpenRouterConfig,
    getModelPricing,
    getImageOutputPrice,
    getInputImagePrice,
    getVideoPricePerSecond,
    evolinkCreditsToUsd,
    EVOLINK_CREDIT_USD,
    getUiCapabilities,
    DEFAULT_MODEL_ID: defaultModelId,
    LEGACY_MODEL_REDIRECTS: legacyRedirects,
};
