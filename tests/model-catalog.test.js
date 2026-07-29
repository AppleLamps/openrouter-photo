const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeModelId,
    resolveCapabilities,
    getApiKey,
    getBackend,
    getMaxInputImages,
    getInputConstraints,
    requiresInputImage,
    getEvolinkConfig,
    getOpenRouterConfig,
    getModelPricing,
    getImageOutputPrice,
    getVideoPricePerSecond,
    evolinkCreditsToUsd,
    catalog,
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
        assert.equal(normalizeModelId('evolink/doubao-seedream-5.0-pro/edit'), 'evolink/doubao-seedream-5.0-pro');
        assert.equal(getBackend('evolink/doubao-seedream-5.0-pro'), 'evolink');
        assert.equal(getMaxInputImages('evolink/doubao-seedream-5.0-pro'), 10);
        assert.equal(requiresInputImage('evolink/doubao-seedream-5.0-pro'), false);
    });

    it('routes the evolink seedance video models', () => {
        const i2v = 'evolink/seedance-2.0/image-to-video';
        assert.equal(getBackend(i2v), 'evolink-video');
        assert.equal(getApiKey(i2v), 'evolink');
        assert.ok(isEvolinkVideoModel(i2v));
        assert.ok(requiresInputImage(i2v));
        assert.equal(getMaxInputImages(i2v), 2);

        const t2v = 'evolink/seedance-2.0/text-to-video';
        assert.equal(getBackend(t2v), 'evolink-video');
        assert.equal(getApiKey(t2v), 'evolink');
        assert.ok(isEvolinkVideoModel(t2v));
        assert.equal(requiresInputImage(t2v), false);
        assert.equal(getMaxInputImages(t2v), 0);
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

    it('assigns seedream 5 pro api model, quality, and output format options', () => {
        const cfg = getEvolinkConfig('evolink/doubao-seedream-5.0-pro');
        assert.equal(cfg.variant, 'seedream');
        assert.equal(cfg.apiModel, 'doubao-seedream-5.0-pro');
        assert.deepEqual(cfg.qualityOptions, ['1K', '2K']);
        assert.equal(cfg.qualityDefault, '1K');
        assert.deepEqual(cfg.outputFormatOptions, ['png', 'jpeg']);
        const input = getInputConstraints('evolink/doubao-seedream-5.0-pro');
        assert.equal(input.promptMaxLength, 2000);
        assert.equal(input.imageConstraints.minWidth, 15);
    });

    it('exposes seedance video api model and aspect ratios via capabilities', () => {
        const caps = resolveCapabilities('evolink/seedance-2.0/image-to-video');
        assert.equal(caps.evolink.apiModel, 'seedance-2.0-image-to-video');
        assert.ok(caps.evolink.aspectRatios.includes('adaptive'));
        assert.ok(caps.ui.videoLength);
        assert.equal(caps.ui.generateAudio, true);
    });

    it('exposes seedance text-to-video with web search and no required input', () => {
        const caps = resolveCapabilities('evolink/seedance-2.0/text-to-video');
        assert.equal(caps.evolink.apiModel, 'seedance-2.0-text-to-video');
        assert.equal(caps.evolink.supportsWebSearch, true);
        assert.equal(caps.ui.webSearch, true);
        assert.equal(caps.ui.imageToVideoHint, undefined);
        assert.equal(caps.input.required, false);
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

    it('exposes Evolink published image pricing', () => {
        assert.equal(getModelPricing('evolink/z-image-turbo').price.amount, 0.0038);
        assert.equal(getModelPricing('evolink/doubao-seedream-4.5').price.amount, 0.03);
        assert.equal(getModelPricing('evolink/doubao-seedream-4.5/edit').price.amount, 0.03);
        assert.equal(getModelPricing('evolink/doubao-seedream-5.0-lite').price.amount, 0.028);
    });

    it('prices every Evolink model so spend is never silently recorded as zero', () => {
        const evolinkModels = catalog.models.filter((model) => String(model.id).startsWith('evolink/'));
        assert.ok(evolinkModels.length > 0);
        for (const model of evolinkModels) {
            const priced = model.type.endsWith('video')
                ? getVideoPricePerSecond(model.id, undefined) > 0
                : getImageOutputPrice(model.id, undefined) > 0;
            assert.ok(priced, `${model.id} has no usable price in the catalog`);
        }
    });

    it('exposes Evolink video per-second pricing by resolution', () => {
        const seedance = 'evolink/seedance-2.0/text-to-video';
        assert.equal(getVideoPricePerSecond(seedance, '480p'), 0.092);
        assert.equal(getVideoPricePerSecond(seedance, '720p'), 0.199);
        assert.equal(getVideoPricePerSecond(seedance, '1080p'), 0.496);
        // Unknown resolution falls back to the model's default tier.
        assert.equal(getVideoPricePerSecond(seedance, '4K'), 0.199);
    });

    it('converts Evolink credits to USD at the published credit rate', () => {
        assert.equal(evolinkCreditsToUsd(0), 0);
        assert.equal(evolinkCreditsToUsd(2.295).toFixed(5), '0.03374');
        assert.equal(evolinkCreditsToUsd(null), null);
        assert.equal(evolinkCreditsToUsd(-1), null);
    });
});
