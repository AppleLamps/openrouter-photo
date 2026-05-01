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
    'fal-ai/nucleus-image': { price: { type: 'flat', amount: 0.04 } },
    'fal-ai/z-image/turbo/lora': { price: { type: 'mpix', amount: 0.0085 } },
    'fal-ai/bitdance': { price: { type: 'flat', amount: 0.01 } },
    'fal-ai/qwen-image-max/text-to-image': { price: { type: 'flat', amount: 0.075 } },
    'fal-ai/qwen-image-max/edit': { edit: true, price: { type: 'flat', amount: 0.075 } },
    'fal-ai/reve/edit': { edit: true, singleImageUrl: true, price: { type: 'flat', amount: 0.04 } },
    'fal-ai/phota': {},
    'fal-ai/phota/edit': { edit: true, price: { type: 'resolution', oneK: 0.09, fourK: 0.18 } },
};

const FAL_VIDEO_MODELS = {
    'fal-ai/bytedance/seedance/v1.5/pro/text-to-video': {},
    'fal-ai/bytedance/seedance/v1.5/pro/image-to-video': { imageToVideo: true },
    'fal-ai/bytedance/seedance-2.0/text-to-video': { seedance20: true },
    'fal-ai/bytedance/seedance-2.0/image-to-video': { seedance20: true, imageToVideo: true },
    'alibaba/happy-horse/reference-to-video': {
        imageToVideo: true,
        happyHorse: true,
        pricePerSecond: { '720p': 0.14, '1080p': 0.28 },
    },
};

function getFalImageModel(model) {
    return FAL_IMAGE_MODELS[model] || null;
}

function getFalVideoModel(model) {
    return FAL_VIDEO_MODELS[model] || null;
}

function getFalImageCostPerImage(model, imageSize, estimateMegapixelsFromImageSize) {
    const config = getFalImageModel(model);
    const price = config?.price;
    if (!price) return 0;
    if (price.type === 'mpix') {
        return price.amount * estimateMegapixelsFromImageSize(imageSize);
    }
    if (price.type === 'resolution') {
        return imageSize === '4K' ? price.fourK : price.oneK;
    }
    return price.amount;
}

module.exports = {
    getFalImageModel,
    getFalVideoModel,
    getFalImageCostPerImage,
    isFalImageModel: (model) => Boolean(getFalImageModel(model)),
    isFalVideoModel: (model) => Boolean(getFalVideoModel(model)),
    isFalEditModel: (model) => Boolean(getFalImageModel(model)?.edit),
};
