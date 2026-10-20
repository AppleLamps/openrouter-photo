const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleOpenRouter } = require('../api/providers/openrouter');

const originalFetch = global.fetch;
const COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

function imageResponse(id) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            id,
            usage: { total_cost: 0.04 },
            choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${id}` } }] } }],
        }),
    };
}

function makeCtx(res, overrides = {}) {
    return {
        req: { headers: {} },
        res,
        model: 'bytedance-seed/seedream-4.5',
        prompt: 'a lighthouse at dusk',
        parsedNumImages: 1,
        normalizedAspectRatio: '16:9',
        resolution: '2K',
        normalizedInputImages: [],
        openRouterApiKey: 'sk-or-test',
        ...overrides,
    };
}

afterEach(() => {
    global.fetch = originalFetch;
});

describe('OpenRouter image handler', () => {
    it('returns already generated images when a sibling request throws', async () => {
        let completions = 0;
        global.fetch = async (url) => {
            if (url === COMPLETIONS_URL) {
                completions += 1;
                if (completions === 1) return imageResponse('first');
                throw new TypeError('fetch failed');
            }
            return { ok: false, status: 404, json: async () => ({}) };
        };

        const res = makeRes();
        await handleOpenRouter(makeCtx(res, { parsedNumImages: 2 }));

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.images.length, 1);
        assert.equal(res.body.images[0].url, 'data:image/png;base64,first');
    });

    it('only retries without aspect_ratio when the payload itself was rejected', async () => {
        const bodies = [];
        global.fetch = async (url, options) => {
            bodies.push(JSON.parse(options.body));
            return { ok: false, status: 429, text: async () => 'rate limited' };
        };

        const res = makeRes();
        await handleOpenRouter(makeCtx(res));

        assert.equal(res.statusCode, 429);
        assert.equal(bodies.length, 1);
    });

    it('retries without aspect_ratio after a 400 for fallback models', async () => {
        const bodies = [];
        global.fetch = async (url, options) => {
            if (url !== COMPLETIONS_URL) return { ok: false, status: 404, json: async () => ({}) };
            bodies.push(JSON.parse(options.body));
            return bodies.length === 1
                ? { ok: false, status: 400, text: async () => 'unsupported aspect_ratio' }
                : imageResponse('retry');
        };

        const res = makeRes();
        await handleOpenRouter(makeCtx(res));

        assert.equal(res.statusCode, 200);
        assert.equal(bodies.length, 2);
        assert.ok(bodies[0].image_config);
        assert.equal(bodies[1].image_config, undefined);
    });
});
