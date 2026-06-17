/**
 * Image/video generation flow, prompt attachments, and settings restore
 */

import { generateImage, pollVideoStatus } from './api.js';
import {
    PROMPT_ATTACHMENTS_MAX,
    PROMPT_ATTACHMENT_MAX_BYTES,
    PROMPT_ATTACHMENT_MAX_DIMENSION,
    PROMPT_ATTACHMENT_JPEG_QUALITY,
} from './config.js';
import { state } from './state.js';
import { generateId } from './utils.js';
import {
    showPlaceholder,
    removePlaceholder,
    showErrorCard,
} from './gallery.js';
import { DEFAULT_MODEL_ID, getUiCapabilities, normalizeModelId, resolveCapabilities } from './models.js';
import {
    syncModelDropdownUI,
    syncNumImagesDropdownUI,
    updateSettingsForModel,
} from './model-picker.js';
import { recordSpend } from './spend-tracker.js';
import { showApiKeyPopupForCode } from './settings-keys.js';

/** @type {string[]} */
let promptImageDataUrls = [];

/** @type {boolean} */
let isGenerating = false;

/** @type {AbortController|null} */
let generationAbortController = null;

/** @type {Map<string, {prompt: string, settings: Object}>} */
let placeholderMetadata = new Map();

/** @type {{ showError: Function, shakeElement: Function, autoResizeTextarea: Function, getExtraImageUrls: () => string[] }} */
let deps = {
    showError: () => {},
    shakeElement: () => {},
    autoResizeTextarea: () => {},
    getExtraImageUrls: () => [],
};

export function renderPromptAttachments() {
    const container = document.getElementById('prompt-attachments');
    if (!container) return;

    container.innerHTML = '';

    promptImageDataUrls.forEach((url, index) => {
        const wrap = document.createElement('div');
        wrap.className = 'input-bar__attachment';

        const img = document.createElement('img');
        img.src = url;
        img.alt = `Attached image ${index + 1}`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'input-bar__attachment-remove';
        remove.setAttribute('aria-label', 'Remove attached image');
        remove.textContent = '✕';
        remove.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            promptImageDataUrls.splice(index, 1);
            renderPromptAttachments();
        });

        wrap.appendChild(img);
        wrap.appendChild(remove);
        container.appendChild(wrap);
    });
}

export async function compressImageForUpload(file) {
    const MAX_SIZE = PROMPT_ATTACHMENT_MAX_DIMENSION;
    const QUALITY = PROMPT_ATTACHMENT_JPEG_QUALITY;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = Math.round((height * MAX_SIZE) / width);
                    width = MAX_SIZE;
                } else {
                    width = Math.round((width * MAX_SIZE) / height);
                    height = MAX_SIZE;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
            resolve(dataUrl);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for compression'));
        };

        img.src = url;
    });
}

async function addPromptImageFiles(files) {
    const list = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (list.length === 0) return;

    for (const file of list) {
        if (promptImageDataUrls.length >= PROMPT_ATTACHMENTS_MAX) {
            deps.showError(`Maximum ${PROMPT_ATTACHMENTS_MAX} images can be attached.`);
            break;
        }
        if (file.size > PROMPT_ATTACHMENT_MAX_BYTES) {
            deps.showError(`Image "${file.name}" is too large (max 8MB).`);
            continue;
        }

        try {
            const dataUrl = await compressImageForUpload(file);
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                promptImageDataUrls.push(dataUrl);
                renderPromptAttachments();
            }
        } catch (error) {
            console.error('Failed to compress image:', error);
            deps.showError(`Failed to process "${file.name}".`);
        }
    }
}

function clearPromptAttachments() {
    promptImageDataUrls = [];
    const input = document.getElementById('prompt-image-input');
    if (input instanceof HTMLInputElement) input.value = '';
    renderPromptAttachments();
}

export function setPromptAttachments(urls) {
    promptImageDataUrls = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string') : [];
    renderPromptAttachments();
}

