const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../shared/model-catalog.json');
const {
    normalizeModelId,
    resolveCapabilities,
    getBackend,
    getApiKey,
    getFalImageConfig,
    getFalVideoConfig,
    getFalVideoModel,
    getFalImageModel,
    requiresInputImage,
    listFalVideoModelIds,
    DEFAULT_MODEL_ID,
    LEGACY_MODEL_REDIRECTS,
} = require('../api/model-catalog');
const { buildFalImagePayload } = require('../api/providers/fal-image');
const { listModelsByBackend } = require('../api/generation-routing');

const FAL_IMAGE_VARIANTS = Object.keys(catalog.falImageVariants).filter((k) => !k.startsWith('_'));
const PROFILES = Object.keys(catalog.capabilityProfiles);
const MODEL_IDS = catalog.models.map((m) => m.id);

describe('catalog integrity — structure', () => {
    it('has unique model ids', () => {
        assert.equal(new Set(MODEL_IDS).size, MODEL_IDS.length);
        assert.equal(MODEL_IDS.length, 44);
    });

    it('every model references a valid profile', () => {
        for (const m of catalog.models) {
            assert.ok(PROFILES.includes(m.profile), `${m.id} → unknown profile ${m.profile}`);
        }
    });

    it('default and animate model ids exist in catalog', () => {
        assert.ok(MODEL_IDS.includes(DEFAULT_MODEL_ID));
        assert.ok(MODEL_IDS.includes(catalog.defaults.animateModelId));
    });

    it('legacy redirects resolve to catalog ids', () => {
        for (const [from, to] of Object.entries(LEGACY_MODEL_REDIRECTS)) {
            assert.ok(MODEL_IDS.includes(to), `redirect target missing: ${to}`);
            assert.equal(normalizeModelId(from), to);
        }
    });
});

describe('catalog integrity — routing', () => {
    it('every model resolves to a known backend and api key', () => {
        const backends = new Set(['openrouter', 'xai', 'fal-image', 'fal-video', 'evolink']);
        const apiKeys = new Set(['openrouter', 'xai', 'fal', 'evolink']);
        for (const id of MODEL_IDS) {
            const backend = getBackend(id);
            const apiKey = getApiKey(id);
            assert.ok(backends.has(backend), `${id} → unknown backend ${backend}`);
            assert.ok(apiKeys.has(apiKey), `${id} → unknown apiKey ${apiKey}`);
        }
    });

    it('backend counts match catalog', () => {
        const byBackend = listModelsByBackend();
        assert.equal(byBackend.openrouter.length, 8);
        assert.equal(byBackend.evolink.length, 5);
        assert.equal(byBackend['fal-image'].length, 21);
        assert.equal(byBackend.xai.length, 3);
        assert.equal(byBackend['fal-video'].length, 7);
    });

    it('all edit models require input images', () => {
        const edits = catalog.models.filter((m) => m.type === 'edit');
        assert.equal(edits.length, 9);
        for (const m of edits) {
            assert.equal(requiresInputImage(m.id), true, m.id);
        }
    });
});

describe('catalog integrity — fal image', () => {
    it('every fal-image model has a registered variant with payloadDefaults', () => {
        const falImageIds = MODEL_IDS.filter((id) => getBackend(id) === 'fal-image');
        assert.equal(falImageIds.length, 21);
        for (const id of falImageIds) {
            const cfg = getFalImageConfig(id);
            assert.ok(cfg?.variant, `${id} missing variant`);
            assert.ok(FAL_IMAGE_VARIANTS.includes(cfg.variant), `${id} → unregistered variant ${cfg.variant}`);
            assert.ok(cfg.payloadDefaults && Object.keys(cfg.payloadDefaults).length > 0, `${id} missing payloadDefaults`);
        }
    });

    it('every registered falImageVariant is used by at least one model', () => {
        const used = new Set(
            MODEL_IDS.filter((id) => getBackend(id) === 'fal-image').map((id) => getFalImageConfig(id).variant)
        );
        for (const variant of FAL_IMAGE_VARIANTS) {
            assert.ok(used.has(variant), `unused falImageVariant: ${variant}`);
        }
    });

    it('buildFalImagePayload succeeds for every fal-image model', () => {
        for (const id of MODEL_IDS.filter((mid) => getBackend(mid) === 'fal-image')) {
            const cfg = getFalImageConfig(id);
            const payload = buildFalImagePayload({
                model: id,
                prompt: 'test',
                parsedNumImages: 1,
                normalizedAspectRatio: '16:9',
                resolution: '1K',
                falImageConfig: cfg,
                falImageSize: 'landscape_16_9',
            });
            assert.equal(payload.prompt, 'test');
            assert.ok('image_size' in payload || 'aspect_ratio' in payload || cfg.variant === 'phota');
        }
    });

    it('getFalImageModel returns pricing shape when price is defined', () => {
        const priced = MODEL_IDS.filter((id) => getFalImageModel(id)?.price);
        assert.ok(priced.length >= 10);
        for (const id of priced) {
            const model = getFalImageModel(id);
            assert.ok(model.price.type, `${id} price.type`);
        }
    });
});

describe('catalog integrity — fal video', () => {
    it('lists all seven fal video models', () => {
        const ids = listFalVideoModelIds();
        assert.equal(ids.length, 7);
        assert.deepEqual(
            ids.sort(),
            MODEL_IDS.filter((id) => getBackend(id) === 'fal-video').sort()
        );
    });

    it('every fal-video model has variant config and getFalVideoModel', () => {
        const variants = new Set();
        for (const id of MODEL_IDS.filter((mid) => getBackend(mid) === 'fal-video')) {
            const cfg = getFalVideoConfig(id);
            assert.ok(cfg?.variant, `${id} missing falVideo.variant`);
            variants.add(cfg.variant);
            assert.ok(getFalVideoModel(id), `${id} getFalVideoModel returned null`);
        }
        assert.deepEqual([...variants].sort(), ['flashhead', 'happyHorse', 'pixverse', 'seedance15', 'seedance20']);
    });
});

describe('catalog integrity — model types', () => {
    it('covers expected type counts', () => {
        const counts = {};
        for (const m of catalog.models) {
            counts[m.type] = (counts[m.type] || 0) + 1;
        }
        assert.deepEqual(counts, {
            image: 27,
            edit: 9,
            'text-to-video': 3,
            'image-to-video': 5,
        });
    });
});
