const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/generate');

function makeReq(body) {
    return {
        method: 'POST',
        url: `/api/generate-validation-${Math.random()}`,
        headers: {
            host: 'localhost',
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

describe('generate validation', () => {
    it('rejects whitespace-only prompts before API key validation', async () => {
        const res = makeRes();

        await handler(makeReq({ prompt: '   ', model: 'fal-ai/z-image/turbo/lora' }), res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'Prompt is required' });
    });
});
