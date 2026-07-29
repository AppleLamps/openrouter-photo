const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const modulePromise = import(pathToFileURL(path.join(__dirname, '..', 'js', 'generation-polling.js')).href);

describe('frontend generation polling', () => {
    it('normalizes multi-task and legacy single-task responses', async () => {
        const { normalizePendingRequests } = await modulePromise;
        const multi = normalizePendingRequests({ provider: 'evolink', model: 'm', media_type: 'image', requests: [{ request_id: 'a' }, { request_id: 'b', index: 3 }] });
        assert.deepEqual(multi.map((entry) => [entry.request_id, entry.index, entry.media_type]), [['a', 0, 'image'], ['b', 3, 'image']]);
        const single = normalizePendingRequests({ request_id: 'v', estimated_cost: 1.5, model: 'video' });
        assert.equal(single[0].request_id, 'v');
        assert.equal(single[0].estimated_cost, 1.5);
    });

    it('retries transient failures and returns completion', async () => {
        const { pollGenerationRequest } = await modulePromise;
        let attempts = 0;
        const result = await pollGenerationRequest({ request_id: 'a' }, async () => {
            attempts += 1;
            if (attempts === 1) throw Object.assign(new Error('busy'), { status: 503 });
            return { status: 'completed', url: '/result.png' };
        }, null, { initialDelay: 1, multiplier: 1, maxInterval: 1, maxElapsed: 5 });
        assert.equal(result.status, 'completed');
        assert.equal(attempts, 2);
    });

    it('returns timeout and supports cancellation', async () => {
        const { pollGenerationRequest } = await modulePromise;
        const timedOut = await pollGenerationRequest({ request_id: 'a' }, async () => ({ status: 'pending' }), null,
            { initialDelay: 1, multiplier: 1, maxInterval: 1, maxElapsed: 2 });
        assert.equal(timedOut.status, 'failed');
        assert.match(timedOut.error, /timed out/i);

        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            pollGenerationRequest({ request_id: 'a' }, async () => ({ status: 'pending' }), controller.signal,
                { initialDelay: 1, maxElapsed: 2 }),
            { name: 'AbortError' },
        );
    });
});

describe('async spend accounting', () => {
    it('prefers the provider-reported cost over the create-time estimate', async () => {
        const { resolveAsyncCost, buildAsyncSpendMeta } = await modulePromise;
        const request = { estimated_cost: 0.0338, usage_estimated: true, model: 'evolink/doubao-seedream-5.0-pro', provider: 'evolink', request_id: 't1', media_type: 'image' };

        assert.deepEqual(resolveAsyncCost(request, { cost: 0.03375, usage_estimated: false }), { usage: 0.03375, estimated: false });

        const meta = buildAsyncSpendMeta(request, { cost: 0.03375, usage_estimated: false });
        assert.equal(meta.total_usage, 0.03375);
        assert.equal(meta.requests[0].usage, 0.03375);
        assert.equal(meta.requests[0].usage_estimated, false);
    });

    it('falls back to the estimate when the provider reports no cost', async () => {
        const { resolveAsyncCost, buildAsyncSpendMeta } = await modulePromise;
        const request = { estimated_cost: 0.995, usage_estimated: true };

        assert.deepEqual(resolveAsyncCost(request, { status: 'completed', url: '/v.mp4' }), { usage: 0.995, estimated: true });
        assert.deepEqual(resolveAsyncCost(request, undefined), { usage: 0.995, estimated: true });
        assert.equal(buildAsyncSpendMeta(request, {}).requests[0].usage_estimated, true);
    });

    it('records zero rather than NaN when neither side reports a cost', async () => {
        const { buildAsyncSpendMeta } = await modulePromise;
        const meta = buildAsyncSpendMeta({ request_id: 'x' }, null);
        assert.equal(meta.total_usage, 0);
        assert.equal(meta.requests[0].usage, 0);
    });
});
