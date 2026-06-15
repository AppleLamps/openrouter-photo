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
    return {
        variant: evolink.variant || 'seedream',
        apiModel: evolink.apiModel || 'doubao-seedream-4.5',
        qualityOptions,
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

function getUiCapabilities(modelId) {
    const ui = resolveCapabilities(modelId).ui || {};
    return {
        aspectRatio: Boolean(ui.aspectRatio),
        resolution: ui.resolution || null,
        videoLength: ui.videoLength || null,
        videoQuality: ui.videoQuality || null,
        generateAudio: Boolean(ui.generateAudio),
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
    isXaiModel,
    isEvolinkModel,
    isEvolinkVideoModel,
    getEvolinkConfig,
    getOpenRouterConfig,
    getModelPricing,
    getUiCapabilities,
    DEFAULT_MODEL_ID: defaultModelId,
    LEGACY_MODEL_REDIRECTS: legacyRedirects,
};
