const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/random-prompt');

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


describe('random prompt API', () => {
    afterEach(() => { global.fetch = originalFetch; });
    it('disables reasoning so the token budget is available for visible prompt text', async () => {
        let sent;
        global.fetch = async (_url, options) => {
            sent = JSON.parse(options.body);
            return openRouterJsonResponse({ choices: [{ message: { content: ' A snowy harbor at sunrise. ' } }] });
        };
        const res = makeRes();
        await handler(makeReq({}), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.prompt, 'A snowy harbor at sunrise.');
        assert.deepEqual(sent.reasoning, { enabled: false });
        assert.equal(sent.max_tokens, 600);
    });
    it('reads structured text content instead of throwing on trim', async () => {
        global.fetch = async () => openRouterJsonResponse({ choices: [{ message: { content: [{ type: 'text', text: 'A harbor.' }] } }] });
        const res = makeRes();
        await handler(makeReq({}), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.prompt, 'A harbor.');
    });
    it('returns a useful gateway error for whitespace-only output', async () => {
        global.fetch = async () => openRouterJsonResponse({ choices: [{ message: { content: '   ' } }] });
        const res = makeRes();
        await handler(makeReq({}), res);
        assert.equal(res.statusCode, 502);
        assert.match(res.body.error, /empty random prompt/);
    });
    it('preserves provider errors while redacting API keys', async () => {
        global.fetch = async () => openRouterJsonResponse({ error: { message: 'Invalid key sk-or-v1-secret123' } }, 401);
        const res = makeRes();
        await handler(makeReq({}), res);
        assert.equal(res.statusCode, 401);
        assert.doesNotMatch(res.body.details, /secret123/);
    });
});
