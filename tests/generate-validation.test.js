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

        await handler(makeReq({ prompt: '   ', model: 'evolink/z-image-turbo' }), res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'Prompt is required' });
    });

    it('enforces the seedream 5 pro prompt limit before API key validation', async () => {
        const res = makeRes();

        await handler(makeReq({
            prompt: 'a'.repeat(2001),
            model: 'evolink/doubao-seedream-5.0-pro',
        }), res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /2000 characters/);
    });

    it('validates seedream 5 pro exact dimensions before API key validation', async () => {
        const res = makeRes();

        await handler(makeReq({
            prompt: 'test',
            model: 'evolink/doubao-seedream-5.0-pro',
            image_size: '500x500',
        }), res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /supported pixel/);
    });

    it('does not apply the pro prompt limit to other models', async () => {
        const res = makeRes();

        await handler(makeReq({
            prompt: 'a'.repeat(2001),
            model: 'evolink/z-image-turbo',
        }), res);

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.code, 'EVOLINK_API_KEY_REQUIRED');
    });
});
