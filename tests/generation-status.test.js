const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { handleEvolinkStatus, handleXaiStatus } = require('../api/generation-status');

function makeRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('generic generation status', () => {
    it('maps completed Evolink images to proxied and source URLs', async () => {
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ status: 'completed', results: ['https://example.volces.com/result.png'] }),
        });
        const res = makeRes();
        await handleEvolinkStatus({ headers: { 'x-evolink-api-key': 'test-key' } }, res, 'task-1', 'image');
        assert.equal(res.body.status, 'completed');
        assert.equal(res.body.source_url, 'https://example.volces.com/result.png');
        assert.match(res.body.url, /^\/api\/image-proxy\?url=/);
    });

    it('maps pending and failed Evolink tasks without exposing bearer keys', async () => {
        global.fetch = async () => ({ ok: true, json: async () => ({ status: 'pending' }) });
        const pending = makeRes();
        await handleEvolinkStatus({ headers: { 'x-evolink-api-key': 'test-key' } }, pending, 'task-2', 'image');
        assert.deepEqual(pending.body, { status: 'pending', media_type: 'image' });

        global.fetch = async () => ({
            ok: true,
            json: async () => ({ status: 'failed', error: { message: 'Bearer abcdefghijklmnopqrstuvwxyz failed' } }),
        });
        const failed = makeRes();
        await handleEvolinkStatus({ headers: { 'x-evolink-api-key': 'test-key' } }, failed, 'task-3', 'image');
        assert.equal(failed.body.status, 'failed');
        assert.doesNotMatch(failed.body.error, /abcdefghijklmnopqrstuvwxyz/);
    });

    it('maps xAI completion and failure states', async () => {
        global.fetch = async () => ({ ok: true, json: async () => ({ status: 'DONE', url: 'https://x.ai/video.mp4' }) });
        const completed = makeRes();
        await handleXaiStatus({ headers: { 'x-xai-api-key': 'xai-test-key' } }, completed, 'video-1');
        assert.deepEqual(completed.body, { status: 'completed', media_type: 'video', url: 'https://x.ai/video.mp4' });

        global.fetch = async () => ({ ok: true, json: async () => ({ status: 'FAILED', error: 'xai-abcdefghijklmnopqrstuvwxyz' }) });
        const failed = makeRes();
        await handleXaiStatus({ headers: { 'x-xai-api-key': 'xai-test-key' } }, failed, 'video-2');
        assert.equal(failed.body.status, 'failed');
        assert.doesNotMatch(failed.body.error, /abcdefghijklmnopqrstuvwxyz/);
    });
});
