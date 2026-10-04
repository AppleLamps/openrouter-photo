/**
 * Pure generation routing helpers (testable without HTTP middleware).
 */

const {
    normalizeModelId,
    resolveCapabilities,
    getBackend,
    requiresInputImage,
    getMaxInputImages,
    catalog,
} = require('./model-catalog');

function resolveProviderHandler(modelId) {
    return getBackend(normalizeModelId(modelId));
}

function normalizeInputImages(image_urls, maxImages) {
    if (!Array.isArray(image_urls)) return [];
    return image_urls
        .filter((u) => typeof u === 'string' && u.startsWith('data:image/'))
        .slice(0, maxImages);
}

function normalizeExactImageSize(modelId, imageSize) {
    if (typeof imageSize !== 'string') return null;
    const candidate = imageSize.trim();
    if (!candidate.includes('x')) return null;
    if (!/^\d+x\d+$/.test(candidate)) {
        return { error: 'Exact image size must use WIDTHxHEIGHT pixel format' };
    }

    const exactSize = resolveCapabilities(modelId).ui?.exactSize;
    if (!exactSize) {
        return { error: 'Exact pixel dimensions are not supported by this model' };
    }

    const normalized = candidate;
    const [width, height] = normalized.split('x').map(Number);
    const pixels = width * height;
    const aspectRatio = width / height;
    const isPreset = Array.isArray(exactSize.presets) && exactSize.presets.includes(normalized);
    const valid = Number.isSafeInteger(width)
        && Number.isSafeInteger(height)
        && width > 0
        && height > 0
        && aspectRatio >= exactSize.minAspectRatio
        && aspectRatio <= exactSize.maxAspectRatio
        && (isPreset || (pixels >= exactSize.minPixels && pixels <= exactSize.maxPixels));

    if (!valid) {
        return { error: 'Exact image size is outside the supported pixel or aspect-ratio range' };
    }

    // Some routes (GPT Image 2.5) also require 16-pixel alignment and cap each edge.
    const multipleOf = Number(exactSize.multipleOf);
    if (Number.isInteger(multipleOf) && multipleOf > 1 && (width % multipleOf !== 0 || height % multipleOf !== 0)) {
        return { error: `Exact image dimensions must be multiples of ${multipleOf} pixels for this model` };
    }
    const maxEdge = Number(exactSize.maxEdge);
    if (Number.isInteger(maxEdge) && maxEdge > 0 && (width > maxEdge || height > maxEdge)) {
        return { error: `Exact image dimensions must not exceed ${maxEdge} pixels per side for this model` };
    }

    return { value: normalized };
}

function validateRequiredInputImages(modelId, image_urls) {
    const model = normalizeModelId(modelId);
    if (!requiresInputImage(model)) return null;

    const maxImages = getMaxInputImages(model);
    const normalized = normalizeInputImages(image_urls, maxImages);
    if (normalized.length === 0) {
        return {
            status: 400,
            error: 'Edit models require at least one attached image. Please attach an image and try again.',
        };
    }
    return null;
}

function listModelsByBackend() {
    const byBackend = {};
    for (const entry of catalog.models) {
        const backend = resolveCapabilities(entry.id).backend;
        if (!byBackend[backend]) byBackend[backend] = [];
        byBackend[backend].push(entry.id);
    }
    return byBackend;
}

module.exports = {
    resolveProviderHandler,
    normalizeInputImages,
    normalizeExactImageSize,
    validateRequiredInputImages,
    listModelsByBackend,
};
