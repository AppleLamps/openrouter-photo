const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildSeedreamPayload,
    buildZImageTurboPayload,
    normalizeZImageAspectRatio,
    normalizeSeedreamQuality,
} = require('../api/providers/evolink');

describe('evolink payload builders', () => {
    it('builds seedream 4.5 payload with quality and batch count', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-4.5',
            prompt: 'a cat',
            parsedNumImages: 2,
            normalizedAspectRatio: '16:9',
            resolution: '4K',
            uploadedImageUrls: ['https://example.com/ref.jpg'],
            qualityOptions: ['2K', '4K'],
        });

        assert.deepEqual(payload, {
            model: 'doubao-seedream-4.5',
            prompt: 'a cat',
            n: 2,
            size: '16:9',
            quality: '4K',
            prompt_priority: 'standard',
            image_urls: ['https://example.com/ref.jpg'],
        });
    });

    it('builds seedream 5 lite payload with 3K quality', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-lite',
            prompt: 'a lake at sunset',
            parsedNumImages: 1,
            normalizedAspectRatio: '16:9',
            resolution: '3K',
            uploadedImageUrls: [],
            qualityOptions: ['2K', '3K'],
        });

        assert.deepEqual(payload, {
            model: 'doubao-seedream-5.0-lite',
            prompt: 'a lake at sunset',
            n: 1,
            size: '16:9',
            quality: '3K',
            prompt_priority: 'standard',
        });
    });

    it('falls back to 2K when resolution is unsupported for seedream quality', () => {
        assert.equal(normalizeSeedreamQuality('4K', ['2K', '3K']), '2K');
        assert.equal(normalizeSeedreamQuality('3K', ['2K', '3K']), '3K');
    });

    it('builds z-image-turbo payload with nsfw check disabled', () => {
        const payload = buildZImageTurboPayload({
            apiModel: 'z-image-turbo',
            prompt: 'a cute cat',
            normalizedAspectRatio: '3:4',
        });

        assert.deepEqual(payload, {
            model: 'z-image-turbo',
            prompt: 'a cute cat',
            size: '3:4',
            nsfw_check: false,
        });
    });

    it('maps unsupported aspect ratios for z-image-turbo', () => {
        assert.equal(normalizeZImageAspectRatio('21:9'), '16:9');
        assert.equal(normalizeZImageAspectRatio('9:21'), '9:16');
        assert.equal(normalizeZImageAspectRatio('unknown'), '1:1');
    });
});
