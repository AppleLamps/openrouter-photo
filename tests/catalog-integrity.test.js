const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../shared/model-catalog.json');
const {
    normalizeModelId,
    getBackend,
    getApiKey,
    getEvolinkConfig,
    requiresInputImage,
    DEFAULT_MODEL_ID,
    LEGACY_MODEL_REDIRECTS,
} = require('../api/model-catalog');
const { listModelsByBackend } = require('../api/generation-routing');

const PROFILES = Object.keys(catalog.capabilityProfiles);
const MODEL_IDS = catalog.models.map((m) => m.id);

describe('catalog integrity — structure', () => {
    it('has unique model ids', () => {
        assert.equal(new Set(MODEL_IDS).size, MODEL_IDS.length);
        assert.equal(MODEL_IDS.length, 19);
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

    it('no fal models or backends remain', () => {
        for (const m of catalog.models) {
            assert.notEqual(m.via, 'fal', `${m.id} still marked via fal`);
            assert.ok(!getBackend(m.id).startsWith('fal'), `${m.id} still routes to a fal backend`);
            assert.notEqual(getApiKey(m.id), 'fal', `${m.id} still uses the fal api key`);
        }
    });
});

describe('catalog integrity — routing', () => {
    it('every model resolves to a known backend and api key', () => {
        const backends = new Set(['openrouter', 'xai', 'evolink', 'evolink-video']);
        const apiKeys = new Set(['openrouter', 'xai', 'evolink']);
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
        assert.equal(byBackend['evolink-video'].length, 3);
        assert.equal(byBackend.xai.length, 3);
    });

    it('all edit models require input images', () => {
        const edits = catalog.models.filter((m) => m.type === 'edit');
        assert.equal(edits.length, 1);
        for (const m of edits) {
            assert.equal(requiresInputImage(m.id), true, m.id);
        }
    });
});

describe('catalog integrity — evolink video', () => {
    it('exposes the seedance 2.0 image-to-video model with an async i2v profile', () => {
        const id = 'evolink/seedance-2.0/image-to-video';
        assert.ok(MODEL_IDS.includes(id));
        assert.equal(getBackend(id), 'evolink-video');
        assert.equal(getApiKey(id), 'evolink');
        assert.equal(requiresInputImage(id), true);

        const profile = catalog.capabilityProfiles[catalog.models.find((m) => m.id === id).profile];
        assert.equal(profile.async, true);
        assert.equal(profile.evolink.apiModel, 'seedance-2.0-image-to-video');
        assert.ok(Array.isArray(profile.evolink.aspectRatios));
    });

    it('the animate model is the evolink seedance video model', () => {
        assert.equal(getBackend(catalog.defaults.animateModelId), 'evolink-video');
    });
});

describe('catalog integrity — evolink image config', () => {
    it('resolves evolink image api models', () => {
        assert.equal(getEvolinkConfig('evolink/doubao-seedream-4.5').apiModel, 'doubao-seedream-4.5');
        assert.equal(getEvolinkConfig('evolink/z-image-turbo').apiModel, 'z-image-turbo');
        assert.equal(getEvolinkConfig('evolink/doubao-seedream-5.0-lite').apiModel, 'doubao-seedream-5.0-lite');
        assert.equal(getEvolinkConfig('evolink/doubao-seedream-5.0-pro').apiModel, 'doubao-seedream-5.0-pro');
    });
});

describe('catalog integrity — model types', () => {
    it('covers expected type counts', () => {
        const counts = {};
        for (const m of catalog.models) {
            counts[m.type] = (counts[m.type] || 0) + 1;
        }
        assert.deepEqual(counts, {
            image: 14,
            edit: 1,
            'text-to-video': 2,
            'image-to-video': 2,
        });
    });
});
