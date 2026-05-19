const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateDeliveredUsage } = require('../api/providers/openrouter');

describe('OpenRouter delivered usage', () => {
    it('prorates total usage to delivered images when a request returns extras', () => {
        const usageRequests = [
            { model: 'm', provider_name: 'p', usage: 0.06, imageCount: 3, usage_pending: false },
        ];
        const deliveredImages = [
            { metaIndex: 0 },
            { metaIndex: 0 },
        ];

        const result = calculateDeliveredUsage({ usageRequests, deliveredImages });

        assert.equal(result.totalUsage, 0.04);
        assert.equal(result.billedRequests.length, 1);
        assert.equal(result.billedRequests[0].usage, 0.04);
        assert.equal(result.billedRequests[0].imageCount, 2);
    });

    it('drops request usage for images that were not delivered', () => {
        const usageRequests = [
            { model: 'm1', provider_name: 'p', usage: 0.02, imageCount: 1, usage_pending: false },
            { model: 'm2', provider_name: 'p', usage: 0.02, imageCount: 1, usage_pending: false },
        ];
        const deliveredImages = [{ metaIndex: 0 }];

        const result = calculateDeliveredUsage({ usageRequests, deliveredImages });

        assert.equal(result.totalUsage, 0.02);
        assert.equal(result.billedRequests.length, 1);
        assert.equal(result.billedRequests[0].model, 'm1');
    });
});
