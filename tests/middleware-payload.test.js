const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
    withMiddleware,
    VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES,
    API_CORS_ALLOW_HEADERS,
    __test,
} = require('../api/_middleware');

function makeReq(body, headers = {}) {
    const req = Readable.from([Buffer.from(body)]);
    req.method = 'POST';
    req.url = `/api/test-${Math.random()}`;
    req.headers = {
        host: 'localhost',
        'content-length': String(Buffer.byteLength(body)),
        ...headers,
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    return req;
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

describe('api middleware payload limit', () => {
    it('rejects requests over the Vercel function payload limit before handler execution', async () => {
        let called = false;
        const handler = withMiddleware(async (_req, res) => {
            called = true;
            return res.status(200).json({ ok: true });
        });

        const req = makeReq('{}', {
            'content-length': String(VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES + 1),
        });
        const res = makeRes();

        await handler(req, res);

        assert.equal(called, false);
        assert.equal(res.statusCode, 413);
        assert.equal(res.body.code, 'REQUEST_PAYLOAD_TOO_LARGE');
    });

    it('parses requests below the payload limit', async () => {
        const handler = withMiddleware(async (req, res) => res.status(200).json({ value: req.body.value }));
        const req = makeReq(JSON.stringify({ value: 'ok' }));
        const res = makeRes();

        await handler(req, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { value: 'ok' });
    });

    it('honors API_RATE_LIMIT_MAX=0 as disabled', async () => {
        const previousMax = process.env.API_RATE_LIMIT_MAX;
        process.env.API_RATE_LIMIT_MAX = '0';

        try {
            let calls = 0;
            const handler = withMiddleware(async (_req, res) => {
                calls += 1;
                return res.status(200).json({ ok: true });
            }, { rateLimit: { max: 1 } });

            const first = makeReq('{}');
            first.url = '/api/rate-limit-disabled';
            const second = makeReq('{}');
            second.url = '/api/rate-limit-disabled';

            const firstRes = makeRes();
            const secondRes = makeRes();

            await handler(first, firstRes);
            await handler(second, secondRes);

            assert.equal(calls, 2);
            assert.equal(firstRes.statusCode, 200);
            assert.equal(secondRes.statusCode, 200);
        } finally {
            if (previousMax === undefined) {
                delete process.env.API_RATE_LIMIT_MAX;
            } else {
                process.env.API_RATE_LIMIT_MAX = previousMax;
            }
        }
    });

    it('keeps CORS allow headers hyphenated only', () => {
        assert.equal(API_CORS_ALLOW_HEADERS.includes('_'), false);
        assert.match(API_CORS_ALLOW_HEADERS, /X-OpenRouter-Api-Key/);
        assert.match(API_CORS_ALLOW_HEADERS, /X-FAL-Api-Key/);
    });

    it('prunes expired rate limit buckets', () => {
        const now = Date.now();
        __test.rateLimitBuckets.clear();
        __test.rateLimitBuckets.set('expired', { count: 1, resetMs: now - 1 });
        __test.rateLimitBuckets.set('active', { count: 1, resetMs: now + 1000 });

        __test.pruneExpiredRateLimitBuckets(now);

        assert.equal(__test.rateLimitBuckets.has('expired'), false);
        assert.equal(__test.rateLimitBuckets.has('active'), true);
        __test.rateLimitBuckets.clear();
    });
});
