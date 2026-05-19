const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/image-proxy');
const { isAllowedImageProxyUrl } = handler;

const originalFetch = global.fetch;

function makeReq(url) {
    return {
        method: 'GET',
        url: `/api/image-proxy-${Math.random()}`,
        query: { url },
        headers: { host: 'localhost' },
        socket: { remoteAddress: '127.0.0.1' },
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
        send(value) {
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

describe('image proxy allowlist', () => {
    it('allows Evolink Volcengine object storage image URLs', () => {
        assert.equal(isAllowedImageProxyUrl('https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/out.jpeg'), true);
    });

    it('rejects non-image-proxy hosts and non-https URLs', () => {
        assert.equal(isAllowedImageProxyUrl('http://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/out.jpeg'), false);
        assert.equal(isAllowedImageProxyUrl('https://example.com/out.jpeg'), false);
    });

    it('proxies allowed images through the app origin', async () => {
        const imageUrl = 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/out.jpeg';
        global.fetch = async (url) => {
            assert.equal(url, imageUrl);
            return {
                ok: true,
                status: 200,
                headers: {
                    get(name) {
                        return name.toLowerCase() === 'content-type' ? 'image/jpeg' : null;
                    },
                },
                arrayBuffer: async () => Buffer.from('jpeg-bytes'),
            };
        };

        const res = makeRes();
        await handler(makeReq(imageUrl), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'image/jpeg');
        assert.equal(Buffer.isBuffer(res.body), true);
        assert.equal(res.body.toString(), 'jpeg-bytes');
    });
});
