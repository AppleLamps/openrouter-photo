const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { handleXai } = require('../api/providers/xai');

function makeRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

describe('xAI image payloads', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('sends every attachment with every requested edit output', async () => {
        const payloads = [];
        let requestNumber = 0;
        global.fetch = async (url, options) => {
            assert.equal(url, 'https://api.x.ai/v1/images/edits');
            payloads.push(JSON.parse(options.body));
            requestNumber += 1;
            const currentRequest = requestNumber;
            return {
                ok: true,
                json: async () => ({
                    id: `edit-${currentRequest}`,
                    data: [{ b64_json: `result-${currentRequest}` }],
                }),
            };
        };

        const res = makeRes();
        const attachments = [
            'data:image/jpeg;base64,first',
            'data:image/png;base64,second',
        ];
        await handleXai({
            res,
            model: 'grok-imagine-image',
            prompt: 'put both people in one candid photo',
            parsedNumImages: 3,
            normalizedAspectRatio: '4:3',
            resolution: '1K',
            normalizedInputImages: attachments,
            xaiKey: 'xai-test-key',
        });

        assert.equal(res.statusCode, 200);
        assert.equal(payloads.length, 3);
        for (const payload of payloads) {
            assert.equal(payload.n, 1);
            assert.deepEqual(payload.images, attachments.map((url) => ({
                type: 'image_url',
                url,
            })));
        }
        assert.equal(res.body.images.length, 3);
        assert.deepEqual(
            res.body.meta.requests.map((request) => request.generation_id),
            ['edit-1', 'edit-2', 'edit-3'],
        );
    });

    it('keeps text-to-image generation as one batch request', async () => {
        const payloads = [];
        global.fetch = async (url, options) => {
            assert.equal(url, 'https://api.x.ai/v1/images/generations');
            payloads.push(JSON.parse(options.body));
            return {
                ok: true,
                json: async () => ({
                    id: 'generation-1',
                    data: [
                        { b64_json: 'one' },
                        { b64_json: 'two' },
                    ],
                }),
            };
        };

        const res = makeRes();
        await handleXai({
            res,
            model: 'grok-imagine-image',
            prompt: 'two landscapes',
            parsedNumImages: 2,
            normalizedAspectRatio: '16:9',
            resolution: '2K',
            normalizedInputImages: [],
            xaiKey: 'xai-test-key',
        });

        assert.equal(res.statusCode, 200);
        assert.equal(payloads.length, 1);
        assert.equal(payloads[0].n, 2);
        assert.equal('image' in payloads[0], false);
        assert.equal('images' in payloads[0], false);
        assert.equal(res.body.images.length, 2);
    });
});
