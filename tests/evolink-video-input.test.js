const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleEvolink } = require('../api/providers/evolink');
const { handleEvolinkVideo, buildVideoToVideoPayload } = require('../api/providers/evolink-video');
const { getUiCapabilities, getInputConstraints, getBackend } = require('../api/model-catalog');
const generateHandler = require('../api/generate');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function makeRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; },
    };
}

function mockEvolink(createUrl) {
    const bodies = [];
    let uploads = 0;
    global.fetch = async (url, options = {}) => {
        if (url.includes('/upload/base64')) {
            uploads += 1;
            const fileUrl = `https://files.example/ref-${uploads}.png`;
            return { ok: true, json: async () => ({ data: { file_url: fileUrl } }) };
        }
        assert.equal(url, createUrl);
        bodies.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ id: `task-${bodies.length}` }) };
    };
    return bodies;
}

const EDIT = 'evolink/gemini-omni-1.2-flash/video-edit';
const EXTEND = 'evolink/gemini-omni-1.2-flash/video-extend';
const UPSCALE = 'evolink/gemini-omni-1.2-flash/video-upscale';
const VIDEO_URL = 'https://files.evolink.ai/videos/source.mp4';

async function runVideo(model, overrides = {}) {
    const bodies = mockEvolink('https://api.evolink.ai/v1/videos/generations');
    const res = makeRes();
    await handleEvolinkVideo({
        res, model, prompt: 'make it dusk', normalizedInputImages: [], evolinkKey: 'test-key',
        inputVideoUrl: VIDEO_URL, inputVideoDuration: 6, ...overrides,
    });
    return { res, bodies };
}

describe('Nano Banana 2.1 web search', () => {
    it('exposes the toggle, off by default, with a per-search price', () => {
        const ui = getUiCapabilities('evolink/gemini-nano-banana-2.1');
        assert.equal(ui.webSearch, true);
        assert.equal(ui.webSearchDefault, false);
        // Seedream 5 Lite keeps its existing default-on toggle.
        assert.equal(getUiCapabilities('evolink/doubao-seedream-5.0-lite').webSearchDefault, true);
    });

    it('sends model_params.web_search only when enabled', async () => {
        for (const enabled of [true, false]) {
            const bodies = mockEvolink('https://api.evolink.ai/v1/images/generations');
            await handleEvolink({
                res: makeRes(), model: 'evolink/gemini-nano-banana-2.1', prompt: 'today\'s skyline',
                parsedNumImages: 1, normalizedAspectRatio: '1:1', resolution: '2K',
                normalizedInputImages: [], evolinkKey: 'k', enable_web_search: enabled,
            });
            assert.deepEqual(bodies[0].model_params, enabled ? { web_search: true } : undefined);
        }
    });
});

describe('Seedream 5.5 background and exact size', () => {
    it('forces PNG and sends background for transparent output', async () => {
        const bodies = mockEvolink('https://api.evolink.ai/v1/images/generations');
        await handleEvolink({
            res: makeRes(), model: 'evolink/doubao-seedream-5.5', prompt: 'a sticker of a fox',
            parsedNumImages: 1, normalizedAspectRatio: '1:1', resolution: '1K', output_format: 'jpeg',
            background: 'transparent', normalizedInputImages: [], evolinkKey: 'k',
        });
        assert.equal(bodies[0].background, 'transparent');
        assert.equal(bodies[0].output_format, 'png');
    });

    it('omits background for auto and ignores unknown values', async () => {
        for (const background of ['auto', 'neon']) {
            const bodies = mockEvolink('https://api.evolink.ai/v1/images/generations');
            await handleEvolink({
                res: makeRes(), model: 'evolink/doubao-seedream-5.5', prompt: 'x', parsedNumImages: 1,
                normalizedAspectRatio: '1:1', resolution: '1K', background, normalizedInputImages: [], evolinkKey: 'k',
            });
            assert.equal('background' in bodies[0], false);
        }
    });

    it('bills exact sizes at the 2K price only above 2,610,000 px', async () => {
        const cases = [['1536x1536', '0.0160'], ['2048x2048', '0.0280']];
        for (const [size, cost] of cases) {
            const bodies = mockEvolink('https://api.evolink.ai/v1/images/generations');
            const res = makeRes();
            await handleEvolink({
                res, model: 'evolink/doubao-seedream-5.5', prompt: 'x', parsedNumImages: 1,
                normalizedAspectRatio: '1:1', exactImageSize: size, resolution: '1K',
                normalizedInputImages: [], evolinkKey: 'k',
            });
            assert.equal(bodies[0].size, size);
            assert.equal('quality' in bodies[0], false);
            assert.equal(res.body.estimated_cost.toFixed(4), cost);
        }
    });

    it('has a Background control and exact-size presets inside the documented pixel range', () => {
        const ui = getUiCapabilities('evolink/doubao-seedream-5.5');
        assert.deepEqual(ui.background.options, ['auto', 'transparent', 'opaque']);
        for (const preset of ui.exactSize.presets) {
            const [w, h] = preset.split('x').map(Number);
            assert.ok(w * h >= 921600 && w * h <= 4624220, preset);
        }
    });
});