export function getAttachedImageUrls(limit = PROMPT_ATTACHMENTS_MAX) {
    const images = [
        ...promptImageDataUrls,
        ...deps.getExtraImageUrls(),
    ].filter((url) => typeof url === 'string' && url.startsWith('data:image/'));

    return Array.from(new Set(images)).slice(0, limit);
}

function getGenerationSettings() {
    const modelSelect = document.getElementById('setting-model');
    const numImagesSelect = document.getElementById('setting-num-images');
    const aspectRatioSelect = document.getElementById('setting-aspect-ratio');
    const resolutionSelect = document.getElementById('setting-resolution');
    const xaiVideoLengthInput = document.getElementById('setting-xai-video-length');
    const xaiVideoQualitySelect = document.getElementById('setting-xai-video-quality');
    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');
    const webSearchSwitch = document.getElementById('setting-web-search-switch');
    const flashheadVoiceSelect = document.getElementById('setting-flashhead-voice');
    const flashheadStabilityInput = document.getElementById('setting-flashhead-stability');

    const model = normalizeModelId(modelSelect?.value || DEFAULT_MODEL_ID);

    const parsedXaiVideoLength = parseInt(xaiVideoLengthInput?.value || 10, 10);
    const xaiVideoLength = Number.isFinite(parsedXaiVideoLength) ? parsedXaiVideoLength : 10;
    const parsedFlashHeadStability = parseFloat(flashheadStabilityInput?.value || 0.5);
    const flashheadStability = Number.isFinite(parsedFlashHeadStability)
        ? Math.min(Math.max(parsedFlashHeadStability, 0), 1)
        : 0.5;

    return {
        model,
        num_images: parseInt(numImagesSelect?.value || 2, 10),
        aspect_ratio: aspectRatioSelect?.value || '3:4',
        resolution: resolutionSelect?.value || '1K',
        xai_video_length: xaiVideoLength,
        xai_video_quality: xaiVideoQualitySelect?.value || '720p',
        generate_audio_switch: generateAudioSwitch instanceof HTMLInputElement ? generateAudioSwitch.checked : true,
        enable_web_search: webSearchSwitch instanceof HTMLInputElement ? webSearchSwitch.checked : false,
        flashhead_voice: flashheadVoiceSelect?.value || 'Aria',
        flashhead_stability: flashheadStability,
    };
}

