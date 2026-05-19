const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/enhance');

const originalFetch = global.fetch;

function makeReq(body) {
    return {
        method: 'POST',
        url: `/api/enhance-${Math.random()}`,
        headers: {
            host: 'localhost',
            'x-openrouter-api-key': 'sk-or-v1-test-key',
        },
        socket: { remoteAddress: `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
        body,
    };
}

function makeRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
        end() {
            return this;
        },
    };
}

function openRouterJsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

describe('enhance prompt API', () => {
    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('retries a two-image enhancement with one image when OpenRouter returns empty content', async () => {
        const calls = [];
        global.fetch = async (_url, options) => {
            const body = JSON.parse(options.body);
            calls.push(body);

            if (calls.length === 1) {
                return openRouterJsonResponse({ choices: [{ message: { content: '' } }] });
            }

            return openRouterJsonResponse({ choices: [{ message: { content: 'enhanced prompt' } }] });
        };

        const res = makeRes();
        await handler(makeReq({
            prompt: 'make this better',
            image_urls: [
                'data:image/jpeg;base64,one',
                'data:image/jpeg;base64,two',
            ],
        }), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.enhancedPrompt, 'enhanced prompt');
        assert.equal(calls.length, 2);
        assert.equal(calls[0].messages[1].content.length, 3);
        assert.equal(calls[0].messages[1].content[0].type, 'text');
        assert.equal(calls[1].messages[1].content.length, 2);
        assert.equal(calls[1].messages[1].content[1].image_url.url, 'data:image/jpeg;base64,one');
    });

    it('falls back to text-only enhancement if image retries are empty', async () => {
        const calls = [];
        global.fetch = async (_url, options) => {
            const body = JSON.parse(options.body);
            calls.push(body);

            if (calls.length < 3) {
                return openRouterJsonResponse({ choices: [{ message: { content: '' } }] });
            }

            return openRouterJsonResponse({ choices: [{ message: { content: 'text only prompt' } }] });
        };

        const res = makeRes();
        await handler(makeReq({
            prompt: 'make this better',
            image_urls: [
                'data:image/png;base64,one',
                'data:image/png;base64,two',
            ],
        }), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.enhancedPrompt, 'text only prompt');
        assert.equal(calls.length, 3);
        assert.equal(calls[2].messages[1].content, 'make this better');
    });

    it('extracts text from array content responses', () => {
        const prompt = handler.__test.extractEnhancedPrompt({
            choices: [{
                message: {
                    content: [
                        { type: 'text', text: 'enhanced ' },
                        { type: 'text', text: 'prompt' },
                    ],
                },
            }],
        });

        assert.equal(prompt, 'enhanced prompt');
    });
});
