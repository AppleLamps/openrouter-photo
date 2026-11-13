const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyExtraOptions, sanitizeExtraOptions } = require('../api/extra-options');
const { getUiCapabilities, catalog } = require('../api/model-catalog');
const { handleEvolink } = require('../api/providers/evolink');
const { handleEvolinkVideo } = require('../api/providers/evolink-video');
const { handleOpenRouter, buildOpenRouterImagesPayload, extractImageUrls } = require('../api/providers/openrouter');
const { handleXai } = require('../api/providers/xai');

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

function mockCreate(createUrl, response = { id: 'task-1' }) {
    const bodies = [];
    global.fetch = async (url, options = {}) => {
        if (url.includes('/upload/base64')) {
            return { ok: true, json: async () => ({ data: { file_url: 'https://files.example/ref.png' } }) };
        }
        assert.equal(url, createUrl);
        bodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => response };
    };
    return bodies;
}

describe('extra options helper', () => {
    const defs = [
        { key: 'seed', type: 'number', param: 'seed', min: 0, max: 10 },
        { key: 'fast', type: 'toggle', param: 'prompt_priority', default: false, onValue: 'fast', offValue: 'standard' },
        { key: 'depth', type: 'select', param: 'model_params.depth', default: 'high', options: [{ value: 'low' }, { value: 'high' }] },
    ];

    it('maps values to params, nests dotted params and skips defaults or invalid values', () => {
        assert.deepEqual(applyExtraOptions({ model_params: { a: 1 } }, defs, { seed: 7, fast: true, depth: 'low' }),
            { model_params: { a: 1, depth: 'low' }, seed: 7, prompt_priority: 'fast' });
        assert.deepEqual(applyExtraOptions({}, defs, { seed: 11, fast: false, depth: 'high' }), {});
        assert.deepEqual(applyExtraOptions({}, defs, { seed: 'abc', depth: 'evil' }), {});
        assert.deepEqual(applyExtraOptions({}, defs, { seed: '3' }), { seed: 3 });
    });

    it('sanitizes the client object', () => {
        assert.deepEqual(sanitizeExtraOptions({ a: 1, b: { x: 1 }, c: 'ok', d: true }), { a: 1, c: 'ok', d: true });
        assert.deepEqual(sanitizeExtraOptions('nope'), {});
        assert.deepEqual(sanitizeExtraOptions([1, 2]), {});
    });

    it('every catalog extra option resolves to a complete definition', () => {
        for (const model of catalog.models) {
            for (const def of getUiCapabilities(model.id).extraOptions) {
                assert.ok(def.key && def.param && ['number', 'toggle', 'select'].includes(def.type), `${model.id}: ${JSON.stringify(def)}`);
                assert.ok(def.label, `${model.id}: ${def.key} has no label`);
            }
        }
    });
});

