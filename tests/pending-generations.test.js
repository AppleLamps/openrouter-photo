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
