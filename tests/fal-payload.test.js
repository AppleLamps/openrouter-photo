const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getFalImageConfig } = require('../api/model-catalog');
const { buildFalImagePayload, aspectRatioToFalImageSize } = require('../api/providers/fal-image');

/** One representative model per falImage.variant */
const VARIANT_MODELS = {
    'seedream-default': 'fal-ai/wan/v2.7/text-to-image',
    nucleus: 'fal-ai/nucleus-image',
    'ernie-turbo': 'fal-ai/ernie-image/lora/turbo',
    ernie: 'fal-ai/ernie-image/lora',
    'z-image': 'fal-ai/z-image/turbo/lora',
    ovis: 'fal-ai/ovis-image',
    glm: 'fal-ai/glm-image',
    bitdance: 'fal-ai/bitdance',
    'flux-klein-edit': 'fal-ai/flux-2/klein/9b/edit/lora',
    phota: 'fal-ai/phota',
    'flux-pro': 'fal-ai/flux-pro/v1.1',
    'qwen-max': 'fal-ai/qwen-image-max/text-to-image',
};

const BASE_CTX = {
    prompt: '  test prompt  ',
    parsedNumImages: 2,
    normalizedAspectRatio: '16:9',
    resolution: '1K',
    falImageSize: 'landscape_16_9',
};

function buildForVariant(variant) {
    const model = VARIANT_MODELS[variant];
    const falImageConfig = getFalImageConfig(model);
    assert.equal(falImageConfig.variant, variant, `catalog model for ${variant}`);
    return buildFalImagePayload({
        model,
        ...BASE_CTX,
        falImageConfig,
    });
}

describe('Fal image payload snapshots', () => {
    for (const variant of Object.keys(VARIANT_MODELS)) {
        it(`${variant} includes prompt and sizing field`, () => {
            const payload = buildForVariant(variant);
            assert.equal(payload.prompt, 'test prompt');
            assert.ok('image_size' in payload || 'aspect_ratio' in payload || variant === 'phota');
            if (variant === 'phota') {
                assert.ok('aspect_ratio' in payload);
                assert.ok('resolution' in payload);
            }
        });
    }

    it('z-image disables safety checker and uses preset steps', () => {
        const payload = buildForVariant('z-image');
        assert.equal(payload.enable_safety_checker, false);
        assert.equal(payload.num_inference_steps, 8);
        assert.equal(payload.image_size, 'landscape_16_9');
    });

    it('nucleus uses aspect_ratio not image_size', () => {
        const payload = buildForVariant('nucleus');
        assert.equal(payload.aspect_ratio, '16:9');
        assert.equal('image_size' in payload, false);
        assert.equal(payload.enable_safety_checker, false);
    });

    it('seedream-default disables both safety checkers', () => {
        const payload = buildForVariant('seedream-default');
        assert.equal(payload.enable_safety_checker, false);
        assert.equal(payload.enable_output_safety_checker, false);
    });

    it('seedream-default falls back to a valid Fal image_size preset', () => {
        assert.equal(aspectRatioToFalImageSize('bad-ratio', false), 'landscape_4_3');
        assert.equal(aspectRatioToFalImageSize('bad-ratio', true), 'landscape_4_3');
    });

    it('flux-pro uses safety_tolerance instead of enable_safety_checker', () => {
        const payload = buildForVariant('flux-pro');
        assert.equal(payload.safety_tolerance, '6');
        assert.equal('enable_safety_checker' in payload, false);
    });

    it('phota maps resolution from settings', () => {
        const model = VARIANT_MODELS.phota;
        const falImageConfig = getFalImageConfig(model);
        const payload = buildFalImagePayload({
            model,
            ...BASE_CTX,
            resolution: '4K',
            falImageConfig,
        });
        assert.equal(payload.resolution, '4K');
        assert.equal(payload.aspect_ratio, '16:9');
    });
});