describe('Evolink extra options', () => {
    it('GPT Image 2.6 sends complexity and a transparent background (switching JPEG to PNG)', async () => {
        const bodies = mockCreate('https://api.evolink.ai/v1/images/generations');
        await handleEvolink({
            res: makeRes(), model: 'evolink/gpt-image-2.6-flare', prompt: 'logo', parsedNumImages: 1,
            normalizedAspectRatio: '1:1', resolution: '1K', image_quality: 'high', output_format: 'jpeg',
            background: 'transparent', normalizedInputImages: [], evolinkKey: 'k',
            extraOptions: { complexity: 'low' },
        });
        assert.equal(bodies[0].complexity, 'low');
        assert.equal(bodies[0].background, 'transparent');
        assert.equal(bodies[0].output_format, 'png');
    });

    it('GPT Image 2.5 has Background but no complexity option', () => {
        const ui = getUiCapabilities('evolink/gpt-image-2.5-sunburst');
        assert.deepEqual(ui.background.options, ['opaque', 'transparent']);
        assert.deepEqual(ui.extraOptions, []);
    });

    it('Nano Banana merges thinking level and image search with web search', async () => {
        const bodies = mockCreate('https://api.evolink.ai/v1/images/generations');
        await handleEvolink({
            res: makeRes(), model: 'evolink/gemini-nano-banana-2.1', prompt: 'x', parsedNumImages: 1,
            normalizedAspectRatio: '1:1', resolution: '2K', normalizedInputImages: [], evolinkKey: 'k',
            enable_web_search: true, extraOptions: { thinking_level: 'high', image_search: true },
        });
        assert.deepEqual(bodies[0].model_params, { web_search: true, thinking_level: 'high', image_search: true });
    });

    it('Seedream 5.0 Pro fast mode sets prompt_priority', async () => {
        const bodies = mockCreate('https://api.evolink.ai/v1/images/generations');
        await handleEvolink({
            res: makeRes(), model: 'evolink/doubao-seedream-5.0-pro', prompt: 'x', parsedNumImages: 1,
            normalizedAspectRatio: '1:1', resolution: '1K', normalizedInputImages: [], evolinkKey: 'k',
            extraOptions: { fast_mode: true },
        });
        assert.equal(bodies[0].prompt_priority, 'fast');
    });

    it('Z Image Turbo and Gemini Omni send a seed only when one is set', async () => {
        let bodies = mockCreate('https://api.evolink.ai/v1/images/generations');
        await handleEvolink({
            res: makeRes(), model: 'evolink/z-image-turbo', prompt: 'x', parsedNumImages: 1,
            normalizedAspectRatio: '1:1', normalizedInputImages: [], evolinkKey: 'k', extraOptions: { seed: 42 },
        });
        assert.equal(bodies[0].seed, 42);

        bodies = mockCreate('https://api.evolink.ai/v1/videos/generations');
        await handleEvolinkVideo({
            res: makeRes(), model: 'evolink/gemini-omni-1.2-flash/text-to-video', prompt: 'x',
            normalizedInputImages: [], evolinkKey: 'k', extraOptions: { seed: 4294967295 },
        });
        assert.equal(bodies[0].seed, 4294967295);

        bodies = mockCreate('https://api.evolink.ai/v1/videos/generations');
        await handleEvolinkVideo({
            res: makeRes(), model: 'evolink/gemini-omni-1.2-flash/text-to-video', prompt: 'x',
            normalizedInputImages: [], evolinkKey: 'k', extraOptions: {},
        });
        assert.equal('seed' in bodies[0], false);
    });

    it('Seedance 2.0 relaxed filtering costs +10% and drops web search', async () => {
        const bodies = mockCreate('https://api.evolink.ai/v1/videos/generations');
        const res = makeRes();
        await handleEvolinkVideo({
            res, model: 'evolink/seedance-2.0/text-to-video', prompt: 'x', normalizedInputImages: [],
            evolinkKey: 'k', xai_video_length: 5, xai_video_quality: '720p',
            content_filter_switch: false, enable_web_search: true,
        });
        assert.equal(bodies[0].content_filter, false);
        assert.equal('model_params' in bodies[0], false);
        assert.equal(res.body.estimated_cost.toFixed(4), (0.199 * 5 * 1.1).toFixed(4));
    });

    it('HappyHorse uploads a single frame even when two are attached', async () => {
        let uploads = 0;
        const bodies = [];
        global.fetch = async (url, options = {}) => {
            if (url.includes('/upload/base64')) {
                uploads += 1;
                return { ok: true, json: async () => ({ data: { file_url: `https://files.example/${uploads}.png` } }) };
            }
            bodies.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({ id: 't' }) };
        };
        await handleEvolinkVideo({
            res: makeRes(), model: 'evolink/happyhorse-1.0/image-to-video', prompt: 'x',
            normalizedInputImages: ['data:image/png;base64,A', 'data:image/png;base64,B'], evolinkKey: 'k',
        });
        assert.equal(uploads, 1);
        assert.deepEqual(bodies[0].image_urls, ['https://files.example/1.png']);
    });
});

