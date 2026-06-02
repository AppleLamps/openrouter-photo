const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getUiCapabilities } = require('../api/model-catalog');

describe('UI capabilities', () => {
    it('gemini exposes aspect ratio and 1K/2K/4K resolution', () => {
        const ui = getUiCapabilities('google/gemini-3-pro-image-preview');
        assert.equal(ui.aspectRatio, true);
        assert.deepEqual(ui.resolution?.options, ['1K', '2K', '4K']);
        assert.equal(ui.resolution?.default, '1K');
        assert.equal(ui.videoLength, null);
        assert.equal(ui.flashhead, false);
    });

    it('grok video exposes video length and quality only', () => {
        const ui = getUiCapabilities('grok-imagine-video');
        assert.equal(ui.aspectRatio, false);
        assert.equal(ui.resolution, null);
        assert.ok(ui.videoLength);
        assert.deepEqual(ui.videoQuality?.options, ['480p', '720p']);
        assert.equal(ui.flashhead, false);
    });

    it('flashhead exposes flashhead settings only', () => {
        const ui = getUiCapabilities('fal-ai/flashhead');
        assert.equal(ui.aspectRatio, false);
        assert.equal(ui.resolution, null);
        assert.equal(ui.videoLength, null);
        assert.equal(ui.videoQuality, null);
        assert.equal(ui.flashhead, true);
        assert.equal(ui.imageToVideoHint, true);
    });

    it('pixverse i2v exposes video length, quality, and generate audio', () => {
        const ui = getUiCapabilities('fal-ai/pixverse/c1/image-to-video');
        assert.equal(ui.aspectRatio, false);
        assert.equal(ui.resolution, null);
        assert.ok(ui.videoLength);
        assert.ok(ui.videoQuality);
        assert.equal(ui.generateAudio, true);
        assert.equal(ui.flashhead, false);
        assert.equal(ui.imageToVideoHint, true);
    });

    it('z-image exposes aspect ratio without resolution or video controls', () => {
        const ui = getUiCapabilities('fal-ai/z-image/turbo/lora');
        assert.equal(ui.aspectRatio, true);
        assert.equal(ui.resolution, null);
        assert.equal(ui.videoLength, null);
        assert.equal(ui.generateAudio, false);
    });

    it('evolink z-image-turbo exposes aspect ratio without resolution', () => {
        const ui = getUiCapabilities('evolink/z-image-turbo');
        assert.equal(ui.aspectRatio, true);
        assert.equal(ui.resolution, null);
        assert.equal(ui.videoLength, null);
        assert.equal(ui.generateAudio, false);
    });

    it('evolink seedream 5 lite exposes 2K and 3K resolution', () => {
        const ui = getUiCapabilities('evolink/doubao-seedream-5.0-lite');
        assert.equal(ui.aspectRatio, true);
        assert.deepEqual(ui.resolution?.options, ['2K', '3K']);
        assert.equal(ui.resolution?.default, '2K');
        assert.equal(ui.webSearch, true);
    });

    it('does not expose web search for other evolink models', () => {
        assert.equal(getUiCapabilities('evolink/doubao-seedream-4.5').webSearch, false);
        assert.equal(getUiCapabilities('evolink/z-image-turbo').webSearch, false);
    });
});

describe('picker visibility', () => {
    it('hides fal api-key models from the picker while keeping them in the catalog', async () => {
        const { isVisibleInPicker } = await import('../js/model-capabilities.js');
        const catalog = require('../shared/model-catalog.json');

        const falModels = catalog.models.filter((m) => m.via === 'fal');
        assert.ok(falModels.length > 0);
        for (const m of falModels) {
            assert.equal(isVisibleInPicker(m.id), false, m.id);
        }

        assert.equal(isVisibleInPicker('evolink/doubao-seedream-5.0-lite'), true);
        assert.equal(isVisibleInPicker('black-forest-labs/flux.2-pro'), true);
    });
});
