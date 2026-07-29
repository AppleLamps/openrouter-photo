/**
 * Model catalog — UI exports backed by shared/model-catalog.json.
 * Capabilities and routing: see model-capabilities.js and shared/model-catalog.json.
 */

import {
    CATALOG_MODELS,
    DEFAULT_MODEL_ID,
    LEGACY_MODEL_REDIRECTS,
    getApiKey,
    getInputConstraints,
    getModelPricing,
    isVisibleInPicker,
} from './model-capabilities.js';

export {
    findModel as findModelById,
    normalizeModelId,
    resolveCapabilities,
    getUiCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    requiresInputImage,
    getInputConstraints,
    getOutputConstraints,
    isAsyncModel,
    getOpenRouterConfig,
    getModelPricing,
    isVisibleInPicker,
    ANIMATE_MODEL_ID,
    DEFAULT_MODEL_ID,
    LEGACY_MODEL_REDIRECTS,
} from './model-capabilities.js';

const API_KEY_LABELS = {
    openrouter: 'OpenRouter',
    xai: 'xAI',
    evolink: 'Evolink',
};

function formatUsd(amount) {
    if (!Number.isFinite(amount) || amount < 0) return null;
    const digits = amount < 0.01 ? 3 : amount < 0.1 ? 3 : 2;
    return `$${amount.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function getModelCostLabel(modelId) {
    const pricing = getModelPricing(modelId);
    const flat = pricing?.price?.type === 'flat' ? formatUsd(Number(pricing.price.amount)) : null;
    if (flat) return `~${flat}/output`;

    const perImage = formatUsd(Number(pricing?.perImageOutput));
    if (perImage) return `~${perImage}/image`;

    const perSecond = formatUsd(Number(pricing?.perSecondOutput));
    if (perSecond) return `~${perSecond}/sec`;

    return 'Usage-priced';
}

export function getModelInputLabel(modelId) {
    const input = getInputConstraints(modelId);
    const maxImages = Number.isInteger(input?.maxImages) ? input.maxImages : 0;
    if (maxImages <= 0) return 'Text only';
    if (input.required) return `Image required · max ${maxImages}`;
    return `Up to ${maxImages} image${maxImages === 1 ? '' : 's'}`;
}

function toPickerModel({ id, name, provider, type, modes, tier, via }) {
    const apiKey = getApiKey(id);
    return {
        id,
        name,
        provider,
        type,
        modes: Array.isArray(modes) ? modes : [type],
        tier,
        apiKey,
        apiKeyLabel: API_KEY_LABELS[apiKey] || apiKey,
        costLabel: getModelCostLabel(id),
        inputLabel: getModelInputLabel(id),
        ...(via ? { via } : {}),
    };
}

/** All catalog models (including picker-hidden entries). */
export const MODELS = CATALOG_MODELS.map(toPickerModel);

/** Models shown in the model picker. */
export const PICKER_MODELS = CATALOG_MODELS.filter((m) => isVisibleInPicker(m.id)).map(toPickerModel);

/** Tab → set of model types it includes. */
export const CAPABILITY_TABS = [
    { id: 'all', label: 'All', types: null },
    { id: 'image', label: 'Image', types: ['image'] },
    { id: 'edit', label: 'Edit', types: ['edit'] },
    { id: 'video', label: 'Video', types: ['text-to-video', 'image-to-video'] },
];

export const TYPE_PILL_LABEL = {
    image: 'Image',
    edit: 'Edit',
    'text-to-video': 'Text → Video',
    'image-to-video': 'Image → Video',
};

export const TIER_LABEL = {
    fast: 'Fast',
    balanced: 'Balanced',
    quality: 'High',
};

export function getTriggerLabel(id) {
    const m = MODELS.find((entry) => entry.id === id) || null;
    if (!m) return id || 'Select model';
    return m.via && m.via !== 'OpenRouter' ? `${m.name} · ${m.via}` : m.name;
}
