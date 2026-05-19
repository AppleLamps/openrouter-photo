/**
 * Model catalog. Single source of truth for the model picker UI and the
 * trigger label. When adding a model, append it here and it will appear
 * in the picker automatically.
 *
 * Fields:
 *   id        - the value sent to the backend (must match server expectations)
 *   name      - friendly display name (short)
 *   provider  - logical provider/family group (used for section headers)
 *   type      - 'image' | 'edit' | 'text-to-video' | 'image-to-video'
 *   tier      - 'fast' | 'balanced' | 'quality'
 *   via       - optional infra/router label (e.g. 'fal', 'OpenRouter')
 */
export const MODELS = [
    // ───── Bytedance: Seedream (image) ─────
    { id: 'bytedance-seed/seedream-4.5',                           name: 'Seedream 4.5',           provider: 'Bytedance', type: 'image', tier: 'quality',  via: 'OpenRouter' },
    { id: 'evolink/doubao-seedream-4.5',                           name: 'Seedream 4.5',           provider: 'Bytedance', type: 'image', tier: 'quality',  via: 'Evolink' },
    { id: 'evolink/doubao-seedream-4.5/edit',                      name: 'Seedream 4.5 Edit',      provider: 'Bytedance', type: 'edit',  tier: 'quality',  via: 'Evolink' },
    { id: 'fal-ai/bytedance/seedream/v4.5/text-to-image',          name: 'Seedream 4.5',           provider: 'Bytedance', type: 'image', tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/bytedance/seedream/v4.5/edit',                   name: 'Seedream 4.5 Edit',      provider: 'Bytedance', type: 'edit',  tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',       name: 'Seedream 5 Lite',        provider: 'Bytedance', type: 'image', tier: 'fast',     via: 'fal' },
    { id: 'fal-ai/bytedance/seedream/v5/lite/edit',                name: 'Seedream 5 Lite Edit',   provider: 'Bytedance', type: 'edit',  tier: 'fast',     via: 'fal' },

    // ───── Black Forest Labs: Flux ─────
    { id: 'fal-ai/flux-pro/v1.1',                                  name: 'Flux 1.1 Pro',           provider: 'Black Forest Labs', type: 'image', tier: 'quality',  via: 'fal' },
    { id: 'black-forest-labs/flux.2-pro',                          name: 'Flux 2 Pro',             provider: 'Black Forest Labs', type: 'image', tier: 'quality' },
    { id: 'black-forest-labs/flux.2-max',                          name: 'Flux 2 Max',             provider: 'Black Forest Labs', type: 'image', tier: 'quality' },
    { id: 'black-forest-labs/flux.2-flex',                         name: 'Flux 2 Flex',            provider: 'Black Forest Labs', type: 'image', tier: 'balanced' },
    { id: 'fal-ai/flux-2/klein/9b/edit/lora',                      name: 'Flux 2 Klein 9B LoRA',   provider: 'Black Forest Labs', type: 'edit',  tier: 'balanced', via: 'fal' },

    // ───── Google ─────
    { id: 'google/gemini-3-pro-image-preview',                     name: 'Gemini 3 Pro Image',     provider: 'Google',    type: 'image', tier: 'quality' },
    { id: 'google/gemini-2.5-flash-image',                         name: 'Gemini 2.5 Flash Image', provider: 'Google',    type: 'image', tier: 'fast' },

    // ───── OpenAI ─────
    { id: 'openai/gpt-5-image',                                    name: 'GPT-5 Image',            provider: 'OpenAI',    type: 'image', tier: 'quality' },
    { id: 'openai/gpt-5-image-mini',                               name: 'GPT-5 Image Mini',       provider: 'OpenAI',    type: 'image', tier: 'fast' },

    // ───── xAI: Grok ─────
    { id: 'grok-imagine-image-quality',                            name: 'Grok Image Quality',     provider: 'xAI',       type: 'image', tier: 'quality' },
    { id: 'grok-imagine-image',                                    name: 'Grok Image',             provider: 'xAI',       type: 'image', tier: 'balanced' },
    { id: 'grok-imagine-video',                                    name: 'Grok Video',             provider: 'xAI',       type: 'text-to-video', tier: 'quality' },

    // ───── Bytedance: Seedance (video) ─────
    { id: 'bytedance/seedance-2.0/text-to-video',                  name: 'Seedance 2.0',           provider: 'Bytedance', type: 'text-to-video',  tier: 'quality', via: 'fal' },
    { id: 'bytedance/seedance-2.0/image-to-video',                 name: 'Seedance 2.0',           provider: 'Bytedance', type: 'image-to-video', tier: 'quality', via: 'fal' },
    { id: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',      name: 'Seedance 1.5 Pro',       provider: 'Bytedance', type: 'text-to-video',  tier: 'quality', via: 'fal' },
    { id: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',     name: 'Seedance 1.5 Pro',       provider: 'Bytedance', type: 'image-to-video', tier: 'quality', via: 'fal' },
    { id: 'fal-ai/pixverse/c1/image-to-video',                     name: 'PixVerse C1',            provider: 'PixVerse',  type: 'image-to-video', tier: 'quality', via: 'fal' },
    { id: 'alibaba/happy-horse/reference-to-video',                name: 'Happy Horse',            provider: 'Alibaba',   type: 'image-to-video', tier: 'quality', via: 'fal' },
    { id: 'fal-ai/flashhead',                                      name: 'FlashHead',              provider: 'fal.ai',    type: 'image-to-video', tier: 'fast',    via: 'fal' },

    // ───── Wan ─────
    { id: 'fal-ai/wan/v2.7/pro/text-to-image',                     name: 'Wan 2.7 Pro',            provider: 'Wan',       type: 'image', tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/wan/v2.7/text-to-image',                         name: 'Wan 2.7',                provider: 'Wan',       type: 'image', tier: 'balanced', via: 'fal' },
    { id: 'fal-ai/wan/v2.7/pro/edit',                              name: 'Wan 2.7 Pro Edit',       provider: 'Wan',       type: 'edit',  tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/wan/v2.7/edit',                                  name: 'Wan 2.7 Edit',           provider: 'Wan',       type: 'edit',  tier: 'balanced', via: 'fal' },

    // ───── Other ─────
    { id: 'fal-ai/qwen-image-max/text-to-image',                   name: 'Qwen-Image Max',         provider: 'Qwen',      type: 'image', tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/qwen-image-max/edit',                            name: 'Qwen-Image Max Edit',    provider: 'Qwen',      type: 'edit',  tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/bitdance',                                       name: 'BitDance',               provider: 'BitDance',  type: 'image', tier: 'balanced', via: 'fal' },
    { id: 'fal-ai/z-image/turbo/lora',                             name: 'Z-Image Turbo',          provider: 'Tongyi',    type: 'image', tier: 'fast',     via: 'fal' },
    { id: 'fal-ai/phota',                                          name: 'Phota',                  provider: 'fal.ai',    type: 'image', tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/phota/edit',                                     name: 'Phota Edit',             provider: 'fal.ai',    type: 'edit',  tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/nucleus-image',                                  name: 'Nucleus',                provider: 'Nucleus',   type: 'image', tier: 'balanced', via: 'fal' },
    { id: 'fal-ai/glm-image',                                      name: 'GLM Image',              provider: 'Zhipu AI',   type: 'image', tier: 'quality',  via: 'fal' },
    { id: 'fal-ai/ovis-image',                                     name: 'Ovis Image',             provider: 'Ovis',       type: 'image', tier: 'fast',     via: 'fal' },
    { id: 'fal-ai/ernie-image/lora',                               name: 'Ernie LoRA',             provider: 'Baidu',     type: 'image', tier: 'balanced', via: 'fal' },
    { id: 'fal-ai/ernie-image/lora/turbo',                         name: 'Ernie Image Turbo',      provider: 'Baidu',     type: 'image', tier: 'fast',     via: 'fal' },
];

/** Tab → set of model types it includes. */
export const CAPABILITY_TABS = [
    { id: 'all',   label: 'All',   types: null },
    { id: 'image', label: 'Image', types: ['image'] },
    { id: 'edit',  label: 'Edit',  types: ['edit'] },
    { id: 'video', label: 'Video', types: ['text-to-video', 'image-to-video'] },
];

export const TYPE_PILL_LABEL = {
    'image':           'Image',
    'edit':            'Edit',
    'text-to-video':   'Text → Video',
    'image-to-video':  'Image → Video',
};

export const TIER_LABEL = {
    fast:     'Fast',
    balanced: 'Balanced',
    quality:  'High',
};

/** Default selection if the persisted value isn't in the catalog anymore. */
export const DEFAULT_MODEL_ID = 'fal-ai/z-image/turbo/lora';

export const LEGACY_MODEL_REDIRECTS = {
    'grok-imagine-image-pro': 'grok-imagine-image-quality',
    'fal-ai/bytedance/seedance-2.0/text-to-video': 'bytedance/seedance-2.0/text-to-video',
    'fal-ai/bytedance/seedance-2.0/image-to-video': 'bytedance/seedance-2.0/image-to-video',
};

export function findModelById(id) {
    return MODELS.find(m => m.id === id) || null;
}

export function normalizeModelId(id) {
    const redirected = LEGACY_MODEL_REDIRECTS[id] || id;
    return findModelById(redirected) ? redirected : DEFAULT_MODEL_ID;
}

export function getTriggerLabel(id) {
    const m = findModelById(id);
    if (!m) return id || 'Select model';
    return m.via && m.via !== 'OpenRouter' ? `${m.name} · ${m.via}` : m.name;
}
