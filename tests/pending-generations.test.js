const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('pending generation journal', () => {
    beforeEach(() => {
        const data = new Map();
        global.localStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
    });
    it('survives reload, strips reference images and updates without duplication', async () => {
        const journal = await import('../js/pending-generations.js');
        const entry = { id: 'stable', request: { request_id: 'a', provider: 'evolink' }, prompt: 'Photo', settings: { model: 'm', image_urls: ['large-data'], image_url: 'large-data' } };
        assert.equal(journal.savePendingGeneration(entry), true);
        const reloaded = await import('../js/pending-generations.js?reload');
        assert.deepEqual(reloaded.readPendingGenerations()[0].settings, { model: 'm' });
        journal.savePendingGeneration({ ...entry, result: { url: '/result.png' } });
        assert.equal(journal.readPendingGenerations().length, 1);
        assert.equal(journal.readPendingGenerations()[0].result.url, '/result.png');
        journal.removePendingGeneration(entry.request);
        assert.equal(journal.readPendingGenerations().length, 0);
    });
    it('separates providers and reports quota failures', async () => {
        const journal = await import('../js/pending-generations.js');
        for (const provider of ['xai', 'evolink']) journal.savePendingGeneration({ id: provider, prompt: 'p', request: { request_id: 'same', provider } });
        journal.removePendingGeneration({ request_id: 'same', provider: 'xai' });
        assert.equal(journal.readPendingGenerations()[0].request.provider, 'evolink');
        global.localStorage.setItem = () => { throw new Error('quota'); };
        assert.equal(journal.savePendingGeneration({ id: 'b', prompt: 'p', request: { request_id: 'b' } }), false);
    });
});

describe('pending generation journal hygiene', () => {
    beforeEach(() => {
        const data = new Map();
        global.localStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
    });
    it('prunes entries older than the resume window and keeps fresh ones', async () => {
        const journal = await import('../js/pending-generations.js');
        const now = 10_000_000_000;
        journal.savePendingGeneration({ id: 'old', prompt: 'p', createdAt: now - journal.PENDING_GENERATION_MAX_AGE_MS - 1, request: { request_id: 'old', provider: 'xai' } });
        journal.savePendingGeneration({ id: 'fresh', prompt: 'p', createdAt: now - 60_000, request: { request_id: 'fresh', provider: 'xai' } });
        const { kept, discarded } = journal.prunePendingGenerations(now);
        assert.equal(discarded, 1);
        assert.deepEqual(kept.map(entry => entry.id), ['fresh']);
        assert.deepEqual(journal.readPendingGenerations().map(entry => entry.id), ['fresh']);
    });
    it('falls back to the save time when an entry has no createdAt', async () => {
        const journal = await import('../js/pending-generations.js');
        journal.savePendingGeneration({ id: 'legacy', prompt: 'p', request: { request_id: 'legacy', provider: 'evolink' } });
        const [entry] = journal.readPendingGenerations();
        assert.ok(Number.isFinite(entry.savedAt));
        assert.equal(journal.isStalePendingGeneration(entry, entry.savedAt + 1000), false);
        assert.equal(journal.isStalePendingGeneration(entry, entry.savedAt + journal.PENDING_GENERATION_MAX_AGE_MS + 1), true);
    });
    it('gives up on a task after repeated resume failures', async () => {
        const journal = await import('../js/pending-generations.js');
        const request = { request_id: 'stuck', provider: 'evolink' };
        journal.savePendingGeneration({ id: 'stuck', prompt: 'p', createdAt: Date.now(), request });
        for (let i = 1; i < journal.PENDING_GENERATION_MAX_RESUME_FAILURES; i++) {
            assert.equal(journal.markPendingGenerationResumeFailure(request), i);
            assert.equal(journal.prunePendingGenerations().kept.length, 1);
        }
        assert.equal(journal.markPendingGenerationResumeFailure(request), journal.PENDING_GENERATION_MAX_RESUME_FAILURES);
        assert.equal(journal.prunePendingGenerations().kept.length, 0);
        assert.equal(journal.markPendingGenerationResumeFailure(request), 0);
    });
});
