const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveProviderHandler,
    validateRequiredInputImages,
    normalizeInputImages,
    normalizeExactImageSize,
    listModelsByBackend,
} = require('../api/generation-routing');
const { requiresInputImage } = require('../api/model-catalog');

const SAMPLE_IMAGE = 'data:image/png;base64,abc';

describe('generate routing — provider resolution', () => {
    it('each backend type has at least one model', () => {
        const byBackend = listModelsByBackend();
        const expected = ['openrouter', 'openrouter-video', 'xai', 'evolink', 'evolink-video'];
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
        assert.equal(resolveProviderHandler('evolink/doubao-seedream-5.0-pro'), 'evolink');
        assert.equal(resolveProviderHandler('evolink/seedance-2.0/image-to-video'), 'evolink-video');
        assert.equal(resolveProviderHandler('evolink/seedance-2.0/text-to-video'), 'evolink-video');
    });

    it('normalizes legacy ids before routing', () => {
        assert.equal(
            resolveProviderHandler('fal-ai/bytedance/seedance-2.0/image-to-video'),
            'evolink-video'
        );
    });
});

describe('generate routing — exact image size', () => {
    const model = 'evolink/doubao-seedream-5.0-pro';

    it('accepts documented presets and valid custom dimensions', () => {
        assert.deepEqual(normalizeExactImageSize(model, '832x1248'), { value: '832x1248' });
        assert.deepEqual(normalizeExactImageSize(model, '1600x1000'), { value: '1600x1000' });
    });

    it('rejects malformed and out-of-range dimensions', () => {
        assert.match(normalizeExactImageSize(model, '1000xnope').error, /WIDTHxHEIGHT/);
        assert.match(normalizeExactImageSize(model, '500x500').error, /supported/);
        assert.match(normalizeExactImageSize(model, '4096x128').error, /supported/);
    });

    it('enforces GPT Image 2.5 pixel alignment, edge, pixel, and ratio limits', () => {
        const model = 'evolink/gpt-image-2.5-flare';
        assert.deepEqual(normalizeExactImageSize(model, '1024x1024'), { value: '1024x1024' });
        assert.deepEqual(normalizeExactImageSize(model, '3840x2160'), { value: '3840x2160' });
        assert.deepEqual(normalizeExactImageSize(model, '1536x1024'), { value: '1536x1024' });
        assert.match(normalizeExactImageSize(model, '1000x1000').error, /multiples of 16/);
        assert.match(normalizeExactImageSize(model, '3856x2160').error, /outside the supported|3840/);
        // Within the pixel budget and 16-aligned, but one edge exceeds 3840 px.
        assert.match(normalizeExactImageSize(model, '3856x1600').error, /3840 pixels per side/);
        // Below the 655,360 pixel floor.
        assert.match(normalizeExactImageSize(model, '512x512').error, /outside the supported/);
        // 4:1 exceeds the 3:1 aspect limit.
        assert.match(normalizeExactImageSize(model, '2048x512').error, /outside the supported/);
        // Seedream 5.0 Pro has no alignment rule, so odd sizes still pass there.
        assert.deepEqual(normalizeExactImageSize('evolink/doubao-seedream-5.0-pro', '1600x1000'), { value: '1600x1000' });
    });

    it('rejects exact dimensions for unsupported models', () => {
        assert.match(normalizeExactImageSize('evolink/z-image-turbo', '1024x1024').error, /not supported/);
        assert.equal(normalizeExactImageSize(model, 'square_hd'), null);
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

    it('allows seedance text-to-video without images', () => {
        assert.equal(validateRequiredInputImages('evolink/seedance-2.0/text-to-video', []), null);
        assert.equal(requiresInputImage('evolink/seedance-2.0/text-to-video'), false);
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

    it('allows evolink seedream 5 pro text-to-image and image-to-image without requiring edit tab', () => {
        assert.equal(validateRequiredInputImages('evolink/doubao-seedream-5.0-pro', []), null);
        assert.equal(
            validateRequiredInputImages('evolink/doubao-seedream-5.0-pro', [SAMPLE_IMAGE]),
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
