const FAL_IMAGE_MODELS = {
    'fal-ai/bytedance/seedream/v4.5/text-to-image': { price: { type: 'flat', amount: 0.04 } },
    'fal-ai/bytedance/seedream/v4.5/edit': { edit: true, price: { type: 'flat', amount: 0.04 } },
    'fal-ai/bytedance/seedream/v5/lite/text-to-image': { price: { type: 'flat', amount: 0.04 } },
    'fal-ai/bytedance/seedream/v5/lite/edit': { edit: true, price: { type: 'flat', amount: 0.04 } },
    'fal-ai/wan/v2.7/text-to-image': { price: { type: 'flat', amount: 0.04 } },
    'fal-ai/wan/v2.7/pro/text-to-image': { price: { type: 'flat', amount: 0.04 } },
    'fal-ai/wan/v2.7/edit': { edit: true, price: { type: 'flat', amount: 0.04 } },
    'fal-ai/wan/v2.7/pro/edit': { edit: true, price: { type: 'flat', amount: 0.04 } },
    'fal-ai/ernie-image/lora': { price: { type: 'mpix', amount: 0.015 } },
    'fal-ai/ernie-image/lora/turbo': { price: { type: 'mpix', amount: 0.015 } },
    'fal-ai/nucleus-image': { price: { type: 'mpix', amount: 0.01 } },
    'fal-ai/glm-image': { price: { type: 'mpix', amount: 0.05 } },
    'fal-ai/ovis-image': { price: { type: 'mpix', amount: 0.012 } },
    'fal-ai/z-image/turbo/lora': { price: { type: 'mpix', amount: 0.0085 } },
    'fal-ai/bitdance': { price: { type: 'flat', amount: 0.01 } },
    'fal-ai/qwen-image-max/text-to-image': { price: { type: 'flat', amount: 0.075 } },
    'fal-ai/qwen-image-max/edit': { edit: true, price: { type: 'flat', amount: 0.075 } },
    'fal-ai/flux-2/klein/9b/edit/lora': {
        edit: true,
        price: { type: 'mpix', amount: 0.015 },
        // Fal documents input images for this endpoint as being resized to 1 MP
        // for billing, so input cost is modeled as a fixed 1 MP per attachment.
        inputPrice: { type: 'mpix', amount: 0.015, megapixels: 1 },
    },
    'fal-ai/phota': {},
    'fal-ai/phota/edit': { edit: true, price: { type: 'resolution', oneK: 0.09, fourK: 0.18 } },
};

const FAL_VIDEO_MODELS = {
    'fal-ai/bytedance/seedance/v1.5/pro/text-to-video': {},
    'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': { imageToVideo: true },
    'bytedance/seedance-2.0/text-to-video': {
        seedance20: true,
        pricePerSecond: { '720p': 0.3034 },
    },
    'bytedance/seedance-2.0/image-to-video': {
        seedance20: true,
        imageToVideo: true,
        pricePerSecond: { '720p': 0.3034 },
    },
    'fal-ai/pixverse/c1/image-to-video': {
        imageToVideo: true,
        pixverseC1: true,
        pricePerSecond: {
            noAudio: { '360p': 0.03, '540p': 0.04, '720p': 0.05, '1080p': 0.095 },
            withAudio: { '360p': 0.04, '540p': 0.05, '720p': 0.065, '1080p': 0.12 },
        },
    },
    'alibaba/happy-horse/reference-to-video': {
        imageToVideo: true,
        happyHorse: true,
        pricePerSecond: { '720p': 0.14, '1080p': 0.28 },
    },
};

const FAL_VIDEO_MODEL_REDIRECTS = {
    'fal-ai/bytedance/seedance-2.0/text-to-video': 'bytedance/seedance-2.0/text-to-video',
    'fal-ai/bytedance/seedance-2.0/image-to-video': 'bytedance/seedance-2.0/image-to-video',
};

function getFalImageModel(model) {
    return FAL_IMAGE_MODELS[model] || null;
}

function getFalVideoModel(model) {
    return FAL_VIDEO_MODELS[model] || null;
}

function normalizeFalVideoModel(model) {
    return FAL_VIDEO_MODEL_REDIRECTS[model] || model;
}

function getFalImageCostPerImage(model, imageSize, estimateMegapixelsFromImageSize, options = {}) {
    const config = getFalImageModel(model);
    const price = config?.price;
    if (!price) return 0;

    const imageCount = Number.isFinite(options.imageCount) && options.imageCount > 0
        ? options.imageCount
        : 1;
    if (imageCount <= 0) return 0;

    let totalCost = 0;
    if (price.type === 'mpix') {
        totalCost += price.amount * estimateMegapixelsFromImageSize(imageSize) * imageCount;
    } else if (price.type === 'resolution') {
        totalCost += (imageSize === '4K' ? price.fourK : price.oneK) * imageCount;
    } else {
        totalCost += price.amount * imageCount;
    }

    const inputPrice = config?.inputPrice;
    const inputImageCount = Number.isFinite(options.inputImageCount) && options.inputImageCount > 0
        ? options.inputImageCount
        : 0;
    const inputMegapixels = inputPrice?.megapixels;
    if (
        inputPrice?.type === 'mpix' &&
        inputImageCount > 0 &&
        Number.isFinite(inputMegapixels) &&
        inputMegapixels > 0
    ) {
        totalCost += inputPrice.amount * inputMegapixels * inputImageCount;
    }

    // Gallery metadata stores a per-result cost, so request-level input charges
    // are intentionally amortized across the returned images.
    return totalCost / imageCount;
}

module.exports = {
    getFalImageModel,
    getFalVideoModel,
    normalizeFalVideoModel,
    getFalImageCostPerImage,
    isFalImageModel: (model) => Boolean(getFalImageModel(model)),
    isFalVideoModel: (model) => Boolean(getFalVideoModel(normalizeFalVideoModel(model))),
    isFalEditModel: (model) => Boolean(getFalImageModel(model)?.edit),
};
