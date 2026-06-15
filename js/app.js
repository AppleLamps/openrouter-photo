/**
 * Main application entry point
 */

import { enhancePrompt, getRandomPromptFromAI } from './api.js';
import {
    PROMPT_ATTACHMENT_MAX_BYTES,
    PROMPT_ATTACHMENT_MAX_DIMENSION,
    PROMPT_ATTACHMENT_JPEG_QUALITY
} from './config.js';
import { state } from './state.js';
import { initGallery, initLightbox, closeLightbox, downloadAllImages } from './gallery.js';
import { formatBytes } from './image-utils.js';
import { initSidebar } from './sidebar.js';
import {
    ANIMATE_MODEL_ID,
    DEFAULT_MODEL_ID,
    getApiKey,
} from './models.js';
import {
    initApiKeySettings,
    initApiKeyPopupContext,
    showApiKeyPopupForCode,
} from './settings-keys.js';
import { initSpendTracker } from './spend-tracker.js';
import {
    initModelPicker,
    syncModelDropdownUI,
    syncNumImagesDropdownUI,
    updateSettingsForModel,
} from './model-picker.js';
import {
    compressImageForUpload,
    getAttachedImageUrls,
    initGenerationController,
    restoreSettings,
    setPromptAttachments,
} from './generation-controller.js';

/** @type {string|null} - Single image data URI for image-to-image models */
let inputImageDataUri = null;

/** @type {string[]} - Multiple image data URIs for multi-image models */
let multiImageDataUris = [];
let storageIndicatorQueued = false;
let storageIndicatorInFlight = false;
let storageIndicatorNeedsRerun = false;

const API_KEY_EMPTY_STATE = {
    openrouter: {
        text: 'You need an OpenRouter API key to generate with the selected model.',
        code: 'OPENROUTER_API_KEY_REQUIRED',
    },
    xai: {
        text: 'You need an xAI API key to generate with the selected model.',
        code: 'XAI_API_KEY_REQUIRED',
    },
    evolink: {
        text: 'You need an Evolink API key to generate with the selected model.',
        code: 'EVOLINK_API_KEY_REQUIRED',
    },
};

function scheduleStorageIndicatorUpdate() {
    if (storageIndicatorQueued) return;
    storageIndicatorQueued = true;

    const run = async () => {
        storageIndicatorQueued = false;
        if (storageIndicatorInFlight) {
            storageIndicatorNeedsRerun = true;
            return;
        }
        storageIndicatorInFlight = true;
        try {
            await updateStorageIndicator();
        } finally {
            storageIndicatorInFlight = false;
            if (storageIndicatorNeedsRerun) {
                storageIndicatorNeedsRerun = false;
                scheduleStorageIndicatorUpdate();
            }
        }
    };

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
            run();
        });
    } else {
        setTimeout(() => {
            run();
        }, 16);
    }
}

function updateEmptyStateKeyPrompt() {
    const text = document.querySelector('.empty-state__no-key-text');
    if (!text) return null;

    const modelSelect = document.getElementById('setting-model');
    const providerKey = getApiKey(modelSelect?.value || DEFAULT_MODEL_ID);
    const config = API_KEY_EMPTY_STATE[providerKey] || API_KEY_EMPTY_STATE.openrouter;
    text.textContent = config.text;
    return config;
}

function initEmptyStateKeyPrompt() {
    const modelSelect = document.getElementById('setting-model');
    const addKeyButton = document.getElementById('empty-state-add-key-btn');

    updateEmptyStateKeyPrompt();

    if (modelSelect) {
        modelSelect.addEventListener('change', updateEmptyStateKeyPrompt);
    }

    if (addKeyButton) {
        addKeyButton.addEventListener('click', () => {
            const config = updateEmptyStateKeyPrompt();
            if (config && showApiKeyPopupForCode(config.code)) return;

            const settingsBtn = document.getElementById('settings-btn');
            const settingsPanel = document.getElementById('settings-panel');
            if (settingsBtn && settingsPanel) {
                openSettings(settingsBtn, settingsPanel);
            }
        });
    }
}

/**
 * Initialize the application
 */
