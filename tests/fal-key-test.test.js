const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/test-fal-key');
const originalFetch = global.fetch;

function makeReq() {
    return {
        method: 'POST',
        url: `/api/test-fal-key-${Math.random()}`,
        headers: {
            host: 'localhost',
            'x-fal-api-key': 'fal-test-key',
        },
        socket: { remoteAddress: `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
        body: {},
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

afterEach(() => {
    global.fetch = originalFetch;
});

describe('Fal key test endpoint', () => {
    it('validates keys through a non-generating platform API endpoint', async () => {
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                status: 200,
                json: async () => ({ models: [] }),
            };
        };

        const res = makeRes();
        await handler(makeReq(), res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { ok: true });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://api.fal.ai/v1/models?limit=1');
        assert.equal(calls[0].options.method, 'GET');
        assert.match(calls[0].options.headers.Authorization, /^Key /);
    });

    it('reports auth failures without submitting a queue job', async () => {
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push({ url, options });
            return {
                ok: false,
                status: 401,
                text: async () => 'invalid key fal-test-key',
            };
        };

        const res = makeRes();
        await handler(makeReq(), res);

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.code, 'FAL_KEY_INVALID');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://api.fal.ai/v1/models?limit=1');
    });
});
