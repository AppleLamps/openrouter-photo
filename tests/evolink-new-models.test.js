const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleEvolink } = require('../api/providers/evolink');
const { handleEvolinkVideo } = require('../api/providers/evolink-video');
const { getEvolinkConfig, getBackend, requiresInputImage } = require('../api/model-catalog');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function makeRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
    };
}

/** Mocks Evolink upload + create endpoints; returns the captured create bodies. */
function mockEvolink(createUrl) {
    const bodies = [];
    let uploads = 0;
    global.fetch = async (url, options = {}) => {
        if (url.includes('/upload/base64')) {
            uploads += 1;
            const fileUrl = `https://files.example/ref-${uploads}.png`;
            return { ok: true, json: async () => ({ data: { file_url: fileUrl } }) };
        }
        assert.equal(url, createUrl);
        bodies.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ id: `task-${bodies.length}` }) };
    };
    return bodies;
}

async function runImage(model, overrides = {}) {
    const bodies = mockEvolink('https://api.evolink.ai/v1/images/generations');
    const res = makeRes();
    await handleEvolink({
        res,
        model,
        prompt: '  a lighthouse at dusk  ',
        parsedNumImages: 1,
        normalizedAspectRatio: '16:9',
        exactImageSize: null,
        resolution: '2K',
        normalizedInputImages: [],
        evolinkKey: 'test-key',
        ...overrides,
    });
    return { res, bodies };
}

async function runVideo(model, overrides = {}) {
    const bodies = mockEvolink('https://api.evolink.ai/v1/videos/generations');
    const res = makeRes();
    await handleEvolinkVideo({
        res,
        model,
        prompt: 'slow push in',
        normalizedInputImages: [],
        evolinkKey: 'test-key',
        xai_video_length: 5,
        ...overrides,
    });
    return { res, bodies };
}

describe('new Evolink image models', () => {
    it('GPT Image 2.6 Sunburst and Flare reuse the GPT Image route', async () => {
        for (const [model, apiModel] of [
            ['evolink/gpt-image-2.6-sunburst', 'gpt-image-2.6-sunburst'],
            ['evolink/gpt-image-2.6-flare', 'gpt-image-2.6-flare'],
        ]) {
            assert.equal(getEvolinkConfig(model).variant, 'gpt-image');
            const { res, bodies } = await runImage(model, { image_quality: 'high' });
            assert.equal(res.statusCode, 202);
            assert.deepEqual(bodies[0], {
                model: apiModel, prompt: 'a lighthouse at dusk', n: 1, size: '16:9', resolution: '2K', quality: 'high',
            });
            // high at 1K ($0.0527) scaled by the 2K multiplier (2.03).
            assert.equal(res.body.estimated_cost.toFixed(4), '0.1070');
        }
    });

    it('Seedream 5.5 omits n, sends output_format top-level and accepts 9:21', async () => {
        const { res, bodies } = await runImage('evolink/doubao-seedream-5.5', {
            normalizedAspectRatio: '9:21',
            resolution: '1.5K',
            output_format: 'jpeg',
            normalizedInputImages: ['data:image/png;base64,AAAA'],
        });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(bodies[0], {
            model: 'doubao-seedream-5.5',
            prompt: 'a lighthouse at dusk',
            size: '9:21',
            quality: '1.5K',
            prompt_priority: 'standard',
            output_format: 'jpeg',
            image_urls: ['https://files.example/ref-1.png'],
        });
        // 1.5K output ($0.016) + one reference image ($0.0064).
        assert.equal(res.body.estimated_cost.toFixed(4), '0.0224');
    });

    it('Seedream 5.0 Pro sends output_format top-level, as documented', async () => {
        const { bodies } = await runImage('evolink/doubao-seedream-5.0-pro', { resolution: '1.5K', output_format: 'png' });
        assert.deepEqual(bodies[0], {
            model: 'doubao-seedream-5.0-pro', prompt: 'a lighthouse at dusk', n: 1, size: '16:9', quality: '1.5K',
            prompt_priority: 'standard', output_format: 'png',
        });
    });

    it('Seedream 5.0 Lite keeps output_format in model_params', async () => {
        const { bodies } = await runImage('evolink/doubao-seedream-5.0-lite', { resolution: '4K', output_format: 'png' });
        assert.equal(bodies[0].quality, '4K');
        assert.deepEqual(bodies[0].model_params, { output_format: 'png' });
    });

    it('MiniMax H3 Image sends size + resolution and falls back to auto for unknown ratios', async () => {
        const { res, bodies } = await runImage('evolink/minimax-h3-image', {
            normalizedAspectRatio: '7:5',
            resolution: '4K',
            output_format: 'webp',
        });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(bodies[0], {
            model: 'minimax-h3-image', prompt: 'a lighthouse at dusk', n: 1, size: 'auto', resolution: '4K', output_format: 'webp',
        });
        assert.equal(res.body.estimated_cost.toFixed(3), '0.074');
    });

    it('Nano Banana 2.1 maps resolution to quality and supports extreme ratios', async () => {
        const { res, bodies } = await runImage('evolink/gemini-nano-banana-2.1', {
            normalizedAspectRatio: '8:1',
            resolution: '1K',
        });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(bodies[0], {
            model: 'gemini-nano-banana-2.1', prompt: 'a lighthouse at dusk', size: '8:1', quality: '1K',
        });
        assert.equal(res.body.estimated_cost.toFixed(4), '0.0306');
    });
});

