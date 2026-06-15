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
    });

    it('grok video exposes video length and quality only', () => {
        const ui = getUiCapabilities('grok-imagine-video');
        assert.equal(ui.aspectRatio, false);
        assert.equal(ui.resolution, null);
        assert.ok(ui.videoLength);
        assert.deepEqual(ui.videoQuality?.options, ['480p', '720p']);
    });

    it('evolink seedance i2v exposes aspect ratio, video length, quality, audio, and the i2v hint', () => {
        const ui = getUiCapabilities('evolink/seedance-2.0/image-to-video');
        assert.equal(ui.aspectRatio, true);
        assert.ok(ui.videoLength);
        assert.deepEqual(ui.videoQuality?.options, ['480p', '720p', '1080p']);
        assert.equal(ui.generateAudio, true);
        assert.equal(ui.imageToVideoHint, true);
    });

    it('evolink seedance t2v exposes video controls, audio, and web search (no i2v hint)', () => {
        const ui = getUiCapabilities('evolink/seedance-2.0/text-to-video');
        assert.equal(ui.aspectRatio, true);
        assert.ok(ui.videoLength);
        assert.deepEqual(ui.videoQuality?.options, ['480p', '720p', '1080p']);
        assert.equal(ui.generateAudio, true);
        assert.equal(ui.webSearch, true);
        assert.equal(ui.imageToVideoHint, false);
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
        assert.equal(ui.resolution?.default, '3K');
        assert.equal(ui.webSearch, true);
    });

    it('does not expose web search for other evolink models', () => {
        assert.equal(getUiCapabilities('evolink/doubao-seedream-4.5').webSearch, false);
        assert.equal(getUiCapabilities('evolink/z-image-turbo').webSearch, false);
    });
});

describe('picker visibility', () => {
    it('shows every catalog model in the picker', async () => {
        const { isVisibleInPicker } = await import('../js/model-capabilities.js');
        const catalog = require('../shared/model-catalog.json');

        for (const m of catalog.models) {
            assert.equal(isVisibleInPicker(m.id), true, m.id);
        }

        assert.equal(isVisibleInPicker('evolink/doubao-seedream-5.0-lite'), true);
        assert.equal(isVisibleInPicker('black-forest-labs/flux.2-pro'), true);
    });
});
