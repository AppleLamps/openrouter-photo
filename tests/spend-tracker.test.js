const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('spend tracker metrics', () => {
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
