const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPayload,
    normalizeDuration,
    normalizeQuality,
    estimateCost,
    handleOpenRouterVideo,
} = require('../api/providers/openrouter-video');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('OpenRouter Grok video payloads', () => {
    it('builds text-to-video parameters without frame images', () => {
        const payload = buildPayload({
            model: 'x-ai/grok-imagine-video',
            prompt: 'A cinematic orbit',
            duration: 8,
            quality: '720p',
            aspectRatio: '16:9',
            inputImages: [],
            supportsAspectRatio: true,
        });
        assert.deepEqual(payload, {
            model: 'x-ai/grok-imagine-video',
            prompt: 'A cinematic orbit',
            duration: 8,
            resolution: '720p',
            aspect_ratio: '16:9',
        });
    });

    it('sends the attached image as an OpenRouter first frame', () => {
        const payload = buildPayload({
            model: 'x-ai/grok-imagine-video-1.5',
            prompt: 'Animate this portrait',
            duration: 10,
            quality: '1080p',
            aspectRatio: '1:1',
            inputImages: ['data:image/png;base64,AAAA'],
            supportsAspectRatio: false,
        });
        assert.deepEqual(payload.frame_images, [{
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAAA' },
            frame_type: 'first_frame',
        }]);
        assert.equal(payload.aspect_ratio, undefined);
        assert.equal(payload.resolution, '1080p');
    });

    it('normalizes controls and estimates model-specific cost', () => {
        const limits = { min: 1, max: 15, default: 10 };
        assert.equal(normalizeDuration('12', limits), 12);
        assert.equal(normalizeDuration('20', limits), 10);
        assert.equal(normalizeQuality('1080p', ['480p', '720p'], '720p'), '720p');
        assert.ok(Math.abs(estimateCost('x-ai/grok-imagine-video', 10, '720p', 1) - 0.702) < 1e-9);
        assert.ok(Math.abs(estimateCost('x-ai/grok-imagine-video-1.5', 10, '1080p', 1) - 2.51) < 1e-9);
    });

    it('returns the canonical async descriptor used by frontend polling', async () => {
        let sentPayload;
        global.fetch = async (_url, options) => {
            sentPayload = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    id: 'job-grok-1',
                    generation_id: 'gen-grok-1',
                    status: 'pending',
                }),
            };
        };
        const res = {
            statusCode: 200,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        await handleOpenRouterVideo({
            req: { headers: {} },
            res,
            model: 'x-ai/grok-imagine-video',
            modelCaps: null,
            prompt: 'A moving landscape',
            normalizedInputImages: [],
            normalizedAspectRatio: '16:9',
            xai_video_length: 5,
            xai_video_quality: '480p',
            openRouterApiKey: 'or-test-key',
        });
        assert.equal(res.statusCode, 202);
        assert.equal(res.body.provider, 'openrouter');
        assert.equal(res.body.request_id, 'job-grok-1');
        assert.equal(res.body.requests[0].media_type, 'video');
        assert.equal(sentPayload.model, 'x-ai/grok-imagine-video');
        assert.equal(sentPayload.duration, 5);
        assert.equal(sentPayload.resolution, '480p');
    });
});
