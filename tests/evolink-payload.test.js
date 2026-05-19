const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildEvolinkProxyUrl,
    buildSeedreamPayload,
    buildZImageTurboPayload,
    getEvolinkImageCostPerImage,
    handleEvolink,
    normalizeZImageAspectRatio,
    normalizeSeedreamQuality,
} = require('../api/providers/evolink');

const originalFetch = global.fetch;

function makeRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
    };
}

afterEach(() => {
    global.fetch = originalFetch;
});

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

    it('prices Evolink image output from transaction-derived USD costs', () => {
        assert.equal(getEvolinkImageCostPerImage('evolink/z-image-turbo'), 0.004);
        assert.equal(getEvolinkImageCostPerImage('evolink/doubao-seedream-4.5'), 0.035569230769);
        assert.equal(getEvolinkImageCostPerImage('evolink/doubao-seedream-4.5/edit'), 0.035569230769);
    });

    it('builds same-origin proxy URLs for Evolink hosted images', () => {
        const remoteUrl = 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/out.jpeg?token=abc';
        assert.equal(buildEvolinkProxyUrl(remoteUrl), `/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`);
    });

    it('runs one Seedream task per requested image', async () => {
        const createBodies = [];
        const taskUrls = [
            'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/a.jpeg',
            'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/b.jpeg',
        ];
        let createCount = 0;

        global.fetch = async (url, options = {}) => {
            if (url === 'https://api.evolink.ai/v1/images/generations') {
                createBodies.push(JSON.parse(options.body));
                createCount += 1;
                return {
                    ok: true,
                    json: async () => ({ id: `task-${createCount}` }),
                };
            }

            if (String(url).startsWith('https://api.evolink.ai/v1/tasks/task-')) {
                const taskIndex = Number(String(url).split('task-')[1]) - 1;
                return {
                    ok: true,
                    json: async () => ({
                        status: 'completed',
                        data: { images: [taskUrls[taskIndex]] },
                    }),
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        };

        const res = makeRes();
        await handleEvolink({
            res,
            model: 'evolink/doubao-seedream-4.5',
            prompt: 'a city at night',
            parsedNumImages: 2,
            normalizedAspectRatio: '16:9',
            resolution: '2K',
            normalizedInputImages: [],
            evolinkKey: 'evolink-test-key',
        });

        assert.equal(res.statusCode, 200);
        assert.equal(createBodies.length, 2);
        assert.deepEqual(createBodies.map((body) => body.n), [1, 1]);
        assert.equal(res.body.images.length, 2);
        assert.deepEqual(res.body.images.map((image) => image.source_url), taskUrls);
        assert.ok(res.body.images.every((image) => image.url.startsWith('/api/image-proxy?url=')));
        assert.equal(res.body.meta.requests.length, 2);
    });
});
