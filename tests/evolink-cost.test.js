const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { estimateVideoCost, handleEvolinkVideo } = require('../api/providers/evolink-video');
const { handleEvolinkStatus } = require('../api/generation-status');

const originalFetch = global.fetch;

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

afterEach(() => {
    global.fetch = originalFetch;
});

// Rates published at evolink.ai (Seedance 2.0 and HappyHorse 1.0 route pages).
describe('evolink video cost estimation', () => {
    const seedance = 'evolink/seedance-2.0/image-to-video';

    it('bills Seedance 2.0 per output second at the requested resolution', () => {
        assert.equal(estimateVideoCost(seedance, 5, '480p').toFixed(4), '0.4600');
        assert.equal(estimateVideoCost(seedance, 5, '720p').toFixed(4), '0.9950');
        assert.equal(estimateVideoCost(seedance, 5, '1080p').toFixed(4), '2.4800');
    });

    it('bills HappyHorse 1.0 at its own per-second rates', () => {
        const happyhorse = 'evolink/happyhorse-1.0/image-to-video';
        assert.equal(estimateVideoCost(happyhorse, 5, '720p').toFixed(4), '0.6940');
        assert.equal(estimateVideoCost(happyhorse, 5, '1080p').toFixed(4), '1.2340');
    });

    it('falls back to the default resolution and never returns NaN', () => {
        assert.equal(estimateVideoCost(seedance, 5, undefined), estimateVideoCost(seedance, 5, '720p'));
        assert.equal(estimateVideoCost(seedance, undefined, '720p'), 0);
        assert.equal(estimateVideoCost('not-a-model', 5, '720p'), 0);
    });

    it('reports a non-zero estimated cost when a video task is created', async () => {
        global.fetch = async (url) => {
            if (url === 'https://files-api.evolink.ai/api/v1/files/upload/base64') {
                return { ok: true, json: async () => ({ data: { file_url: 'https://cdn.evolink.ai/frame.jpg' } }) };
            }
            return { ok: true, json: async () => ({ id: 'task-1' }) };
        };

        const res = makeRes();
        await handleEvolinkVideo({
            res,
            model: 'evolink/seedance-2.0/image-to-video',
            prompt: 'a cat',
            normalizedInputImages: ['data:image/jpeg;base64,AA=='],
            normalizedAspectRatio: '16:9',
            xai_video_length: 6,
            xai_video_quality: '1080p',
            evolinkKey: 'test-key',
        });

        assert.equal(res.statusCode, 202);
        assert.equal(res.body.estimated_cost.toFixed(4), '2.9760');
        assert.equal(res.body.meta.total_usage.toFixed(4), '2.9760');
    });

    it('prefers the credits Evolink reserves over the catalog estimate', async () => {
        global.fetch = async (url) => {
            if (url === 'https://files-api.evolink.ai/api/v1/files/upload/base64') {
                return { ok: true, json: async () => ({ data: { file_url: 'https://cdn.evolink.ai/frame.jpg' } }) };
            }
            return { ok: true, json: async () => ({ id: 'task-2', usage: { credits_reserved: 100 } }) };
        };

        const res = makeRes();
        await handleEvolinkVideo({
            res,
            model: 'evolink/seedance-2.0/image-to-video',
            prompt: 'a cat',
            normalizedInputImages: ['data:image/jpeg;base64,AA=='],
            normalizedAspectRatio: '16:9',
            xai_video_length: 6,
            xai_video_quality: '1080p',
            evolinkKey: 'test-key',
        });

        assert.equal(res.body.estimated_cost.toFixed(2), '1.47');
    });
});

describe('evolink completed-task billing', () => {
    const req = { headers: { 'x-evolink-api-key': 'test-key' } };

    it('returns the actual billed cost from credits_used', async () => {
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                status: 'completed',
                results: ['https://cdn.evolink.ai/out.jpeg'],
                usage: { credits_used: 2.295, generated_images: 1, output_tier: '1K' },
            }),
        });

        const res = makeRes();
        await handleEvolinkStatus(req, res, 'task-1', 'image');

        assert.equal(res.body.status, 'completed');
        assert.equal(res.body.cost.toFixed(5), '0.03374');
        assert.equal(res.body.usage_estimated, false);
    });

    it('omits the cost when the task reports no credit usage', async () => {
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ status: 'completed', results: ['https://cdn.evolink.ai/out.mp4'] }),
        });

        const res = makeRes();
        await handleEvolinkStatus(req, res, 'task-2', 'video');

        assert.equal(res.body.status, 'completed');
        assert.equal('cost' in res.body, false);
        assert.equal('usage_estimated' in res.body, false);
    });
});