async function init() {
    // Wait for state to be ready (IndexedDB initialization)
    await state.ready;

    // Get DOM elements
    const galleryContainer = document.getElementById('gallery');
    const emptyState = document.getElementById('empty-state');
    const promptInput = document.getElementById('prompt-input');
    const enhanceBtn = document.getElementById('enhance-btn');
    const customEnhanceBtn = document.getElementById('custom-enhance-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    const surpriseBtn = document.getElementById('surprise-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const downloadAllBtn = document.getElementById('download-all-btn');

    // Initialize gallery
    if (galleryContainer && emptyState) {
        initGallery(galleryContainer, emptyState);
    }

    // Initialize lightbox
    initLightbox();

    // Initialize sidebar
    initSidebar();

    // Wire up suggestion chips (empty state)
    const suggestionChips = document.getElementById('suggestion-chips');
    if (suggestionChips && promptInput) {
        suggestionChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.empty-state__chip');
            if (!chip) return;
            const prompt = chip.getAttribute('data-prompt');
            if (prompt) {
                promptInput.value = prompt;
                autoResizeTextarea(promptInput);
                promptInput.focus();
            }
        });
    }

    // Generation controller (generate, cancel, attachments)
    initGenerationController({
        showError,
        shakeElement,
        autoResizeTextarea,
        getExtraImageUrls: () => [
            ...(inputImageDataUri ? [inputImageDataUri] : []),
            ...multiImageDataUris,
        ],
    });

    // Set up enhance button listener
    if (enhanceBtn && promptInput) {
        enhanceBtn.addEventListener('click', () => handleEnhance(promptInput, enhanceBtn));
    }

    // Set up custom enhance button listener
    if (customEnhanceBtn && promptInput) {
        setupCustomEnhanceModal(promptInput, customEnhanceBtn);
    }

    // Set up surprise me button listener
    if (surpriseBtn && promptInput) {
        surpriseBtn.addEventListener('click', () => handleSurpriseMe(promptInput));
    }

    // Set up settings panel
    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', () => toggleSettings(settingsBtn, settingsPanel));

        if (settingsClose) {
            settingsClose.addEventListener('click', () => closeSettings(settingsBtn, settingsPanel));
        }

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (settingsPanel.classList.contains('settings-panel--active') &&
                !settingsPanel.contains(e.target) &&
                !settingsBtn.contains(e.target)) {
                closeSettings(settingsBtn, settingsPanel);
            }
        });
    }

    // Set up clear all button
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', handleClearAll);
    }
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', handleDownloadAll);
    }

    // Initialize settings UI interactions
    initApiKeyPopupContext({
        openSettingsPanel: () => {
            const settingsBtn = document.getElementById('settings-btn');
            const settingsPanel = document.getElementById('settings-panel');
            if (settingsBtn && settingsPanel) {
                openSettings(settingsBtn, settingsPanel);
            }
        },
    });
    initSettingsUI();
    initModelPicker();
    initEmptyStateKeyPrompt();

    // Spend tracker
    initSpendTracker();

    // Listen for remix-image event from lightbox
    window.addEventListener('remix-image', handleRemixImage);

    // Listen for animate-image event from lightbox
    window.addEventListener('animate-image', handleAnimateImage);

    // Subscribe to image state changes only (avoid expensive updates on selection/edit events)
    state.subscribe((action) => {
        if (action === 'add' || action === 'remove' || action === 'clear') {
            scheduleStorageIndicatorUpdate();
        }
    });

    // Initial storage indicator update
    scheduleStorageIndicatorUpdate();

    console.log('AI Image Generator initialized');
}

/**
 * Update the storage indicator UI
 */
