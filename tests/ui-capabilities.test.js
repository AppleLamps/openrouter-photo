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
});
