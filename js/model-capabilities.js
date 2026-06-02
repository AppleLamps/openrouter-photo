/**
 * Model capability resolution — shared logic for UI and API routing.
 * Data lives in ../shared/model-catalog.json.
 */

import catalog from '../shared/model-catalog.json' with { type: 'json' };

const { capabilityProfiles, models, legacyRedirects, defaultModelId, defaults, picker: pickerConfig } = catalog;

const PICKER_HIDDEN_API_KEYS = new Set(pickerConfig?.hiddenApiKeys || []);

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

export function findModel(id) {
    if (!id || typeof id !== 'string') return null;
    return models.find((m) => m.id === id) || null;
}

export function normalizeModelId(id) {
    if (!id || typeof id !== 'string') return defaultModelId;
    const redirected = legacyRedirects[id] || id;
    return findModel(redirected) ? redirected : defaultModelId;
}

export function resolveCapabilities(modelId) {
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

export function getApiKey(modelId) {
    return resolveCapabilities(modelId).apiKey;
}

/** Whether the model should appear in the model picker (catalog entries remain for routing). */
export function isVisibleInPicker(modelId) {
    const entry = findModel(normalizeModelId(modelId));
    if (!entry) return false;
    if (entry.pickerHidden === true) return false;
    if (entry.pickerVisible === true) return true;
    return !PICKER_HIDDEN_API_KEYS.has(getApiKey(entry.id));
}

export function getBackend(modelId) {
    return resolveCapabilities(modelId).backend;
}

export function getMaxInputImages(modelId) {
    return resolveCapabilities(modelId).input?.maxImages ?? 3;
}

export function requiresInputImage(modelId) {
    return Boolean(resolveCapabilities(modelId).input?.required);
}

export function isAsyncModel(modelId) {
    return Boolean(resolveCapabilities(modelId).async);
}

export function isFalImageModel(modelId) {
    return getBackend(modelId) === 'fal-image';
}

export function isFalVideoModel(modelId) {
    return getBackend(modelId) === 'fal-video';
}

export function isFalEditModel(modelId) {
    const caps = resolveCapabilities(modelId);
    return caps.backend === 'fal-image' && caps.type === 'edit';
}

export function isXaiModel(modelId) {
    return getBackend(modelId) === 'xai';
}

export function isEvolinkModel(modelId) {
    return getBackend(modelId) === 'evolink';
}

export function isOpenRouterModel(modelId) {
    return getBackend(modelId) === 'openrouter';
}

export function getFalVideoConfig(modelId) {
    const caps = resolveCapabilities(modelId);
    if (caps.backend !== 'fal-video') return null;
    const entry = findModel(caps.modelId);
    return {
        ...(caps.falVideo || {}),
        pricing: caps.pricing || entry?.pricing || {},
    };
}

export function getFalImageConfig(modelId) {
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

export function getOpenRouterConfig(modelId) {
    const caps = resolveCapabilities(modelId);
    if (caps.backend !== 'openrouter') return {};
    return caps.openrouter || {};
}

export function getModelPricing(modelId) {
    const caps = resolveCapabilities(modelId);
    return caps.pricing || {};
}

export function getUiCapabilities(modelId) {
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

export function listFalVideoModelIds() {
    return models
        .filter((m) => capabilityProfiles[m.profile]?.backend === 'fal-video')
        .map((m) => m.id);
}

export function isKnownFalVideoModelId(modelId) {
    const id = legacyRedirects[modelId] || modelId;
    return listFalVideoModelIds().includes(id);
}

export const DEFAULT_MODEL_ID = defaultModelId;
export const LEGACY_MODEL_REDIRECTS = legacyRedirects;
export const ANIMATE_MODEL_ID = defaults?.animateModelId || 'bytedance/seedance-2.0/image-to-video';
export const CATALOG_MODELS = models;
