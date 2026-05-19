const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getFalVideoModel } = require('../api/model-catalog');
const { calculateFalVideoCost } = require('../api/providers/fal-video');

describe('Fal video pricing', () => {
    it('prices Seedance 1.5 by duration and resolution', () => {
        const falVideoConfig = getFalVideoModel('fal-ai/bytedance/seedance/v1.5/pro/text-to-video');
        const cost = calculateFalVideoCost({
            falVideoConfig,
            variant: 'seedance15',
            normalizedDuration: 5,
            normalizedResolution: '720p',
            normalizedGenerateAudio: true,
        });

        assert.equal(cost, 0.259);
    });

    it('prices Seedance 2.0 at 480p instead of returning zero', () => {
        const falVideoConfig = getFalVideoModel('bytedance/seedance-2.0/image-to-video');
        const cost = calculateFalVideoCost({
            falVideoConfig,
            variant: 'seedance20',
            normalizedDuration: 5,
            normalizedResolution: '480p',
            normalizedGenerateAudio: true,
        });

        assert.ok(Math.abs(cost - 0.703) < 0.000001);
    });
});
