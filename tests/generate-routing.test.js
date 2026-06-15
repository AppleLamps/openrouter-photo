const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveProviderHandler,
    validateRequiredInputImages,
    normalizeInputImages,
    listModelsByBackend,
} = require('../api/generation-routing');
const { requiresInputImage } = require('../api/model-catalog');

const SAMPLE_IMAGE = 'data:image/png;base64,abc';

describe('generate routing — provider resolution', () => {
    it('each backend type has at least one model', () => {
        const byBackend = listModelsByBackend();
        const expected = ['openrouter', 'xai', 'evolink', 'evolink-video'];
        for (const backend of expected) {
            assert.ok(byBackend[backend]?.length >= 1, `missing models for backend: ${backend}`);
        }
    });

    it('resolves known backends', () => {
        assert.equal(resolveProviderHandler('black-forest-labs/flux.2-pro'), 'openrouter');
        assert.equal(resolveProviderHandler('grok-imagine-image'), 'xai');
        assert.equal(resolveProviderHandler('evolink/doubao-seedream-4.5/edit'), 'evolink');
        assert.equal(resolveProviderHandler('evolink/z-image-turbo'), 'evolink');
        assert.equal(resolveProviderHandler('evolink/doubao-seedream-5.0-lite/edit'), 'evolink');
        assert.equal(resolveProviderHandler('evolink/seedance-2.0/image-to-video'), 'evolink-video');
    });

    it('normalizes legacy ids before routing', () => {
        assert.equal(
            resolveProviderHandler('fal-ai/bytedance/seedance-2.0/image-to-video'),
            'evolink-video'
        );
    });
});

describe('generate routing — input image validation', () => {
    it('returns null when edit model has attached images', () => {
        const err = validateRequiredInputImages('evolink/doubao-seedream-4.5/edit', [SAMPLE_IMAGE]);
        assert.equal(err, null);
    });

    it('errors when requiresInputImage model has empty image_urls', () => {
        const err = validateRequiredInputImages('evolink/doubao-seedream-4.5/edit', []);
        assert.ok(err);
        assert.equal(err.status, 400);
        assert.match(err.error, /attached image/i);
    });

    it('errors when the seedance video model has no attached frames', () => {
        const err = validateRequiredInputImages('evolink/seedance-2.0/image-to-video', []);
        assert.ok(err);
        assert.equal(err.status, 400);
    });

    it('errors when image_urls is not an array', () => {
        const err = validateRequiredInputImages('evolink/doubao-seedream-4.5/edit', null);
        assert.ok(err);
    });

    it('allows t2i models without images', () => {
        const err = validateRequiredInputImages('evolink/z-image-turbo', []);
        assert.equal(err, null);
        assert.equal(requiresInputImage('evolink/z-image-turbo'), false);
    });

    it('allows evolink seedream 5 lite text-to-image and image-to-image without requiring edit tab', () => {
        assert.equal(validateRequiredInputImages('evolink/doubao-seedream-5.0-lite', []), null);
        assert.equal(
            validateRequiredInputImages('evolink/doubao-seedream-5.0-lite', [SAMPLE_IMAGE]),
            null
        );
        assert.equal(
            validateRequiredInputImages('evolink/doubao-seedream-5.0-lite/edit', [SAMPLE_IMAGE]),
            null
        );
    });

    it('normalizeInputImages filters non-data URLs and respects max', () => {
        const urls = normalizeInputImages([
            SAMPLE_IMAGE,
            'https://example.com/a.png',
            'data:image/jpeg;base64,xyz',
            'not-an-image',
        ], 1);
        assert.deepEqual(urls, [SAMPLE_IMAGE]);
    });
});