async function updateStorageIndicator() {
    const storageBar = document.getElementById('storage-used');
    const storageText = document.getElementById('storage-text');
    const imageCount = document.getElementById('image-count');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const downloadAllBtn = document.getElementById('download-all-btn');

    if (!storageBar && !storageText) return;

    try {
        const estimate = await state.getStorageEstimate();
        const imageTotal = state.getImageCount();
        const hasImages = imageTotal > 0;

        if (imageCount) {
            imageCount.textContent = `${imageTotal} image${imageTotal !== 1 ? 's' : ''}`;
        }
        if (clearAllBtn instanceof HTMLButtonElement) clearAllBtn.disabled = !hasImages;
        if (downloadAllBtn instanceof HTMLButtonElement) downloadAllBtn.disabled = !hasImages;

        if (estimate.quota > 0) {
            const percentage = Math.min((estimate.used / estimate.quota) * 100, 100);

            if (storageBar) {
                storageBar.style.width = `${percentage}%`;
                // Change color when storage is getting full
                if (percentage > 80) {
                    storageBar.classList.add('storage-indicator__used--warning');
                } else {
                    storageBar.classList.remove('storage-indicator__used--warning');
                }
            }

            if (storageText) {
                storageText.textContent = `${formatBytes(estimate.used)} / ${formatBytes(estimate.quota)}`;
            }
        } else if (storageText) {
            storageText.textContent = `${imageTotal} image${imageTotal !== 1 ? 's' : ''} stored`;
        }
    } catch (error) {
        console.error('Failed to update storage indicator:', error);
        const imageTotal = state.getImageCount();
        const hasImages = imageTotal > 0;
        if (clearAllBtn instanceof HTMLButtonElement) clearAllBtn.disabled = !hasImages;
        if (downloadAllBtn instanceof HTMLButtonElement) downloadAllBtn.disabled = !hasImages;
        if (storageText) {
            storageText.textContent = `${imageTotal} image${imageTotal !== 1 ? 's' : ''} stored`;
        }
    }
}

/**
 * Handle clear all images button
 */
async function handleClearAll() {
    const imageTotal = state.getImageCount();
    if (imageTotal === 0) return;

    const confirmed = await showClearAllConfirm(imageTotal);
    if (!confirmed) return;

    await state.clearAll();
    updateStorageIndicator();
}

function showClearAllConfirm(imageTotal) {
    return new Promise((resolve) => {
        const existing = document.getElementById('clear-all-confirm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'clear-all-confirm-modal';
        modal.className = 'confirm-modal confirm-modal--active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'clear-all-confirm-title');
        modal.innerHTML = `
            <div class="confirm-modal__backdrop" data-confirm-cancel></div>
            <div class="confirm-modal__card">
                <h3 id="clear-all-confirm-title" class="confirm-modal__title">Clear all media?</h3>
                <p class="confirm-modal__message">Delete all ${imageTotal} photos and videos from this browser. This cannot be undone.</p>
                <div class="confirm-modal__actions">
                    <button type="button" class="confirm-modal__button confirm-modal__button--cancel" data-confirm-cancel>Cancel</button>
                    <button type="button" class="confirm-modal__button confirm-modal__button--confirm" data-confirm-delete>Delete all</button>
                </div>
            </div>
        `;

        const close = (confirmed) => {
            document.removeEventListener('keydown', handleKeydown);
            modal.remove();
            document.body.classList.remove('is-modal-open');
            resolve(confirmed);
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
            }
        };

        modal.querySelectorAll('[data-confirm-cancel]').forEach((element) => {
            element.addEventListener('click', () => close(false));
        });
        modal.querySelector('[data-confirm-delete]')?.addEventListener('click', () => close(true));
        document.addEventListener('keydown', handleKeydown);
        document.body.appendChild(modal);
        document.body.classList.add('is-modal-open');
        modal.querySelector('[data-confirm-cancel]')?.focus();
    });
}

async function handleDownloadAll(event) {
    const button = event?.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    await downloadAllImages(button);
    updateStorageIndicator();
}

/**
 * Initialize settings UI interactions
 */
function initSettingsUI() {
    const modelSelect = document.getElementById('setting-model');

    initApiKeySettings({ showSuccess, showError });

    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            updateSettingsForModel(modelSelect.value);
        });
        updateSettingsForModel(modelSelect.value);
    }

    const photoVisibilitySelect = document.getElementById('setting-photo-visibility');
    if (photoVisibilitySelect) {
        photoVisibilitySelect.value = state.getPhotoVisibilityMode();
        photoVisibilitySelect.addEventListener('change', () => {
            state.setPhotoVisibilityMode(photoVisibilitySelect.value);
        });
    }
}

/**
 * Initialize image upload handlers for Qwen image editing
 */
