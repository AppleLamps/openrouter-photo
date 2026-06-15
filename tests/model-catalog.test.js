const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeModelId,
    resolveCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    requiresInputImage,
    getEvolinkConfig,
    getOpenRouterConfig,
    getModelPricing,
    isXaiModel,
    isEvolinkModel,
    isEvolinkVideoModel,
    DEFAULT_MODEL_ID,
} = require('../api/model-catalog');

describe('model catalog — identity & redirects', () => {
    it('normalizes legacy grok pro alias', () => {
        assert.equal(normalizeModelId('grok-imagine-image-pro'), 'grok-imagine-image-quality');
    });

    it('redirects legacy seedance 2.0 paths to the evolink video model', () => {
        assert.equal(
            normalizeModelId('fal-ai/bytedance/seedance-2.0/image-to-video'),
            'evolink/seedance-2.0/image-to-video'
        );
        assert.equal(
            normalizeModelId('bytedance/seedance-2.0/image-to-video'),
            'evolink/seedance-2.0/image-to-video'
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

    it('routes xai models', () => {
        assert.equal(getBackend('grok-imagine-image'), 'xai');
        assert.equal(getApiKey('grok-imagine-image'), 'xai');
        assert.ok(isXaiModel('grok-imagine-image'));
    });

    it('routes evolink image models', () => {
        assert.equal(getBackend('evolink/doubao-seedream-4.5/edit'), 'evolink');
        assert.equal(getApiKey('evolink/doubao-seedream-4.5/edit'), 'evolink');
        assert.ok(isEvolinkModel('evolink/doubao-seedream-4.5/edit'));
        assert.ok(requiresInputImage('evolink/doubao-seedream-4.5/edit'));
        assert.equal(getMaxInputImages('evolink/doubao-seedream-4.5'), 14);
        assert.equal(getBackend('evolink/z-image-turbo'), 'evolink');
        assert.equal(requiresInputImage('evolink/z-image-turbo'), false);
        assert.equal(getMaxInputImages('evolink/z-image-turbo'), 0);
        assert.equal(normalizeModelId('evolink/doubao-seedream-5.0-lite/edit'), 'evolink/doubao-seedream-5.0-lite');
        assert.equal(requiresInputImage('evolink/doubao-seedream-5.0-lite'), false);
    });

    it('routes the evolink seedance video model', () => {
        const id = 'evolink/seedance-2.0/image-to-video';
        assert.equal(getBackend(id), 'evolink-video');
        assert.equal(getApiKey(id), 'evolink');
        assert.ok(isEvolinkVideoModel(id));
        assert.ok(requiresInputImage(id));
        assert.equal(getMaxInputImages(id), 2);
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

    it('exposes seedance video api model and aspect ratios via capabilities', () => {
        const caps = resolveCapabilities('evolink/seedance-2.0/image-to-video');
        assert.equal(caps.evolink.apiModel, 'seedance-2.0-image-to-video');
        assert.ok(caps.evolink.aspectRatios.includes('adaptive'));
        assert.ok(caps.ui.videoLength);
        assert.equal(caps.ui.generateAudio, true);
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

    it('exposes Evolink transaction-derived image pricing', () => {
        assert.equal(getModelPricing('evolink/z-image-turbo').price.amount, 0.004);
        assert.equal(getModelPricing('evolink/doubao-seedream-4.5').price.amount, 0.035569230769);
        assert.equal(getModelPricing('evolink/doubao-seedream-4.5/edit').price.amount, 0.035569230769);
    });
});
