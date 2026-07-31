const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOpenRouterPayload } = require('../api/providers/openrouter');
const { getOpenRouterConfig } = require('../api/model-catalog');

function build(model) {
    return buildOpenRouterPayload({
        model,
        prompt: 'A cinematic landscape',
        normalizedAspectRatio: '16:9',
        resolution: '2K',
        normalizedInputImages: [],
        openRouterConfig: getOpenRouterConfig(model),
    });
}

describe('OpenRouter image payloads', () => {
    it('requests only image output for Grok Imagine while preserving image config', () => {
        const payload = build('x-ai/grok-imagine-image-quality');

        assert.deepEqual(payload.modalities, ['image']);
        assert.deepEqual(payload.image_config, {
            aspect_ratio: '16:9',
            image_size: '2K',
        });
    });

    it('continues requesting image and text output for Gemini image models', () => {
        const payload = build('google/gemini-3-pro-image');

        assert.deepEqual(payload.modalities, ['image', 'text']);
        assert.deepEqual(payload.image_config, {
            aspect_ratio: '16:9',
            image_size: '2K',
        });
    });
});