function initImageUpload() {
    const imageInput = document.getElementById('setting-input-image');
    const imageLabel = document.getElementById('image-upload-label');
    const imagePreview = document.getElementById('image-preview');
    const imagePreviewImg = document.getElementById('image-preview-img');
    const imageClearBtn = document.getElementById('image-preview-clear');

    // Reset image data URI on re-init
    inputImageDataUri = null;

    if (!imageInput || !imageLabel || !imagePreview || !imagePreviewImg || !imageClearBtn) {
        return;
    }

    // Handle file selection
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            handleImageFile(file, imageLabel, imagePreview, imagePreviewImg);
        }
    });

    // Handle drag and drop
    imageLabel.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageLabel.classList.add('image-upload__label--dragover');
    });

    imageLabel.addEventListener('dragleave', (e) => {
        e.preventDefault();
        imageLabel.classList.remove('image-upload__label--dragover');
    });

    imageLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        imageLabel.classList.remove('image-upload__label--dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file, imageLabel, imagePreview, imagePreviewImg);
            // Update the input to reflect the dropped file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            imageInput.files = dataTransfer.files;
        }
    });

    // Handle clear button
    imageClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearImageUpload(imageInput, imageLabel, imagePreview, imagePreviewImg);
    });
}

/**
 * Handle an uploaded image file
 * @param {File} file - The image file
 * @param {HTMLElement} label - The upload label element
 * @param {HTMLElement} preview - The preview container
 * @param {HTMLImageElement} previewImg - The preview image element
 */
async function handleImageFile(file, label, preview, previewImg) {
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
    }

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
        showError('Image file is too large (max 10MB)');
        return;
    }

    try {
        const dataUri = await compressImageForUpload(file);
        if (dataUri) {
            // Store the data URI globally
            inputImageDataUri = dataUri;
            // Show preview
            previewImg.src = dataUri;
            preview.classList.remove('image-upload__preview--hidden');
            label.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to process image:', error);
        showError('Failed to process image file');
    }
}

/**
 * Clear the uploaded image
 * @param {HTMLInputElement} input - The file input
 * @param {HTMLElement} label - The upload label element
 * @param {HTMLElement} preview - The preview container
 * @param {HTMLImageElement} previewImg - The preview image element
 */
function clearImageUpload(input, label, preview, previewImg) {
    inputImageDataUri = null;
    input.value = '';
    previewImg.src = '';
    preview.classList.add('image-upload__preview--hidden');
    label.style.display = 'flex';
}

/**
 * Initialize multi-image upload handlers for Wan v2.6 image-to-image
 */
function initMultiImageUpload() {
    const multiImageInput = document.getElementById('setting-multi-images');
    const multiImageLabel = document.getElementById('multi-image-upload-label');
    const multiImagePreviews = document.getElementById('multi-image-previews');

    // Reset multi-image data URIs on re-init
    multiImageDataUris = [];

    if (!multiImageInput || !multiImageLabel || !multiImagePreviews) {
        return;
    }

    // Handle file selection
    multiImageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            handleMultipleImageFiles(files, multiImagePreviews);
        }
    });

    // Handle drag and drop
    multiImageLabel.addEventListener('dragover', (e) => {
        e.preventDefault();
        multiImageLabel.classList.add('image-upload__label--dragover');
    });

    multiImageLabel.addEventListener('dragleave', (e) => {
        e.preventDefault();
        multiImageLabel.classList.remove('image-upload__label--dragover');
    });

    multiImageLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        multiImageLabel.classList.remove('image-upload__label--dragover');
        const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            handleMultipleImageFiles(files, multiImagePreviews);
            // Update the input
            const dataTransfer = new DataTransfer();
            files.forEach(file => dataTransfer.items.add(file));
            multiImageInput.files = dataTransfer.files;
        }
    });
}

/**
 * Handle multiple uploaded image files
 * @param {File[]} files - The image files
 * @param {HTMLElement} previewsContainer - The previews container
 */
async function handleMultipleImageFiles(files, previewsContainer) {
    // Validate individual files first, filtering out invalid ones
    const validFiles = [];
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showError('Please select valid image files only');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showError(`Image "${file.name}" is too large (max 10MB)`);
            return;
        }
        validFiles.push(file);
    }

    // Limit to 3 images for Wan v2.6 (after validation so all files are checked)
    if (validFiles.length > 3) {
        showError('Maximum 3 images allowed — using first 3');
    }
    files = validFiles.slice(0, 3);

    // Clear existing previews
    multiImageDataUris = [];
    previewsContainer.innerHTML = '';

    // Process each file
    for (const [index, file] of files.entries()) {
        try {
            const dataUri = await compressImageForUpload(file);
            if (dataUri) {
                multiImageDataUris.push(dataUri);
                addMultiImagePreview(dataUri, index + 1, previewsContainer);
            }
        } catch (error) {
            console.error('Failed to process image:', error);
            showError(`Failed to process image file: ${file.name}`);
        }
    }
}