describe('OpenRouter Image API', () => {
    const req = { headers: {} };

    it('builds a payload from the model\'s documented parameters only', () => {
        const ui = getUiCapabilities('openai/gpt-5-image-mini');
        const payload = buildOpenRouterImagesPayload({
            model: 'openai/gpt-5-image-mini', prompt: ' cat ', normalizedAspectRatio: '16:9', resolution: '4K',
            imageQuality: 'high', outputFormat: 'jpeg', background: 'transparent',
            normalizedInputImages: ['data:image/png;base64,AAAA'], ui,
        });
        // 16:9 and 4K are not offered for this model, so they are dropped; JPEG becomes PNG for transparency.
        assert.deepEqual(payload, {
            model: 'openai/gpt-5-image-mini', prompt: 'cat', n: 1, quality: 'high', output_format: 'png',
            background: 'transparent',
            input_references: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
        });
    });

    it('sends seed and aspect ratio for Flux', () => {
        const ui = getUiCapabilities('black-forest-labs/flux.2-pro');
        assert.deepEqual(buildOpenRouterImagesPayload({
            model: 'black-forest-labs/flux.2-pro', prompt: 'p', normalizedAspectRatio: '21:9', outputFormat: 'jpeg',
            ui, extraOptions: { seed: 9 },
        }), { model: 'black-forest-labs/flux.2-pro', prompt: 'p', n: 1, aspect_ratio: '21:9', output_format: 'jpeg', seed: 9 });
    });

    it('decodes Image API responses and reads usage.cost', async () => {
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push({ url, body: JSON.parse(options.body) });
            return { ok: true, status: 200, json: async () => ({
                data: [{ b64_json: 'QUJD', media_type: 'image/jpeg' }], usage: { cost: 0.03 } }) };
        };
        const res = makeRes();
        await handleOpenRouter({
            req, res, model: 'black-forest-labs/flux.2-pro', prompt: 'p', parsedNumImages: 1,
            normalizedAspectRatio: '1:1', normalizedInputImages: [], openRouterApiKey: 'k', extraOptions: {},
        });
        assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/images');
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.images[0].url, 'data:image/jpeg;base64,QUJD');
        assert.equal(res.body.meta.total_usage, 0.03);
    });

    it('falls back to chat completions when the Image API does not know the model', async () => {
        const urls = [];
        global.fetch = async (url, options) => {
            urls.push(url);
            if (url.endsWith('/api/v1/images')) return { ok: false, status: 404, text: async () => 'not found' };
            if (url.includes('/generation?id=')) return { ok: true, json: async () => ({ data: { usage: 0.02 } }) };
            const body = JSON.parse(options.body);
            assert.deepEqual(body.modalities, ['image', 'text'], 'Gemini keeps its chat modalities');
            return { ok: true, status: 200, json: async () => ({
                id: 'gen-1', choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,QQ==' } }] } }] }) };
        };
        const res = makeRes();
        await handleOpenRouter({
            req, res, model: 'google/gemini-3-pro-image', prompt: 'p', parsedNumImages: 2,
            normalizedAspectRatio: '1:1', resolution: '2K', normalizedInputImages: [], openRouterApiKey: 'k',
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.images.length, 2);
        assert.equal(urls.filter((u) => u.endsWith('/api/v1/images')).length, 1, 'only probes the Image API once');
    });

    it('extracts chat-completions images unchanged', () => {
        assert.deepEqual(extractImageUrls({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,QQ==' } }] } }] }),
            ['data:image/png;base64,QQ==']);
    });
});

describe('xAI Grok Image 2.0', () => {
    it('sends quality and lower-case 1.5k resolution', async () => {
        const bodies = [];
        global.fetch = async (url, options) => {
            bodies.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({ data: [{ b64_json: 'QQ==' }] }) };
        };
        await handleXai({
            res: makeRes(), model: 'grok-imagine-image-2.0', prompt: 'p', parsedNumImages: 1,
            normalizedAspectRatio: '5:2', resolution: '1.5K', image_quality: 'medium',
            normalizedInputImages: [], xaiKey: 'k',
        });
        assert.equal(bodies[0].quality, 'medium');
        assert.equal(bodies[0].resolution, '1.5k');
        assert.equal(bodies[0].aspect_ratio, '5:2');
    });

    it('Grok Image 1.0 drops ratios only 2.0 supports', async () => {
        const bodies = [];
        global.fetch = async (url, options) => {
            bodies.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({ data: [{ b64_json: 'QQ==' }] }) };
        };
        await handleXai({
            res: makeRes(), model: 'grok-imagine-image', prompt: 'p', parsedNumImages: 1,
            normalizedAspectRatio: '5:2', resolution: '1K', image_quality: 'medium',
            normalizedInputImages: [], xaiKey: 'k',
        });
        assert.equal('aspect_ratio' in bodies[0], false);
        assert.equal('quality' in bodies[0], false);
    });
});
