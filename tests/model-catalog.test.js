const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeModelId,
    resolveCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    requiresInputImage,
    getFalImageConfig,
    getFalVideoConfig,
    getEvolinkConfig,
    getOpenRouterConfig,
    getModelPricing,
    isFalImageModel,
    isFalVideoModel,
    isFalEditModel,
    isKnownFalVideoModelId,
    listFalVideoModelIds,
    DEFAULT_MODEL_ID,
} = require('../api/model-catalog');
const { buildFalImagePayload } = require('../api/providers/fal-image');

describe('model catalog — identity & redirects', () => {
    it('normalizes legacy grok pro alias', () => {
        assert.equal(normalizeModelId('grok-imagine-image-pro'), 'grok-imagine-image-quality');
    });

    it('normalizes legacy seedance 2.0 fal paths', () => {
        assert.equal(
            normalizeModelId('fal-ai/bytedance/seedance-2.0/image-to-video'),
            'bytedance/seedance-2.0/image-to-video'
        );
    });

    it('falls back to default for unknown models', () => {
        assert.equal(normalizeModelId('not-a-real-model'), DEFAULT_MODEL_ID);
    });
});

describe('model catalog — backend routing', () => {
    it('routes OpenRouter flux models', () => {
        assert.equal(getBackend('black-forest-labs/flux.2-pro'), 'openrouter');
        assert.equal(getApiKey('black-forest-labs/flux.2-pro'), 'openrouter');
    });

    it('routes gemini via openrouter with gemini config', () => {
        const cfg = getOpenRouterConfig('google/gemini-3-pro-image-preview');
        assert.equal(getBackend('google/gemini-3-pro-image-preview'), 'openrouter');
        assert.equal(cfg.gemini, true);
    });

    it('routes seedream openrouter with fallback flag', () => {
        const cfg = getOpenRouterConfig('bytedance-seed/seedream-4.5');
        assert.equal(cfg.seedream, true);
        assert.equal(cfg.aspectRatioFallback, true);
    });

    it('routes fal image models', () => {
        assert.equal(getBackend('fal-ai/z-image/turbo/lora'), 'fal-image');
        assert.equal(getApiKey('fal-ai/z-image/turbo/lora'), 'fal');
        assert.ok(isFalImageModel('fal-ai/z-image/turbo/lora'));
    });

    it('routes fal edit models', () => {
        assert.ok(isFalEditModel('fal-ai/phota/edit'));
        assert.ok(requiresInputImage('fal-ai/phota/edit'));
        assert.equal(getMaxInputImages('fal-ai/phota/edit'), 10);
    });

    it('routes fal video models', () => {
        assert.equal(getBackend('fal-ai/pixverse/c1/image-to-video'), 'fal-video');
        assert.ok(isFalVideoModel('fal-ai/pixverse/c1/image-to-video'));
        assert.ok(isKnownFalVideoModelId('fal-ai/pixverse/c1/image-to-video'));
    });

    it('routes xai models', () => {
        assert.equal(getBackend('grok-imagine-image'), 'xai');
        assert.equal(getApiKey('grok-imagine-image'), 'xai');
    });

    it('routes evolink models', () => {
        assert.equal(getBackend('evolink/doubao-seedream-4.5/edit'), 'evolink');
        assert.equal(getApiKey('evolink/doubao-seedream-4.5/edit'), 'evolink');
        assert.ok(requiresInputImage('evolink/doubao-seedream-4.5/edit'));
        assert.equal(getMaxInputImages('evolink/doubao-seedream-4.5'), 14);
        assert.equal(getBackend('evolink/z-image-turbo'), 'evolink');
        assert.equal(getApiKey('evolink/z-image-turbo'), 'evolink');
        assert.equal(requiresInputImage('evolink/z-image-turbo'), false);
        assert.equal(getMaxInputImages('evolink/z-image-turbo'), 0);
        assert.equal(getBackend('evolink/doubao-seedream-5.0-lite'), 'evolink');
        assert.equal(getBackend('evolink/doubao-seedream-5.0-lite/edit'), 'evolink');
        assert.ok(requiresInputImage('evolink/doubao-seedream-5.0-lite/edit'));
        assert.equal(requiresInputImage('evolink/doubao-seedream-5.0-lite'), false);
    });
});

