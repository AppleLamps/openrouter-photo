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

    it('evolink seedream 5 pro exposes its documented image options', () => {
        const ui = getUiCapabilities('evolink/doubao-seedream-5.0-pro');
        assert.equal(ui.aspectRatio, true);
        assert.deepEqual(ui.aspectRatioOptions?.options, [
            'auto', '1:1', '2:3', '3:2', '3:4', '4:3',
            '4:5', '5:4', '9:16', '16:9', '21:9',
        ]);
        assert.equal(ui.aspectRatioOptions?.default, 'auto');
        assert.deepEqual(ui.resolution?.options, ['1K', '2K']);
        assert.equal(ui.resolution?.default, '1K');
        assert.deepEqual(ui.outputFormat?.options, ['png', 'jpeg']);
        assert.equal(ui.exactSize?.defaultWidth, 1024);
        assert.equal(ui.exactSize?.maxPixels, 4194304);
        assert.equal(ui.webSearch, false);
    });

    it('does not expose web search for other evolink models', () => {
        assert.equal(getUiCapabilities('evolink/doubao-seedream-4.5').webSearch, false);
        assert.equal(getUiCapabilities('evolink/z-image-turbo').webSearch, false);
    });

    it('classifies seedream 5 pro as both image and edit without duplicating it', async () => {
        const { PICKER_MODELS } = await import('../js/models.js');
        const matches = PICKER_MODELS.filter((model) => model.id === 'evolink/doubao-seedream-5.0-pro');
        assert.equal(matches.length, 1);
        assert.deepEqual(matches[0].modes, ['image', 'edit']);
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
        assert.equal(isVisibleInPicker('evolink/doubao-seedream-5.0-pro'), true);
        assert.equal(isVisibleInPicker('black-forest-labs/flux.2-pro'), true);
    });
});