/**
 * Add a preview for a multi-image upload
 * @param {string} dataUri - The image data URI
 * @param {number} index - The image number (1-based)
 * @param {HTMLElement} container - The container element
 */
function addMultiImagePreview(dataUri, index, container) {
    const preview = document.createElement('div');
    preview.className = 'multi-image-preview';
    preview.dataset.index = index;

    const img = document.createElement('img');
    img.className = 'multi-image-preview__img';
    img.src = dataUri;
    img.alt = `Image ${index}`;

    const label = document.createElement('div');
    label.className = 'multi-image-preview__label';
    label.textContent = `Image ${index}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'multi-image-preview__remove';
    removeBtn.textContent = '✕';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeMultiImagePreview(index, container);
    });

    preview.appendChild(img);
    preview.appendChild(label);
    preview.appendChild(removeBtn);
    container.appendChild(preview);
}

/**
 * Remove a multi-image preview
 * @param {number} index - The image number (1-based)
 * @param {HTMLElement} container - The container element
 */
function removeMultiImagePreview(index, container) {
    // Remove from data array
    multiImageDataUris.splice(index - 1, 1);

    // Clear and rebuild previews
    container.innerHTML = '';
    multiImageDataUris.forEach((dataUri, i) => {
        addMultiImagePreview(dataUri, i + 1, container);
    });

    // Update file input
    const multiImageInput = document.getElementById('setting-multi-images');
    if (multiImageInput && multiImageDataUris.length === 0) {
        multiImageInput.value = '';
    }
}

/**
 * Toggle settings panel
 */
function toggleSettings(button, panel) {
    const isActive = panel.classList.contains('settings-panel--active');
    if (isActive) {
        closeSettings(button, panel);
    } else {
        openSettings(button, panel);
    }
}

/**
 * Open settings panel
 */
function openSettings(button, panel) {
    panel.classList.add('settings-panel--active');
    button.classList.add('input-bar__icon-btn--active');
}

/**
 * Close settings panel
 */
function closeSettings(button, panel) {
    panel.classList.remove('settings-panel--active');
    button.classList.remove('input-bar__icon-btn--active');
}

async function handleEnhance(input, button) {
    const prompt = input.value.trim();

    if (!prompt) {
        input.focus();
        shakeElement(input);
        return;
    }

    // Set loading state
    setEnhanceLoading(button, true);
    input.disabled = true;

    try {
        // Pass attached images so AI can see the photo when enhancing the prompt
        const enhanced = await enhancePrompt(prompt, getAttachedImageUrls());

        // Update input with enhanced prompt
        input.value = enhanced;

        // Trigger visual flash to show update
        flashInput(input);

        // Focus input
        input.focus();
    } catch (error) {
        console.error('Enhancement failed:', error);
        if (showApiKeyPopupForCode(error?.code, error?.help)) {
            return;
        }
        showError(error.message || 'Failed to enhance prompt. Please try again.');
    } finally {
        setEnhanceLoading(button, false);
        input.disabled = false;
    }
}

/**
 * Initialize the custom enhance modal flow.
 * @param {HTMLTextAreaElement} input - Prompt input element
 * @param {HTMLButtonElement} button - Custom enhance button element
 */
function setupCustomEnhanceModal(input, button) {
    const modal = document.getElementById('custom-enhance-modal');
    const textarea = document.getElementById('custom-enhance-instructions');
    const closeBtn = document.getElementById('custom-enhance-close');
    const cancelBtn = document.getElementById('custom-enhance-cancel');
    const submitBtn = document.getElementById('custom-enhance-submit');
    const backdrop = modal?.querySelector('[data-custom-enhance-close]');

    if (!modal || !textarea || !closeBtn || !cancelBtn || !submitBtn || !backdrop) {
        return;
    }

    const open = () => {
        if (!input.value.trim()) {
            input.focus();
            shakeElement(input);
            return;
        }

        modal.classList.add('custom-enhance-modal--active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('is-modal-open');
        textarea.focus();
    };

    const close = () => {
        modal.classList.remove('custom-enhance-modal--active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('is-modal-open');
        textarea.value = '';
        input.focus();
    };

    const submit = async () => {
        const prompt = input.value.trim();
        const instructions = textarea.value.trim();

        if (!prompt) {
            close();
            shakeElement(input);
            return;
        }

        if (!instructions) {
            textarea.focus();
            shakeElement(textarea);
            return;
        }

        setEnhanceLoading(button, true);
        input.disabled = true;
        textarea.disabled = true;
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        submitBtn.textContent = 'Enhancing...';

        try {
            const enhanced = await enhancePrompt(prompt, getAttachedImageUrls(), instructions);
            input.value = enhanced;
            flashInput(input);
            close();
        } catch (error) {
            console.error('Custom enhancement failed:', error);
            showError(error.message || 'Failed to enhance prompt. Please try again.');
        } finally {
            setEnhanceLoading(button, false);
            input.disabled = false;
            textarea.disabled = false;
            submitBtn.disabled = false;
            cancelBtn.disabled = false;
            submitBtn.textContent = 'Enhance';
            if (!modal.classList.contains('custom-enhance-modal--active')) {
                input.focus();
            }
        }
    };

    button.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    submitBtn.addEventListener('click', submit);

    textarea.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('custom-enhance-modal--active')) {
            event.preventDefault();
            close();
        }
    });
}

/** @type {number} - Cancellation token for surprise-me typing animation */
let _surpriseTypingToken = 0;

/**
 * Handle "Surprise Me" button - fill input with AI-generated random creative prompt
 * @param {HTMLTextAreaElement} input - Prompt input element
 */
async function handleSurpriseMe(input) {
    const surpriseBtn = document.getElementById('surprise-btn');

    // Cancel any in-progress typing animation from a previous click
    _surpriseTypingToken++;
    const myToken = _surpriseTypingToken;

    // Set loading state
    if (surpriseBtn) {
        setSurpriseLoading(surpriseBtn, true);
    }
    input.disabled = true;

    try {
        // Get AI-generated random prompt
        const randomPrompt = await getRandomPromptFromAI();

        // If another Surprise Me was triggered while we were fetching, bail out
        if (myToken !== _surpriseTypingToken) return;

        // Clear existing text
        input.value = '';

        // Typing animation effect
        let index = 0;
        const typingSpeed = 15; // ms per character

        const typeNextChar = () => {
            // Stop if a newer animation has started
            if (myToken !== _surpriseTypingToken) return;

            if (index < randomPrompt.length) {
                input.value += randomPrompt[index];
                index++;
                autoResizeTextarea(input);
                setTimeout(typeNextChar, typingSpeed);
            } else {
                // Done typing - re-enable button, flash and focus
                if (surpriseBtn) {
                    setSurpriseLoading(surpriseBtn, false);
                }
                input.disabled = false;
                flashInput(input);
                input.focus();
            }
        };

        typeNextChar();
    } catch (error) {
        console.error('Failed to get random prompt:', error);
        if (showApiKeyPopupForCode(error?.code, error?.help)) {
            // popup shown
        } else {
            showError(error.message || 'Failed to generate random prompt. Please try again.');
        }
        // Only re-enable on error; on success the typing callback handles it
        if (surpriseBtn) {
            setSurpriseLoading(surpriseBtn, false);
        }
        input.disabled = false;
    }
}

/**
 * Set loading state for surprise button
 * @param {HTMLButtonElement} button
 * @param {boolean} isLoading
 */
function setSurpriseLoading(button, isLoading) {
    button.disabled = isLoading;

    const diceIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/></svg>`;
    const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    if (isLoading) {
        button.classList.add('input-bar__icon-btn--loading');
        button.innerHTML = loadingIcon;
    } else {
        button.classList.remove('input-bar__icon-btn--loading');
        button.innerHTML = diceIcon;
    }
}

