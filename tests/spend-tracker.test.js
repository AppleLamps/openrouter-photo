const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('spend tracker metrics', () => {
    it('does not double-count an async task replayed after reload', async () => {
        const data = new Map();
        global.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
        global.document = { getElementById: () => null };
        const { recordSpend } = await import('../js/spend-tracker.js');
        const meta = { recovery_key: 'evolink:task', requests: [{ model: 'm', usage: 0.15, delivered_count: 1 }] };
        recordSpend(meta, 1);
        recordSpend(meta, 1);
        const stored = JSON.parse(data.get('openrouter_spend_v1'));
        assert.equal(stored.total, 0.15);
        assert.equal(stored.byModel.m.generations, 1);
        assert.equal(stored.byModel.m.images, 1);
    });

    it('keeps only the newest task keys so storage does not grow forever', async () => {
        const data = new Map();
        global.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
        global.document = { getElementById: () => null };
        const { recordSpend } = await import('../js/spend-tracker.js');
        for (let i = 0; i < 520; i++) {
            recordSpend({ recovery_key: `evolink:t${i}`, requests: [{ model: 'm', usage: 0.01, delivered_count: 1 }] }, 1);
        }
        const stored = JSON.parse(data.get('openrouter_spend_v1'));
        assert.equal(stored.recordedTasks.length, 500);
        assert.equal(stored.recordedTasks.at(-1), 'evolink:t519');
        assert.equal(stored.byModel.m.generations, 520);
        // A recent task replayed after reload is still recognised.
        recordSpend({ recovery_key: 'evolink:t519', requests: [{ model: 'm', usage: 0.01, delivered_count: 1 }] }, 1);
        assert.equal(JSON.parse(data.get('openrouter_spend_v1')).byModel.m.generations, 520);
    });

    it('keeps positive fractional image counts from rounding to zero', async () => {
        const { getSpendBreakdownMetrics } = await import('../js/spend-tracker.js');

        const metrics = getSpendBreakdownMetrics(
            { total: 0.04 },
            [{ cost: 0.04, generations: 1, images: 0.4 }]
        );

        assert.equal(metrics.totalGenerations, 1);
        assert.equal(metrics.roundedImages, 1);
        assert.equal(metrics.averagePerImage, 0.04);
    });

    it('uses zero average for entries with no delivered images', async () => {
        const { getSpendBreakdownMetrics } = await import('../js/spend-tracker.js');

        const metrics = getSpendBreakdownMetrics(
            { total: 0.04 },
            [{ cost: 0.04, generations: 1, images: 0 }]
        );

        assert.equal(metrics.roundedImages, 0);
        assert.equal(metrics.averagePerImage, 0);
    });
});
