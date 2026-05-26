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

    it('builds seedream 5 lite image-to-image payload with reference urls', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-lite',
            prompt: 'make the sky more dramatic',
            parsedNumImages: 1,
            normalizedAspectRatio: 'auto',
            resolution: '2K',
            uploadedImageUrls: [
                'https://example.com/ref-a.png',
                'https://example.com/ref-b.png',
            ],
            qualityOptions: ['2K', '3K'],
        });

        assert.deepEqual(payload, {
            model: 'doubao-seedream-5.0-lite',
            prompt: 'make the sky more dramatic',
            n: 1,
            size: 'auto',
            quality: '2K',
            prompt_priority: 'standard',
            image_urls: [
                'https://example.com/ref-a.png',
                'https://example.com/ref-b.png',
            ],
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

    it('runs Seedream 5 Lite through the documented async task contract', async () => {
        const createBodies = [];
        const uploadedUrls = [
            'https://files-api.evolink.ai/files/ref-a.png',
            'https://files-api.evolink.ai/files/ref-b.png',
        ];
        const resultUrl = 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream5/out.jpeg';
        const polledTaskUrls = [];
        let uploadCount = 0;

        global.fetch = async (url, options = {}) => {
            if (url === 'https://files-api.evolink.ai/api/v1/files/upload/base64') {
                const body = JSON.parse(options.body);
                assert.match(body.base64_data, /^data:image\//);
                return {
                    ok: true,
                    json: async () => ({
                        data: { file_url: uploadedUrls[uploadCount++] },
                    }),
                };
            }

            if (url === 'https://api.evolink.ai/v1/images/generations') {
                createBodies.push(JSON.parse(options.body));
                return {
                    ok: true,
                    json: async () => ({
                        id: 'task-unified-1757165031-seedream5lite',
                        model: 'doubao-seedream-5.0-lite',
                        object: 'image.generation.task',
                        progress: 0,
                        status: 'pending',
                        type: 'image',
                        usage: { credits_reserved: 1.8 },
                    }),
                };
            }

            if (String(url).startsWith('https://api.evolink.ai/v1/tasks/')) {
                polledTaskUrls.push(String(url));
                return {
                    ok: true,
                    json: async () => ({
                        id: 'task-unified-1757165031-seedream5lite',
                        model: 'doubao-seedream-5.0-lite',
                        object: 'image.generation.task',
                        progress: 100,
                        results: [resultUrl],
                        status: 'completed',
                        type: 'image',
                    }),
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        };

        const res = makeRes();
        await handleEvolink({
            res,
            model: 'evolink/doubao-seedream-5.0-lite',
            prompt: 'make the sky cinematic',
            parsedNumImages: 1,
            normalizedAspectRatio: '4:5',
            resolution: '3K',
            normalizedInputImages: [
                'data:image/png;base64,aaa',
                'data:image/webp;base64,bbb',
            ],
            evolinkKey: 'evolink-test-key',
        });

        assert.equal(res.statusCode, 200);
        assert.equal(uploadCount, 2);
        assert.deepEqual(createBodies, [{
            model: 'doubao-seedream-5.0-lite',
            prompt: 'make the sky cinematic',
            n: 1,
            size: '4:5',
            quality: '3K',
            prompt_priority: 'standard',
            image_urls: uploadedUrls,
        }]);
        assert.deepEqual(polledTaskUrls, [
            'https://api.evolink.ai/v1/tasks/task-unified-1757165031-seedream5lite',
        ]);
        assert.equal(res.body.images.length, 1);
        assert.equal(res.body.images[0].source_url, resultUrl);
        assert.equal(res.body.meta.requests[0].generation_id, 'task-unified-1757165031-seedream5lite');
    });
});
