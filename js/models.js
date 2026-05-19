/**
 * Model catalog — UI exports backed by shared/model-catalog.json.
 * Capabilities and routing: see model-capabilities.js and shared/model-catalog.json.
 */

import { CATALOG_MODELS, DEFAULT_MODEL_ID, LEGACY_MODEL_REDIRECTS } from './model-capabilities.js';

export {
    findModel as findModelById,
    normalizeModelId,
    resolveCapabilities,
    getUiCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    requiresInputImage,
    isAsyncModel,
    getFalImageConfig,
    getFalVideoConfig,
    getOpenRouterConfig,
    getModelPricing,
    ANIMATE_MODEL_ID,
    DEFAULT_MODEL_ID,
    LEGACY_MODEL_REDIRECTS,
} from './model-capabilities.js';

/** @type {import('./model-capabilities.js').CATALOG_MODELS} */
export const MODELS = CATALOG_MODELS.map(({ id, name, provider, type, tier, via }) => ({
    id,
    name,
    provider,
    type,
    tier,
    ...(via ? { via } : {}),
}));

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
