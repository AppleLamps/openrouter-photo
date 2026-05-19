/**
 * Model capability resolution (CommonJS) — mirrors js/model-capabilities.js.
 */

const catalog = require('../shared/model-catalog.json');

const { capabilityProfiles, models, legacyRedirects, defaultModelId, defaults } = catalog;

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

    if (entry.falImage) {
        merged.falImage = deepMerge(merged.falImage || {}, entry.falImage);
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

function isFalImageModel(modelId) {
    return getBackend(modelId) === 'fal-image';
}

function isFalVideoModel(modelId) {
    return getBackend(modelId) === 'fal-video';
}

function isFalEditModel(modelId) {
    const caps = resolveCapabilities(modelId);
    return caps.backend === 'fal-image' && caps.type === 'edit';
}

function isXaiModel(modelId) {
    return getBackend(modelId) === 'xai';
}

function isEvolinkModel(modelId) {
    return getBackend(modelId) === 'evolink';
}

function getFalVideoConfig(modelId) {
    const caps = resolveCapabilities(modelId);
    if (caps.backend !== 'fal-video') return null;
    const entry = findModel(caps.modelId);
    return {
        ...(caps.falVideo || {}),
        pricing: caps.pricing || entry?.pricing || {},
    };
}

function getFalImageConfig(modelId) {
    const caps = resolveCapabilities(modelId);
    if (caps.backend !== 'fal-image') return null;
    const falImage = caps.falImage || { variant: 'seedream-default', usesPresetImageSize: false };
    const variant = falImage.variant || 'seedream-default';
    const variantRegistry = catalog.falImageVariants?.[variant] || {};
    const payloadDefaults = {
        ...(variantRegistry.payloadDefaults || {}),
        ...(falImage.payloadDefaults || {}),
    };
    return { ...falImage, variant, payloadDefaults };
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

function getUiCapabilities(modelId) {
    const ui = resolveCapabilities(modelId).ui || {};
    return {
        aspectRatio: Boolean(ui.aspectRatio),
        resolution: ui.resolution || null,
        videoLength: ui.videoLength || null,
        videoQuality: ui.videoQuality || null,
        generateAudio: Boolean(ui.generateAudio),
        flashhead: Boolean(ui.flashhead),
        imageToVideoHint: Boolean(ui.imageToVideoHint),
    };
}

function listFalVideoModelIds() {
    return models
        .filter((m) => capabilityProfiles[m.profile]?.backend === 'fal-video')
        .map((m) => m.id);
}

function isKnownFalVideoModelId(modelId) {
    const id = legacyRedirects[modelId] || modelId;
    return listFalVideoModelIds().includes(id);
}

function normalizeFalVideoModel(model) {
    return normalizeModelId(model);
}

function getFalImageModel(model) {
    if (!isFalImageModel(model)) return null;
    const caps = resolveCapabilities(model);
    const pricing = caps.pricing || {};
    return {
        ...pricing,
        edit: caps.type === 'edit',
    };
}

function getFalVideoModel(model) {
    const id = normalizeModelId(model);
    if (!isFalVideoModel(id)) return null;
    const config = getFalVideoConfig(id);
    if (!config) return null;
    const { pricing, ...falVideo } = config;
    return {
        ...falVideo,
        ...pricing,
    };
}

function getFalImageCostPerImage(model, imageSize, estimateMegapixelsFromImageSize, options = {}) {
    const config = getFalImageModel(model);
    const price = config?.price;
    if (!price) return 0;

    const imageCount = Number.isFinite(options.imageCount) && options.imageCount > 0
        ? options.imageCount
        : 1;
    if (imageCount <= 0) return 0;

    let totalCost = 0;
    if (price.type === 'mpix') {
        totalCost += price.amount * estimateMegapixelsFromImageSize(imageSize) * imageCount;
    } else if (price.type === 'resolution') {
        totalCost += (imageSize === '4K' ? price.fourK : price.oneK) * imageCount;
    } else {
        totalCost += price.amount * imageCount;
    }

    const inputPrice = config?.inputPrice;
    const inputImageCount = Number.isFinite(options.inputImageCount) && options.inputImageCount > 0
        ? options.inputImageCount
        : 0;
    const inputMegapixels = inputPrice?.megapixels;
    if (
        inputPrice?.type === 'mpix' &&
        inputImageCount > 0 &&
        Number.isFinite(inputMegapixels) &&
        inputMegapixels > 0
    ) {
        totalCost += inputPrice.amount * inputMegapixels * inputImageCount;
    }

    return totalCost / imageCount;
}

module.exports = {
    catalog,
    findModel,
    normalizeModelId,
    normalizeFalVideoModel,
    resolveCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    requiresInputImage,
    isFalImageModel,
    isFalVideoModel,
    isFalEditModel,
    isXaiModel,
    isEvolinkModel,
    isKnownFalVideoModelId,
    getFalVideoConfig,
    getFalImageConfig,
    getOpenRouterConfig,
    getModelPricing,
    getUiCapabilities,
    listFalVideoModelIds,
    getFalImageModel,
    getFalVideoModel,
    getFalImageCostPerImage,
    DEFAULT_MODEL_ID: defaultModelId,
    LEGACY_MODEL_REDIRECTS: legacyRedirects,
};