export function restoreSettings(settings) {
    if (!settings || typeof settings !== 'object') return;

    const modelSelect = document.getElementById('setting-model');
    const model = normalizeModelId(settings.model || modelSelect?.value || DEFAULT_MODEL_ID);
    if (modelSelect && settings.model) {
        modelSelect.value = model;
        syncModelDropdownUI();
        updateSettingsForModel(model);
    }

    const ui = getUiCapabilities(model);
    const videoAspectRatios = resolveCapabilities(model).evolink?.aspectRatios || null;

    const hasSelectOption = (select, value) =>
        select instanceof HTMLSelectElement
        && typeof value === 'string'
        && Array.from(select.options).some((option) => option.value === value);

    const setSelectIfValid = (select, value, allowedValues = null) => {
        if (!(select instanceof HTMLSelectElement) || typeof value !== 'string') return;
        if (Array.isArray(allowedValues) && !allowedValues.includes(value)) return;
        if (!hasSelectOption(select, value)) return;
        select.value = value;
    };

    const getBoundedNumber = (value, fallback, min, max) => {
        const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(Math.max(parsed, min), max);
    };

    const setNumberInput = (input, value, fallback, min, max) => {
        if (!(input instanceof HTMLInputElement)) return;
        input.value = String(getBoundedNumber(value, fallback, min, max));
    };

    const aspectRatioSelect = document.getElementById('setting-aspect-ratio');
    setSelectIfValid(aspectRatioSelect, settings.aspect_ratio, videoAspectRatios);

    const resolutionSelect = document.getElementById('setting-resolution');
    setSelectIfValid(resolutionSelect, settings.resolution, ui.resolution?.options || null);

    const xaiVideoLengthInput = document.getElementById('setting-xai-video-length');
    const videoLength = ui.videoLength || {};
    const videoLengthDefault = videoLength.default ?? Number.parseFloat(xaiVideoLengthInput?.value || '10');
    const videoLengthMin = videoLength.min ?? Number.parseFloat(xaiVideoLengthInput?.min || '1');
    const videoLengthMax = videoLength.max ?? Number.parseFloat(xaiVideoLengthInput?.max || '15');
    setNumberInput(xaiVideoLengthInput, settings.xai_video_length, videoLengthDefault, videoLengthMin, videoLengthMax);

    const xaiVideoQualitySelect = document.getElementById('setting-xai-video-quality');
    setSelectIfValid(xaiVideoQualitySelect, settings.xai_video_quality, ui.videoQuality?.options || null);

    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');
    if (generateAudioSwitch instanceof HTMLInputElement && typeof settings.generate_audio_switch === 'boolean') {
        generateAudioSwitch.checked = settings.generate_audio_switch;
    }

    const webSearchSwitch = document.getElementById('setting-web-search-switch');
    if (webSearchSwitch instanceof HTMLInputElement && typeof settings.enable_web_search === 'boolean') {
        webSearchSwitch.checked = settings.enable_web_search;
    }

    const flashheadVoiceSelect = document.getElementById('setting-flashhead-voice');
    setSelectIfValid(flashheadVoiceSelect, settings.flashhead_voice);

    const flashheadStabilityInput = document.getElementById('setting-flashhead-stability');
    setNumberInput(flashheadStabilityInput, settings.flashhead_stability, 0.5, 0, 1);

    const numImagesSelect = document.getElementById('setting-num-images');
    if (numImagesSelect && settings.num_images !== undefined) {
        const parsedNumImages = Number.parseInt(settings.num_images, 10);
        if (Number.isInteger(parsedNumImages) && parsedNumImages >= 1 && parsedNumImages <= 4) {
            numImagesSelect.value = String(parsedNumImages);
        }
        syncNumImagesDropdownUI();
    }
}