/**
 * Handle remix-image event from lightbox
 * @param {CustomEvent} event - Custom event with image data
 */
function handleRemixImage(event) {
    const image = event.detail;
    if (!image) return;

    const promptInput = document.getElementById('prompt-input');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');

    // 1. Set the prompt input value
    if (promptInput) {
        promptInput.value = image.prompt || '';
        autoResizeTextarea(promptInput);
    }

    // 2. Restore settings if available
    if (image.settings) {
        restoreSettings(image.settings);
    }

    // 3. Open the settings panel
    if (settingsBtn && settingsPanel) {
        openSettings(settingsBtn, settingsPanel);
    }

    // 4. Close the lightbox
    closeLightbox();

    // 5. Flash input to indicate readiness
    if (promptInput) {
        flashInput(promptInput);
        promptInput.focus();
    }
}

/**
 * Handle animate-image event from lightbox.
 * Attaches the image, switches to seedance image-to-video model, and closes lightbox.
 * @param {CustomEvent} event - Custom event with image data
 */
async function handleAnimateImage(event) {
    const image = event.detail;
    if (!image) return;

    const promptInput = document.getElementById('prompt-input');

    // 1. Close the lightbox first
    closeLightbox();

    // 2. Set prompt from image
    if (promptInput) {
        promptInput.value = image.prompt || '';
        autoResizeTextarea(promptInput);
    }

    // 3. Switch model to seedance image-to-video and set qty to 1
    const modelSelect = document.getElementById('setting-model');
    if (modelSelect) {
        modelSelect.value = ANIMATE_MODEL_ID;
        syncModelDropdownUI();
        updateSettingsForModel(ANIMATE_MODEL_ID);
    }
    const numImagesSelect = document.getElementById('setting-num-images');
    if (numImagesSelect) {
        numImagesSelect.value = '1';
        syncNumImagesDropdownUI();
    }

    // 4. Attach the image
    try {
        const fullUrl = await state.getFullImageUrl(image.id);
        const imageUrl = fullUrl || image.url;
        if (imageUrl) {
            // Clear existing attachments and add this image
            setPromptAttachments([]);
            const resp = await fetch(imageUrl);
            const blob = await resp.blob();
            const dataUrl = await compressImageForUpload(blob);
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
                setPromptAttachments([dataUrl]);
            }
        }
    } catch (err) {
        console.error('Failed to attach image for animation:', err);
    }

    // 5. Flash input to indicate readiness
    if (promptInput) {
        flashInput(promptInput);
        promptInput.focus();
    }
}


