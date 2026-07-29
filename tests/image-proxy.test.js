const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/image-proxy');
const { isAllowedImageProxyUrl, MAX_IMAGE_PROXY_BYTES } = handler;

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
        global.fetch = async (url, options) => {
            assert.equal(url, imageUrl);
            assert.equal(options.redirect, 'manual');
            return {
                ok: true,
                status: 200,
                headers: {
                    get(name) {
                        if (name.toLowerCase() === 'content-type') return 'image/jpeg';
                        if (name.toLowerCase() === 'content-length') return String(Buffer.byteLength('jpeg-bytes'));
                        return null;
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

    it('blocks redirects that leave the image host allowlist', async () => {
        const imageUrl = 'https://files-api.evolink.ai/redirect.jpeg';
        let calls = 0;
        global.fetch = async () => {
            calls += 1;
            return {
                ok: false,
                status: 302,
                headers: {
                    get(name) {
                        return name.toLowerCase() === 'location'
                            ? 'http://169.254.169.254/latest/meta-data/'
                            : null;
                    },
                },
            };
        };

        const res = makeRes();
        await handler(makeReq(imageUrl), res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'Unsupported image redirect host' });
        assert.equal(calls, 1);
    });

    it('revalidates and follows redirects that remain on allowed hosts', async () => {
        const firstUrl = 'https://files-api.evolink.ai/redirect.jpeg';
        const finalUrl = 'https://cdn.evolink.ai/final.jpeg';
        const seen = [];
        global.fetch = async (url) => {
            seen.push(url);
            if (url === firstUrl) {
                return {
                    ok: false,
                    status: 302,
                    headers: {
                        get(name) {
                            return name.toLowerCase() === 'location' ? finalUrl : null;
                        },
                    },
                };
            }
            return {
                ok: true,
                status: 200,
                headers: {
                    get(name) {
                        if (name.toLowerCase() === 'content-type') return 'image/jpeg';
                        if (name.toLowerCase() === 'content-length') return '5';
                        return null;
                    },
                },
                arrayBuffer: async () => Buffer.from('image'),
            };
        };

        const res = makeRes();
        await handler(makeReq(firstUrl), res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(seen, [firstUrl, finalUrl]);
        assert.equal(res.body.toString(), 'image');
    });

    it('rejects images above 20 MB from content-length', async () => {
        const imageUrl = 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/large.jpeg';
        let bodyRead = false;
        global.fetch = async () => ({
            ok: true,
            status: 200,
            headers: {
                get(name) {
                    if (name.toLowerCase() === 'content-type') return 'image/jpeg';
                    if (name.toLowerCase() === 'content-length') return String(MAX_IMAGE_PROXY_BYTES + 1);
                    return null;
                },
            },
            arrayBuffer: async () => {
                bodyRead = true;
                return Buffer.alloc(1);
            },
        });

        const res = makeRes();
        await handler(makeReq(imageUrl), res);

        assert.equal(res.statusCode, 413);
        assert.equal(bodyRead, false);
    });

    it('rejects images above 20 MB after download when content-length is missing', async () => {
        const imageUrl = 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream/large-no-length.jpeg';
        global.fetch = async () => ({
            ok: true,
            status: 200,
            headers: {
                get(name) {
                    return name.toLowerCase() === 'content-type' ? 'image/jpeg' : null;
                },
            },
            arrayBuffer: async () => Buffer.alloc(MAX_IMAGE_PROXY_BYTES + 1),
        });

        const res = makeRes();
        await handler(makeReq(imageUrl), res);

        assert.equal(res.statusCode, 413);
    });
});