function setLoading(input, button, isLoading) {
    button.disabled = isLoading;

    const sendIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg>`;
    const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    const cancelBtn = document.getElementById('cancel-btn');

    if (isLoading) {
        button.classList.add('input-bar__button--loading');
        button.innerHTML = loadingIcon;
        button.style.display = 'none';
        if (cancelBtn) {
            cancelBtn.style.display = 'flex';
        }
    } else {
        button.classList.remove('input-bar__button--loading');
        button.innerHTML = sendIcon;
        button.style.display = 'flex';
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
    }
}

async function handleGenerate(input, button, retryOptions = null) {
    if (isGenerating || button.disabled) return;
    isGenerating = true;

    const prompt = input.value.trim();

    if (!prompt) {
        isGenerating = false;
        input.focus();
        deps.shakeElement(input);
        return;
    }

    const retrySettings = retryOptions?.settings && typeof retryOptions.settings === 'object'
        ? { ...retryOptions.settings }
        : null;
    const settings = retrySettings || getGenerationSettings();
    const numImages = settings.num_images;

    generationAbortController = new AbortController();
    setLoading(input, button, true);

    const selectedFolderInputAtStart = document.getElementById('selected-folder');
    const generationFolderId = retryOptions && 'folderId' in retryOptions
        ? retryOptions.folderId || null
        : selectedFolderInputAtStart?.value || null;

    const attachedImageUrls = Array.isArray(retryOptions?.imageUrls)
        ? retryOptions.imageUrls
        : getAttachedImageUrls();
    const requestSettings = {
        ...settings,
        ...(attachedImageUrls.length > 0
            ? { image_urls: attachedImageUrls }
            : {}),
    };

    const placeholderIds = [];
    for (let i = 0; i < numImages; i++) {
        const placeholderId = generateId();
        placeholderIds.push(placeholderId);
        showPlaceholder(placeholderId, generationFolderId);
        placeholderMetadata.set(placeholderId, { prompt, settings: requestSettings, folderId: generationFolderId });
    }

    try {
        const abortSignal = generationAbortController.signal;

        let response = await generateImage(prompt, requestSettings, abortSignal);

        if (abortSignal.aborted) {
            placeholderIds.forEach(id => removePlaceholder(id));
            placeholderIds.forEach(id => placeholderMetadata.delete(id));
            return;
        }

        if (response.status === 'pending' && response.request_id) {
            const VIDEO_POLL_INITIAL = 3000;
            const VIDEO_POLL_MULTIPLIER = 1.5;
            const VIDEO_POLL_MAX_INTERVAL = 15000;
            const VIDEO_POLL_MAX_ELAPSED = 360000;
            let pollDelay = VIDEO_POLL_INITIAL;
            let elapsed = 0;

            while (elapsed < VIDEO_POLL_MAX_ELAPSED) {
                if (abortSignal.aborted) {
                    placeholderIds.forEach(id => removePlaceholder(id));
                    placeholderIds.forEach(id => placeholderMetadata.delete(id));
                    return;
                }

                await new Promise(r => setTimeout(r, pollDelay));
                elapsed += pollDelay;
                pollDelay = Math.min(pollDelay * VIDEO_POLL_MULTIPLIER, VIDEO_POLL_MAX_INTERVAL);

                const poll = await pollVideoStatus(response.request_id, abortSignal, {
                    provider: response.provider,
                    model: response.model,
                });

                if (poll.status === 'completed' && poll.url) {
                    response = {
                        images: [{ url: poll.url, media_type: 'video', model: response.model }],
                        meta: { model: response.model, estimated_cost: response.estimated_cost }
                    };
                    break;
                }

                if (poll.status === 'failed') {
                    const failMessage = poll.error
                        ? `Video generation failed: ${poll.error}`
                        : 'Video generation failed. Please try again.';
                    placeholderIds.forEach(id => {
                        const metadata = placeholderMetadata.get(id);
                        if (metadata) {
                            showErrorCard(id, failMessage, metadata.prompt,
                                () => retryGeneration(metadata.prompt, metadata.settings, metadata.folderId));
                            placeholderMetadata.delete(id);
                        }
                    });
                    return;
                }
            }

            if (elapsed >= VIDEO_POLL_MAX_ELAPSED && !(response.images && response.images.length > 0)) {
                placeholderIds.forEach(id => {
                    const metadata = placeholderMetadata.get(id);
                    if (metadata) {
                        showErrorCard(id, 'Video generation timed out. Please try again.', metadata.prompt,
                            () => retryGeneration(metadata.prompt, metadata.settings, metadata.folderId));
                        placeholderMetadata.delete(id);
                    }
                });
                return;
            }
        }

        if (response.images && response.images.length > 0) {
            recordSpend(response.meta, response.images.length);
            const storableSettings = { ...settings };
            delete storableSettings.image_url;
            delete storableSettings.image_urls;

            const folderId = generationFolderId;

            const saveResults = await Promise.all(response.images.map(async (image, index) => {
                const mediaType = image.media_type || image.mediaType || 'image';

                const result = await state.addImage({
                    id: generateId(),
                    url: image.url,
                    prompt: prompt,
                    createdAt: Date.now(),
                    settings: storableSettings,
                    folderId: folderId,
                    mediaType,
                    sourceUrl: image.source_url || image.sourceUrl || null,
                    generation: {
                        model: image.model || null,
                        cost: image.cost || 0,
                        provider: image.provider || null
                    }
                });

                if (placeholderIds[index]) {
                    removePlaceholder(placeholderIds[index]);
                    placeholderMetadata.delete(placeholderIds[index]);
                }

                return result;
            }));

            if (saveResults.some((result) => result && result.persisted === false)) {
                deps.showError('Generated media is visible now, but could not be saved for reload. Download anything important.');
            }

            placeholderIds.slice(response.images.length).forEach(id => {
                removePlaceholder(id);
                placeholderMetadata.delete(id);
            });

            input.value = '';
            deps.autoResizeTextarea(input);
            clearPromptAttachments();

        } else {
            placeholderIds.forEach(id => {
                const metadata = placeholderMetadata.get(id);
                if (metadata) {
                    showErrorCard(
                        id,
                        'No images were generated. Please try again.',
                        metadata.prompt,
                        () => retryGeneration(metadata.prompt, metadata.settings, metadata.folderId)
                    );
                    placeholderMetadata.delete(id);
                }
            });
        }
    } catch (error) {
        console.error('Generation failed:', error);

        if (error.name === 'AbortError') {
            placeholderIds.forEach(id => {
                removePlaceholder(id);
                placeholderMetadata.delete(id);
            });
            return;
        }

        placeholderIds.forEach(id => {
            const metadata = placeholderMetadata.get(id);
            if (metadata) {
                showErrorCard(
                    id,
                    error.message || 'Failed to generate image. Please try again.',
                    metadata.prompt,
                    () => retryGeneration(metadata.prompt, metadata.settings, metadata.folderId)
                );
                placeholderMetadata.delete(id);
            }
        });

        if (showApiKeyPopupForCode(error?.code, error?.help)) {
            return;
        }
        if (error?.code === 'XAI_API_KEY_REQUIRED') {
            deps.showError(error?.message || 'xAI API key required.');
            return;
        }
        deps.showError(error.message || 'Failed to generate image. Please try again.');
    } finally {
        isGenerating = false;
        generationAbortController = null;
        setLoading(input, button, false);
    }
}

async function retryGeneration(prompt, settings, folderId = null) {
    const input = document.getElementById('prompt-input');
    const button = document.getElementById('generate-btn');

    if (input && button) {
        const retrySettings = settings && typeof settings === 'object' ? { ...settings } : {};
        const retryImageUrls = Array.isArray(retrySettings.image_urls)
            ? retrySettings.image_urls.filter((url) => typeof url === 'string' && url.startsWith('data:image/'))
            : [];

        input.value = prompt;
        restoreSettings(retrySettings);
        setPromptAttachments(retryImageUrls);
        deps.autoResizeTextarea(input);
        await handleGenerate(input, button, {
            settings: retrySettings,
            imageUrls: retryImageUrls,
            folderId,
        });
    }
}

function handleCancelGeneration() {
    if (generationAbortController) {
        generationAbortController.abort();
        generationAbortController = null;
    }
    isGenerating = false;

    const input = document.getElementById('prompt-input');
    const button = document.getElementById('generate-btn');
    if (input && button) {
        setLoading(input, button, false);
    }
}

export function initGenerationController(controllerDeps) {
    deps = { ...deps, ...controllerDeps };

    const promptInput = document.getElementById('prompt-input');
    const promptImageBtn = document.getElementById('prompt-image-btn');
    const promptImageInput = document.getElementById('prompt-image-input');
    const generateBtn = document.getElementById('generate-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    if (generateBtn && promptInput) {
        generateBtn.addEventListener('click', () => handleGenerate(promptInput, generateBtn));

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                handleGenerate(promptInput, generateBtn);
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleGenerate(promptInput, generateBtn);
            }
            if (e.key === 'Escape' && isGenerating) {
                e.preventDefault();
                handleCancelGeneration();
            }
        });

        promptInput.addEventListener('input', () => deps.autoResizeTextarea(promptInput));

        promptInput.addEventListener('paste', async (e) => {
            const items = Array.from(e.clipboardData?.items || []);
            const imageFiles = items
                .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                .map((it) => it.getAsFile())
                .filter(Boolean);
            if (imageFiles.length > 0) {
                e.preventDefault();
                await addPromptImageFiles(imageFiles);
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelGeneration);
    }

    if (promptImageBtn && promptImageInput) {
        promptImageBtn.addEventListener('click', () => {
            promptImageInput.click();
        });

        promptImageInput.addEventListener('change', async (e) => {
            const files = e.target?.files;
            await addPromptImageFiles(files);
        });
    }
}
