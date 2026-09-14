const { it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCapabilities, getUiCapabilities, getOutputConstraints } = require('../api/model-catalog');
const { validateRequiredInputImages } = require('../api/generation-routing');
const { handleEvolinkVideo } = require('../api/providers/evolink-video');
const MODEL = 'evolink/seedance-2.0-mini/image-to-video';

it('exposes Mini I2V with frame constraints and relaxed filtering by default', async () => {
    const caps = resolveCapabilities(MODEL);
    assert.equal(caps.backend, 'evolink-video');
    assert.equal(caps.type, 'image-to-video');
    assert.equal(caps.apiKey, 'evolink');
    assert.equal(caps.evolink.apiModel, 'seedance-2.0-mini-image-to-video');
    assert.equal(caps.evolink.defaultContentFilter, false);
    assert.equal(caps.input.required, true);
    assert.equal(caps.input.maxImages, 2);
    assert.equal(caps.input.imageConstraints.minWidth, 300);
    assert.equal(caps.input.imageConstraints.maxAspectRatio, 2.5);
    const ui = getUiCapabilities(MODEL);
    assert.equal(ui.imageToVideoHint, true);
    assert.equal(ui.contentFilter, true);
    assert.equal(ui.generateAudio, true);
    assert.deepEqual(ui.videoQuality.options, ['480p', '720p']);
    assert.deepEqual(ui.videoLength, { min: 4, max: 15, default: 5 });
    assert.deepEqual(getOutputConstraints(MODEL), { maxImages: 1, defaultImages: 1 });
    assert.equal(validateRequiredInputImages(MODEL, []).status, 400);
    assert.equal(validateRequiredInputImages(MODEL, ['data:image/jpeg;base64,frame']), null);
    const frontend = await import('../js/model-capabilities.js');
    assert.equal(frontend.resolveCapabilities(MODEL).input.required, true);
    assert.equal(frontend.isVisibleInPicker(MODEL), true);
});

for (const count of [1, 2]) {
    it(`uploads ${count} frame(s) in order and creates a Mini I2V task with the surcharge`, async t => {
        const originalFetch = global.fetch;
        t.after(() => { global.fetch = originalFetch; });
        const frames = Array.from({ length: count }, (_, i) => `data:image/jpeg;base64,frame${i}`);
        let payload;
        global.fetch = async (url, options) => {
            const body = JSON.parse(options.body);
            if (url.includes('/upload/base64')) {
                const index = frames.indexOf(body.base64_data);
                assert.ok(index >= 0);
                return { ok: true, json: async () => ({ data: { file_url: `https://example.com/frame${index}.jpg` } }) };
            }
            assert.equal(url, 'https://api.evolink.ai/v1/videos/generations');
            payload = body;
            return { ok: true, json: async () => ({ id: `mini-i2v-${count}` }) };
        };
        const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await handleEvolinkVideo({ res, model: MODEL, prompt: 'A slow camera move over a landscape',
            normalizedInputImages: frames, evolinkKey: 'test-key', xai_video_length: 5, xai_video_quality: '720p' });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(payload, { model: 'seedance-2.0-mini-image-to-video', prompt: 'A slow camera move over a landscape',
            duration: 5, quality: '720p', aspect_ratio: 'adaptive', generate_audio: true, content_filter: false,
            image_urls: frames.map((_, i) => `https://example.com/frame${i}.jpg`) });
        assert.equal(res.body.request_id, `mini-i2v-${count}`);
        assert.equal(res.body.estimated_cost.toFixed(4), '0.5445');
    });
}