/**
 * Set loading state for enhance button
 * @param {HTMLButtonElement} button
 * @param {boolean} isLoading
 */
function setEnhanceLoading(button, isLoading) {
    button.disabled = isLoading;

    if (!button.dataset.defaultIcon) {
        button.dataset.defaultIcon = button.innerHTML;
    }

    const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    if (isLoading) {
        button.classList.add('input-bar__icon-btn--loading');
        button.innerHTML = loadingIcon;
    } else {
        button.classList.remove('input-bar__icon-btn--loading');
        button.innerHTML = button.dataset.defaultIcon;
    }
}

/**
 * Flash input to indicate update
 * @param {HTMLTextAreaElement} input
 */
function flashInput(input) {
    input.classList.remove('input-bar__input--flash');
    input.offsetHeight; // Trigger reflow
    input.classList.add('input-bar__input--flash');

    // Auto-resize after content update
    autoResizeTextarea(input);

    setTimeout(() => {
        input.classList.remove('input-bar__input--flash');
    }, 600);
}

/**
 * Set loading state for input and button
 * @param {HTMLTextAreaElement} input
 * @param {HTMLButtonElement} button
 * @param {boolean} isLoading
 */
function setLoading(input, button, isLoading) {
    // Keep textarea enabled during generation
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

/**
 * Auto-resize textarea based on content
 * @param {HTMLTextAreaElement} textarea
 */
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 150);
    textarea.style.height = newHeight + 'px';
}

/**
 * Shake element to indicate error
 * @param {HTMLElement} element
 */
function shakeElement(element) {
    element.style.animation = 'none';
    element.offsetHeight; // Trigger reflow
    element.style.animation = 'shake 0.5s ease';

    setTimeout(() => {
        element.style.animation = '';
    }, 500);
}

/**
 * Show error message
 * @param {string} message
 */
function showError(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast--error';
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: #ef4444;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    animation: fadeInUp 0.3s ease;
  `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Show success message
 * @param {string} message
 */
function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast--success';
    toast.textContent = message;
    toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: #22c55e;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    animation: fadeInUp 0.3s ease;
  `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// Add shake animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
