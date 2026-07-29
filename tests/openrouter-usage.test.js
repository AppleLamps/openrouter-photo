const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateBilledUsage } = require('../api/providers/openrouter');

describe('OpenRouter billed usage', () => {
    it('keeps the full billed total when a request returns extra images', () => {
        const usageRequests = [
            { model: 'm', provider_name: 'p', usage: 0.06, imageCount: 3, usage_pending: false },
        ];
        const deliveredImages = [
            { metaIndex: 0 },
            { metaIndex: 0 },
        ];

        const result = calculateBilledUsage({ usageRequests, deliveredImages });

        assert.equal(result.totalUsage, 0.06);
        assert.equal(result.billedRequests.length, 1);
        assert.equal(result.billedRequests[0].usage, 0.06);
        assert.equal(result.billedRequests[0].delivered_usage, 0.04);
        assert.equal(result.billedRequests[0].generated_count, 3);
        assert.equal(result.billedRequests[0].delivered_count, 2);
        assert.equal(result.billedRequests[0].imageCount, 2);
    });

    it('keeps billed requests even when none of their images are delivered', () => {
        const usageRequests = [
            { model: 'm1', provider_name: 'p', usage: 0.02, imageCount: 1, usage_pending: false },
            { model: 'm2', provider_name: 'p', usage: 0.02, imageCount: 1, usage_pending: false },
        ];
        const deliveredImages = [{ metaIndex: 0 }];

        const result = calculateBilledUsage({ usageRequests, deliveredImages });

        assert.equal(result.totalUsage, 0.04);
        assert.equal(result.billedRequests.length, 2);
        assert.equal(result.billedRequests[0].model, 'm1');
        assert.equal(result.billedRequests[0].delivered_count, 1);
        assert.equal(result.billedRequests[1].model, 'm2');
        assert.equal(result.billedRequests[1].delivered_count, 0);
        assert.equal(result.billedRequests[1].usage, 0.02);
    });
});