describe('model catalog — evolink config', () => {
    it('assigns seedream api model from profile', () => {
        const cfg = getEvolinkConfig('evolink/doubao-seedream-4.5');
        assert.equal(cfg.variant, 'seedream');
        assert.equal(cfg.apiModel, 'doubao-seedream-4.5');
    });

    it('assigns z-image-turbo api model from profile', () => {
        const cfg = getEvolinkConfig('evolink/z-image-turbo');
        assert.equal(cfg.variant, 'z-image-turbo');
        assert.equal(cfg.apiModel, 'z-image-turbo');
    });

    it('assigns seedream 5 lite api model and 3K quality options', () => {
        const cfg = getEvolinkConfig('evolink/doubao-seedream-5.0-lite');
        assert.equal(cfg.variant, 'seedream');
        assert.equal(cfg.apiModel, 'doubao-seedream-5.0-lite');
        assert.deepEqual(cfg.qualityOptions, ['2K', '3K']);
    });
});

describe('model catalog — fal image variants', () => {
    it('assigns z-image variant from catalog', () => {
        const cfg = getFalImageConfig('fal-ai/z-image/turbo/lora');
        assert.equal(cfg.variant, 'z-image');
        assert.equal(cfg.usesPresetImageSize, true);
        assert.equal(cfg.payloadDefaults.num_inference_steps, 8);
        assert.equal(cfg.payloadDefaults.enable_safety_checker, false);
    });

    it('assigns phota async queue flag', () => {
        const cfg = getFalImageConfig('fal-ai/phota');
        assert.equal(cfg.variant, 'phota');
        assert.equal(cfg.asyncQueue, true);
    });

    it('builds z-image payload shape', () => {
        const falImageConfig = getFalImageConfig('fal-ai/z-image/turbo/lora');
        const payload = buildFalImagePayload({
            model: 'fal-ai/z-image/turbo/lora',
            prompt: 'test prompt',
            parsedNumImages: 2,
            normalizedAspectRatio: '16:9',
            resolution: '1K',
            falImageConfig,
            falImageSize: 'landscape_16_9',
        });
        assert.equal(payload.num_inference_steps, 8);
        assert.equal(payload.image_size, 'landscape_16_9');
        assert.equal(payload.num_images, 2);
    });

    it('builds nucleus payload without image_size', () => {
        const falImageConfig = getFalImageConfig('fal-ai/nucleus-image');
        const payload = buildFalImagePayload({
            model: 'fal-ai/nucleus-image',
            prompt: 'test',
            parsedNumImages: 1,
            normalizedAspectRatio: '3:4',
            resolution: '1K',
            falImageConfig,
            falImageSize: undefined,
        });
        assert.equal(payload.aspect_ratio, '3:4');
        assert.equal(payload.num_images, 1);
    });
});

describe('model catalog — fal video config', () => {
    it('pixverse has audio and i2v flags', () => {
        const cfg = getFalVideoConfig('fal-ai/pixverse/c1/image-to-video');
        assert.equal(cfg.variant, 'pixverse');
        assert.equal(cfg.imageToVideo, true);
        assert.ok(cfg.pricing?.pixverseC1);
    });

    it('flashhead hides standard video UI capabilities', () => {
        const caps = resolveCapabilities('fal-ai/flashhead');
        assert.equal(caps.ui.flashhead, true);
        assert.equal(caps.ui.videoLength, undefined);
    });

    it('lists all fal video model ids', () => {
        const ids = listFalVideoModelIds();
        assert.ok(ids.includes('bytedance/seedance-2.0/image-to-video'));
        assert.ok(ids.includes('fal-ai/flashhead'));
        assert.equal(ids.length, 7);
    });
});

describe('model catalog — pricing', () => {
    it('exposes xai image pricing', () => {
        const pricing = getModelPricing('grok-imagine-image-quality');
        assert.equal(pricing.perImageOutput, 0.07);
        assert.equal(pricing.inputImageCost, 0.002);
    });

    it('exposes xai video per-second pricing', () => {
        const pricing = getModelPricing('grok-imagine-video');
        assert.equal(pricing.perSecondOutput, 0.05);
    });
});
