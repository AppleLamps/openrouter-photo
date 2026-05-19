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
    validateRequiredInputImages,
    listModelsByBackend,
};