describe('new Evolink video models', () => {
    it('routes all four video entries to evolink-video with the right image requirement', () => {
        assert.equal(getBackend('evolink/gemini-omni-1.2-flash/text-to-video'), 'evolink-video');
        assert.equal(getBackend('evolink/minimax-h3-max-turbo/text-to-video'), 'evolink-video');
        assert.equal(requiresInputImage('evolink/gemini-omni-1.2-flash/image-to-video'), true);
        assert.equal(requiresInputImage('evolink/minimax-h3-max-turbo/image-to-video'), true);
    });

    it('Gemini Omni 1.2 Flash T2V sends auto aspect ratio and 4k quality', async () => {
        const { res, bodies } = await runVideo('evolink/gemini-omni-1.2-flash/text-to-video', {
            normalizedAspectRatio: 'auto',
            xai_video_quality: '4k',
        });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(bodies[0], {
            model: 'gemini-omni-1.2-flash-text-to-video', prompt: 'slow push in', duration: 5, quality: '4k', aspect_ratio: 'auto',
        });
    });

    it('Gemini Omni 1.2 Flash I2V caps first+last frame clips at 10 seconds', async () => {
        const { bodies } = await runVideo('evolink/gemini-omni-1.2-flash/image-to-video', {
            normalizedInputImages: ['data:image/png;base64,A', 'data:image/png;base64,B'],
            xai_video_length: 15,
            normalizedAspectRatio: '1:1',
        });
        assert.deepEqual(bodies[0], {
            model: 'gemini-omni-1.2-flash-image-to-video',
            prompt: 'slow push in',
            duration: 10,
            quality: '720p',
            aspect_ratio: 'auto',
            image_urls: ['https://files.example/ref-1.png', 'https://files.example/ref-2.png'],
        });
    });

    it('MiniMax H3 Max Turbo T2V sends a 768p clip with its aspect ratio', async () => {
        const { res, bodies } = await runVideo('evolink/minimax-h3-max-turbo/text-to-video', {
            normalizedAspectRatio: '21:9',
        });
        assert.deepEqual(bodies[0], {
            model: 'minimax-h3-max-turbo-text-to-video', prompt: 'slow push in', duration: 5, quality: '768p', aspect_ratio: '21:9',
        });
        assert.equal(res.body.estimated_cost.toFixed(3), '0.190');
    });

    it('MiniMax H3 Max Turbo I2V sends image_start / image_end and no aspect ratio', async () => {
        const one = await runVideo('evolink/minimax-h3-max-turbo/image-to-video', {
            normalizedInputImages: ['data:image/png;base64,A'],
            xai_video_quality: '480p',
        });
        assert.deepEqual(one.bodies[0], {
            model: 'minimax-h3-max-turbo-image-to-video', prompt: 'slow push in', duration: 5, quality: '480p',
            image_start: 'https://files.example/ref-1.png',
        });

        const two = await runVideo('evolink/minimax-h3-max-turbo/image-to-video', {
            normalizedInputImages: ['data:image/png;base64,A', 'data:image/png;base64,B'],
        });
        assert.equal(two.bodies[0].image_start, 'https://files.example/ref-1.png');
        assert.equal(two.bodies[0].image_end, 'https://files.example/ref-2.png');
        assert.equal('image_urls' in two.bodies[0], false);
    });
});
