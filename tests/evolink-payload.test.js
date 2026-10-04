const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildEvolinkProxyUrl,
    buildSeedreamPayload,
    buildZImageTurboPayload,
    buildGptImagePayload,
    getEvolinkImageCostPerImage,
    handleEvolink,
    resolveBilledQuality,
    resolveGptImageBilledResolution,
    normalizeZImageAspectRatio,
    normalizeGptImageAspectRatio,
    normalizeGptImageResolution,
    normalizeGptImageQuality,
    normalizeSeedreamQuality,
    normalizeSeedreamOutputFormat,
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

    it('builds seedream 5 pro payload with 1K quality and PNG output', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-pro',
            prompt: 'a cinematic mountain landscape',
            parsedNumImages: 1,
            normalizedAspectRatio: '21:9',
            resolution: '1K',
            uploadedImageUrls: ['https://example.com/reference.png'],
            qualityOptions: ['1K', '2K'],
            outputFormat: 'png',
            outputFormatOptions: ['png', 'jpeg'],
        });

        assert.deepEqual(payload, {
            model: 'doubao-seedream-5.0-pro',
            prompt: 'a cinematic mountain landscape',
            n: 1,
            size: '21:9',
            quality: '1K',
            prompt_priority: 'standard',
            image_urls: ['https://example.com/reference.png'],
            model_params: { output_format: 'png' },
        });
    });

    it('uses the pro catalog default when resolution is omitted', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-pro',
            prompt: 'a studio portrait',
            parsedNumImages: 1,
            normalizedAspectRatio: '1:1',
            uploadedImageUrls: [],
            qualityOptions: ['1K', '2K'],
            qualityDefault: '1K',
        });

        assert.equal(payload.quality, '1K');
    });

    it('passes exact pro dimensions without a quality tier', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-pro',
            prompt: 'a studio portrait',
            parsedNumImages: 1,
            normalizedAspectRatio: 'auto',
            exactImageSize: '1600x1000',
            resolution: '2K',
            uploadedImageUrls: [],
            qualityOptions: ['1K', '2K'],
            qualityDefault: '1K',
        });

        assert.equal(payload.size, '1600x1000');
        assert.equal('quality' in payload, false);
    });

    it('adds web search tools for seedream 5 lite when enabled', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-lite',
            prompt: 'latest Paris fashion week trends',
            parsedNumImages: 1,
            normalizedAspectRatio: '3:4',
            resolution: '2K',
            uploadedImageUrls: [],
            qualityOptions: ['2K', '3K'],
            enableWebSearch: true,
        });

        assert.deepEqual(payload.model_params, {
            tools: [{ type: 'web_search' }],
        });
    });

    it('does not add web search tools when seedream 5 lite web search is disabled', () => {
        const payload = buildSeedreamPayload({
            apiModel: 'doubao-seedream-5.0-lite',
            prompt: 'a studio product photo',
            parsedNumImages: 1,
            normalizedAspectRatio: '1:1',
            resolution: '2K',
            uploadedImageUrls: [],
            qualityOptions: ['2K', '3K'],
            enableWebSearch: false,
        });

        assert.equal(payload.model_params, undefined);
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

    it('only accepts documented seedream output formats', () => {
        assert.equal(normalizeSeedreamOutputFormat('jpeg', ['png', 'jpeg']), 'jpeg');
        assert.equal(normalizeSeedreamOutputFormat('webp', ['png', 'jpeg']), null);
        assert.equal(normalizeSeedreamOutputFormat(undefined, ['png', 'jpeg']), null);
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

    // Rates published at evolink.ai/docs and the 2026-07-26 pricing changelog.
    it('prices Evolink image output from published per-image rates', () => {
        assert.equal(getEvolinkImageCostPerImage('evolink/z-image-turbo'), 0.0038);
        assert.equal(getEvolinkImageCostPerImage('evolink/doubao-seedream-4.5'), 0.03);
        assert.equal(getEvolinkImageCostPerImage('evolink/doubao-seedream-4.5/edit'), 0.03);
        assert.equal(getEvolinkImageCostPerImage('evolink/doubao-seedream-5.0-lite'), 0.028);
    });

    it('prices Seedream 5.0 Pro by output tier plus billable input images', () => {
        const model = 'evolink/doubao-seedream-5.0-pro';
        assert.equal(getEvolinkImageCostPerImage(model, { quality: '1K' }), 0.03375);
        assert.equal(getEvolinkImageCostPerImage(model, { quality: '2K' }), 0.0675);
        // Unknown/absent tier falls back to the model's default tier.
        assert.equal(getEvolinkImageCostPerImage(model), 0.03375);
        assert.equal(
            getEvolinkImageCostPerImage(model, { quality: '1K', inputImageCount: 2 }),
            0.03375 + (2 * 0.00225),
        );
    });

    it('derives the billed Seedream tier from exact pixel dimensions', () => {
        const tiers = { qualityOptions: ['1K', '2K'], qualityDefault: '1K' };
        assert.equal(resolveBilledQuality({ exactImageSize: '1024x1024', ...tiers }), '1K');
        assert.equal(resolveBilledQuality({ exactImageSize: '2048x2048', ...tiers }), '2K');
        assert.equal(resolveBilledQuality({ exactImageSize: '1664x2496', ...tiers }), '2K');
        // No exact size: the requested resolution decides.
        assert.equal(resolveBilledQuality({ resolution: '2K', ...tiers }), '2K');
    });

    // GPT Image 2.5 (gpt-image-2.5-sunburst / -flare) — evolink.ai/docs
    // api-manual/image-series/gpt-image-2.5/gpt-image-2.5-image-generation
    const GPT_IMAGE_TIERS = {
        resolutionOptions: ['1K', '2K', '4K'],
        resolutionDefault: '1K',
        qualityOptions: ['low', 'medium', 'high', 'xhigh', 'max'],
        qualityDefault: 'medium',
        outputFormatOptions: ['png', 'jpeg', 'webp'],
    };

    it('builds a GPT Image 2.5 text-to-image payload in ratio mode', () => {
        const payload = buildGptImagePayload({
            apiModel: 'gpt-image-2.5-sunburst',
            prompt: '  A beautiful colorful sunset over the ocean ',
            normalizedAspectRatio: '16:9',
            resolution: '2K',
            imageQuality: 'high',
            uploadedImageUrls: [],
            outputFormat: 'webp',
            ...GPT_IMAGE_TIERS,
        });

        assert.deepEqual(payload, {
            model: 'gpt-image-2.5-sunburst',
            prompt: 'A beautiful colorful sunset over the ocean',
            n: 1,
            size: '16:9',
            resolution: '2K',
            quality: 'high',
            output_format: 'webp',
        });
        assert.equal('prompt_priority' in payload, false);
        assert.equal('model_params' in payload, false);
    });

    it('omits resolution for GPT Image 2.5 auto and exact-pixel sizes', () => {
        const auto = buildGptImagePayload({
            apiModel: 'gpt-image-2.5-flare',
            prompt: 'a cat',
            normalizedAspectRatio: 'auto',
            resolution: '4K',
            imageQuality: 'low',
            ...GPT_IMAGE_TIERS,
        });
        assert.equal(auto.size, 'auto');
        assert.equal('resolution' in auto, false);
        assert.equal(auto.quality, 'low');

        const exact = buildGptImagePayload({
            apiModel: 'gpt-image-2.5-flare',
            prompt: 'a cat',
            normalizedAspectRatio: '16:9',
            exactImageSize: '3840x2160',
            resolution: '1K',
            imageQuality: 'max',
            ...GPT_IMAGE_TIERS,
        });
        assert.equal(exact.size, '3840x2160');
        assert.equal('resolution' in exact, false);
        assert.equal(exact.quality, 'max');
    });

    it('falls back to medium quality, 1K resolution, and auto size for unsupported GPT Image values', () => {
        const payload = buildGptImagePayload({
            apiModel: 'gpt-image-2.5-flare',
            prompt: 'a cat',
            normalizedAspectRatio: '7:5',
            resolution: '3K',
            imageQuality: 'ultra',
            outputFormat: 'gif',
            ...GPT_IMAGE_TIERS,
        });
        assert.equal(payload.size, 'auto');
        assert.equal('resolution' in payload, false);
        assert.equal(payload.quality, 'medium');
        assert.equal('output_format' in payload, false);

        assert.equal(normalizeGptImageAspectRatio('3:1'), '3:1');
        assert.equal(normalizeGptImageAspectRatio('9:21'), '9:21');
        assert.equal(normalizeGptImageAspectRatio('adaptive'), 'auto');
        assert.equal(normalizeGptImageResolution('2k', ['1K', '2K', '4K'], '1K'), '2K');
        assert.equal(normalizeGptImageResolution('8K', ['1K', '2K', '4K'], '1K'), '1K');
        assert.equal(normalizeGptImageQuality('XHIGH', GPT_IMAGE_TIERS.qualityOptions, 'medium'), 'xhigh');
        assert.equal(normalizeGptImageQuality(undefined, GPT_IMAGE_TIERS.qualityOptions, 'medium'), 'medium');
    });

    it('attaches uploaded reference images to GPT Image 2.5 edits', () => {
        const payload = buildGptImagePayload({
            apiModel: 'gpt-image-2.5-sunburst',
            prompt: 'replace the background with a studio sweep',
            normalizedAspectRatio: 'auto',
            imageQuality: 'medium',
            uploadedImageUrls: ['https://example.com/product.png', 'https://example.com/logo.png'],
            ...GPT_IMAGE_TIERS,
        });
        assert.deepEqual(payload.image_urls, ['https://example.com/product.png', 'https://example.com/logo.png']);
    });

    it('derives the billed GPT Image 2.5 resolution tier', () => {
        assert.equal(resolveGptImageBilledResolution({ size: '16:9', resolution: '2K' }), '2K');
        assert.equal(resolveGptImageBilledResolution({ size: 'auto', resolution: '4K' }), '1K');
        assert.equal(resolveGptImageBilledResolution({ exactImageSize: '1024x1024', size: '1:1', resolution: '4K' }), '1K');
        assert.equal(resolveGptImageBilledResolution({ exactImageSize: '2048x2048', size: '1:1', resolution: '1K' }), '2K');
        assert.equal(resolveGptImageBilledResolution({ exactImageSize: '3840x2160', size: '1:1', resolution: '1K' }), '4K');
    });

    // $0.027 per 1K output image tokens (evolink.ai/gpt-image-2-5-sunburst), at
    // 1024²: low 196, medium 439, high 1,756, xhigh 3,122, max 7,024 tokens.
    it('prices GPT Image 2.5 by quality tier, resolution tier, and reference images', () => {
        for (const model of ['evolink/gpt-image-2.5-sunburst', 'evolink/gpt-image-2.5-flare']) {
            assert.equal(getEvolinkImageCostPerImage(model, { quality: 'low', resolution: '1K' }), 0.0053);
            assert.equal(getEvolinkImageCostPerImage(model, { quality: 'medium', resolution: '1K' }), 0.0119);
            assert.equal(getEvolinkImageCostPerImage(model, { quality: 'max', resolution: '1K' }), 0.1896);
            assert.equal(getEvolinkImageCostPerImage(model, { quality: 'xhigh', resolution: '2K' }).toFixed(4), '0.1686');
            assert.equal(getEvolinkImageCostPerImage(model), 0.0119);
            assert.equal(
                getEvolinkImageCostPerImage(model, { quality: 'medium', resolution: '1K', inputImageCount: 1 }).toFixed(4),
                '0.0229',
            );
        }
    });

    it('runs GPT Image 2.5 through the documented async task contract', async () => {
        const createBodies = [];
        let uploadCount = 0;

        global.fetch = async (url, options = {}) => {
            if (url === 'https://files-api.evolink.ai/api/v1/files/upload/base64') {
                uploadCount += 1;
                return {
                    ok: true,
                    json: async () => ({ data: { file_url: `https://files-api.evolink.ai/files/ref-${uploadCount}.png` } }),
                };
            }

            if (url === 'https://api.evolink.ai/v1/images/generations') {
                assert.equal(options.headers.Authorization, 'Bearer evolink-test-key');
                createBodies.push(JSON.parse(options.body));
                return {
                    ok: true,
                    json: async () => ({
                        created: 1757156493,
                        id: 'task-unified-1757156493-imcg5zqt',
                        model: 'gpt-image-2.5-sunburst',
                        object: 'image.generation.task',
                        progress: 0,
                        status: 'pending',
                        task_info: { can_cancel: true, estimated_time: 100 },
                        type: 'image',
                        usage: { billing_rule: 'per_call', credits_reserved: 2.5, user_group: 'default' },
                    }),
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        };

        const res = makeRes();
        await handleEvolink({
            res,
            model: 'evolink/gpt-image-2.5-sunburst',
            prompt: 'put the product on a marble counter',
            parsedNumImages: 1,
            normalizedAspectRatio: '4:5',
            resolution: '2K',
            image_quality: 'high',
            output_format: 'png',
            normalizedInputImages: ['data:image/png;base64,aaa'],
            evolinkKey: 'evolink-test-key',
        });

        assert.equal(res.statusCode, 202);
        assert.equal(uploadCount, 1);
        assert.deepEqual(createBodies, [{
            model: 'gpt-image-2.5-sunburst',
            prompt: 'put the product on a marble counter',
            n: 1,
            size: '4:5',
            resolution: '2K',
            quality: 'high',
            output_format: 'png',
            image_urls: ['https://files-api.evolink.ai/files/ref-1.png'],
        }]);
        assert.equal(res.body.provider, 'evolink');
        assert.equal(res.body.media_type, 'image');
        assert.equal(res.body.request_id, 'task-unified-1757156493-imcg5zqt');
        // Reserved credits beat the catalog estimate: 2.5 credits × $0.0147.
        assert.equal(res.body.estimated_cost, 2.5 * 0.0147);
        assert.equal(res.body.requests[0].credits_reserved, 2.5);
    });

    it('uses the catalog estimate for GPT Image 2.5 when Evolink reserves no credits', async () => {
        global.fetch = async (url) => {
            if (url === 'https://api.evolink.ai/v1/images/generations') {
                return { ok: true, json: async () => ({ id: 'task-flare-1' }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        };

        const res = makeRes();
        await handleEvolink({
            res,
            model: 'evolink/gpt-image-2.5-flare',
            prompt: 'a lighthouse at dawn',
            parsedNumImages: 2,
            normalizedAspectRatio: '16:9',
            resolution: '2K',
            image_quality: 'xhigh',
            normalizedInputImages: [],
            evolinkKey: 'evolink-test-key',
        });

        assert.equal(res.statusCode, 202);
        assert.equal(res.body.requests.length, 2);
        assert.equal(res.body.requests[0].estimated_cost.toFixed(4), '0.1686');
        assert.equal(res.body.meta.total_usage.toFixed(4), '0.3372');
    });

    it('builds same-origin proxy URLs for Evolink hosted images', () => {
        const remoteUrl = 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/out.jpeg?token=abc';
        assert.equal(buildEvolinkProxyUrl(remoteUrl), `/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`);
    });

    it('runs requested Seedream image tasks concurrently', async () => {
        const createBodies = [];
        let createCount = 0;

        global.fetch = async (url, options = {}) => {
            if (url === 'https://api.evolink.ai/v1/images/generations') {
                createBodies.push(JSON.parse(options.body));
                createCount += 1;
                const requestNumber = createCount;
                return {
                    ok: true,
                    json: async () => ({ id: `task-${requestNumber}` }),
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
        assert.equal(res.statusCode, 202);
        assert.equal(createBodies.length, 2);
        assert.deepEqual(createBodies.map((body) => body.n), [1, 1]);
        assert.deepEqual(res.body.requests.map((request) => request.request_id), ['task-1', 'task-2']);
        assert.equal(res.body.status, 'pending');
        assert.equal(res.body.media_type, 'image');
    });

    it('uploads a complete independent reference set for every Seedream output task', async () => {
        const createBodies = [];
        let uploadCount = 0;
        let taskCount = 0;

        global.fetch = async (url, options = {}) => {
            if (url === 'https://files-api.evolink.ai/api/v1/files/upload/base64') {
                const body = JSON.parse(options.body);
                uploadCount += 1;
                return {
                    ok: true,
                    json: async () => ({
                        data: {
                            file_url: `https://files-api.evolink.ai/files/${uploadCount}-${encodeURIComponent(body.file_name)}`,
                        },
                    }),
                };
            }

            if (url === 'https://api.evolink.ai/v1/images/generations') {
                createBodies.push(JSON.parse(options.body));
                taskCount += 1;
                return {
                    ok: true,
                    json: async () => ({ id: `task-${taskCount}` }),
                };
            }

            throw new Error(`Unexpected fetch: ${url}`);
        };

        const res = makeRes();
        await handleEvolink({
            res,
            model: 'evolink/doubao-seedream-5.0-pro',
            prompt: 'put both people together',
            parsedNumImages: 3,
            normalizedAspectRatio: '4:3',
            resolution: '1K',
            normalizedInputImages: [
                'data:image/png;base64,first',
                'data:image/jpeg;base64,second',
            ],
            evolinkKey: 'evolink-test-key',
        });

        assert.equal(res.statusCode, 202);
        assert.equal(uploadCount, 6);
        assert.equal(createBodies.length, 3);
        assert.ok(createBodies.every((body) => body.n === 1 && body.image_urls.length === 2));
        assert.equal(
            new Set(createBodies.flatMap((body) => body.image_urls)).size,
            6,
            'each output task should receive unique uploaded reference URLs',
        );
    });

    it('runs Seedream 5 Lite through the documented async task contract', async () => {
        const createBodies = [];
        const uploadedUrls = [
            'https://files-api.evolink.ai/files/ref-a.png',
            'https://files-api.evolink.ai/files/ref-b.png',
        ];
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
            enable_web_search: true,
            evolinkKey: 'evolink-test-key',
        });

        assert.equal(res.statusCode, 202);
        assert.equal(uploadCount, 2);
        assert.deepEqual(createBodies, [{
            model: 'doubao-seedream-5.0-lite',
            prompt: 'make the sky cinematic',
            n: 1,
            size: '4:5',
            quality: '3K',
            prompt_priority: 'standard',
            image_urls: uploadedUrls,
            model_params: {
                tools: [{ type: 'web_search' }],
            },
        }]);
        assert.equal(res.body.request_id, 'task-unified-1757165031-seedream5lite');
        assert.equal(res.body.requests[0].request_id, 'task-unified-1757165031-seedream5lite');
    });
});