describe('Gemini Omni video edit / extend / upscale', () => {
    it('routes as video-to-video with a required video input', () => {
        for (const id of [EDIT, EXTEND, UPSCALE]) {
            assert.equal(getBackend(id), 'evolink-video');
            assert.equal(getInputConstraints(id).video.required, true);
        }
        assert.equal(getInputConstraints(EXTEND).video.maxSeconds, 30);
        assert.equal(getInputConstraints(UPSCALE).promptOptional, true);
    });

    it('edit sends prompt, video and references with no duration or aspect ratio', async () => {
        const { res, bodies } = await runVideo(EDIT, {
            normalizedInputImages: ['data:image/png;base64,A'],
            xai_video_quality: '1080p',
            normalizedAspectRatio: '16:9',
            xai_video_length: 12,
        });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(bodies[0], {
            model: 'gemini-omni-1.2-flash-video-edit',
            prompt: 'make it dusk',
            video_urls: [VIDEO_URL],
            quality: '1080p',
            image_urls: ['https://files.example/ref-1.png'],
        });
        // 6 s input at the 1080p rate.
        assert.equal(res.body.estimated_cost.toFixed(2), '0.63');
    });

    it('extend sends the seconds to add', async () => {
        const { res, bodies } = await runVideo(EXTEND, { xai_video_length: 8 });
        assert.deepEqual(bodies[0], {
            model: 'gemini-omni-1.2-flash-video-extend', prompt: 'make it dusk', video_urls: [VIDEO_URL],
            quality: 'auto', duration: 8,
        });
        assert.equal(res.body.estimated_cost.toFixed(3), '0.576');
    });

    it('upscale sends no prompt and defaults to 1080p', async () => {
        const { bodies } = await runVideo(UPSCALE, { normalizedInputImages: ['data:image/png;base64,A'] });
        assert.deepEqual(bodies[0], {
            model: 'gemini-omni-1.2-flash-video-upscale', video_urls: [VIDEO_URL], quality: '1080p',
        });
    });

    it('rejects a video route with no video before calling Evolink', async () => {
        global.fetch = async () => { throw new Error('should not be called'); };
        const res = makeRes();
        await handleEvolinkVideo({ res, model: EDIT, prompt: 'x', normalizedInputImages: [], evolinkKey: 'k' });
        assert.equal(res.statusCode, 400);
    });

    it('builds payloads directly', () => {
        assert.deepEqual(buildVideoToVideoPayload({
            apiModel: 'm', prompt: ' p ', evolink: {}, duration: 5, quality: 'auto', videoUrl: VIDEO_URL,
        }), { model: 'm', prompt: 'p', video_urls: [VIDEO_URL], quality: 'auto' });
    });

    it('/api/generate rejects a missing or non-HTTPS video_url', async () => {
        for (const video_url of [undefined, 'http://example.com/a.mp4', 'javascript:alert(1)']) {
            const res = makeRes();
            await generateHandler({
                method: 'POST',
                url: `/api/generate-video-${Math.random()}`,
                headers: { host: 'localhost', 'x-evolink-api-key': 'k' },
                socket: { remoteAddress: `127.0.1.${Math.floor(Math.random() * 200) + 1}` },
                body: { prompt: 'x', model: EDIT, video_url },
            }, res);
            assert.equal(res.statusCode, 400, String(video_url));
            assert.match(res.body.error, /MP4 video/);
        }
    });
});

describe('video-input helpers', () => {
    const load = () => import('../js/video-input.js');

    it('checks duration, upscale sizes and upscale targets', async () => {
        const { getVideoInputError } = await load();
        const edit = getInputConstraints(EDIT).video;
        const upscale = getInputConstraints(UPSCALE).video;
        assert.equal(getVideoInputError({ duration: 15.04, width: 1280, height: 720 }, edit, 'auto'), null);
        assert.match(getVideoInputError({ duration: 20, width: 1280, height: 720 }, edit, 'auto'), /up to 15 seconds/);
        assert.match(getVideoInputError({ duration: 5, width: 1000, height: 1000 }, upscale, '4k'), /640x360/);
        assert.match(getVideoInputError({ duration: 5, width: 1920, height: 1080 }, upscale, '1080p'), /can be upscaled to 4k/);
        assert.equal(getVideoInputError({ duration: 5, width: 720, height: 1280 }, upscale, '4k'), null);
    });

    it('reuses a cached upload, uploads a local copy, or falls back to a fresh provider link', async () => {
        const { resolveVideoInputUrl, REMOTE_VIDEO_FRESH_MS } = await load();
        const now = 1_000_000_000_000;
        let uploads = 0;
        const upload = async () => { uploads += 1; return 'https://files.evolink.ai/u.mp4'; };

        const local = { blob: {}, remoteUrl: null, uploadedUrl: null };
        assert.equal(await resolveVideoInputUrl(local, { upload, canUpload: true, now }), 'https://files.evolink.ai/u.mp4');
        assert.equal(await resolveVideoInputUrl(local, { upload, canUpload: true, now: now + 1000 }), 'https://files.evolink.ai/u.mp4');
        assert.equal(uploads, 1, 'second call reuses the cached upload');

        const gallery = { blob: {}, remoteUrl: 'https://cdn.example/v.mp4', remoteCreatedAt: now - 1000 };
        assert.equal(await resolveVideoInputUrl(gallery, { upload, canUpload: false, now }), 'https://cdn.example/v.mp4');

        const stale = { ...gallery, remoteCreatedAt: now - REMOTE_VIDEO_FRESH_MS - 1 };
        await assert.rejects(resolveVideoInputUrl(stale, { upload, canUpload: false, now }), (err) => err.code === 'EVOLINK_API_KEY_REQUIRED');

        await assert.rejects(resolveVideoInputUrl({ blob: null, remoteUrl: null }, { upload, canUpload: true, now }), /no longer available/);
    });
});
