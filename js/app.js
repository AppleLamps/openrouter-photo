/**
 * Main application entry point
 */

import { generateImage, enhancePrompt, testOpenRouterKey, getRandomPromptFromAI } from './api.js';
import {
    PROMPT_ATTACHMENTS_MAX,
    PROMPT_ATTACHMENT_MAX_BYTES,
    PROMPT_ATTACHMENT_MAX_DIMENSION,
    PROMPT_ATTACHMENT_JPEG_QUALITY
} from './config.js';
import { state } from './state.js';
import { generateId } from './utils.js';
import { initGallery, showPlaceholder, removePlaceholder, removeAllPlaceholders, showErrorCard, initLightbox, closeLightbox } from './gallery.js';
import { formatBytes } from './image-utils.js';
import { initSidebar } from './sidebar.js';

const SPEND_STORAGE_KEY = 'openrouter_spend_v1';

/** @type {string[]} */
let promptImageDataUrls = [];

/** @type {boolean} - Prevents race condition from rapid button clicks */
let isGenerating = false;

/** @type {AbortController|null} - For canceling generation */
let generationAbortController = null;

/** @type {Map<string, {prompt: string, settings: Object}>} - Track placeholder metadata for retry */
let placeholderMetadata = new Map();

function renderPromptAttachments() {
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

/**
 * Compress an image file for API submission (max 1024px, JPEG 85% quality)
 * This keeps payloads under Vercel's 4.5MB limit
 * @param {File} file - Original image file
 * @returns {Promise<string>} - Compressed data URL
 */
async function compressImageForUpload(file) {
    const MAX_SIZE = PROMPT_ATTACHMENT_MAX_DIMENSION;
    const QUALITY = PROMPT_ATTACHMENT_JPEG_QUALITY;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // Only resize if larger than MAX_SIZE
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

            // Use JPEG for best compression ratio
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
            showError(`Maximum ${PROMPT_ATTACHMENTS_MAX} images can be attached.`);
            break;
        }
        if (file.size > PROMPT_ATTACHMENT_MAX_BYTES) {
            showError(`Image "${file.name}" is too large (max 8MB).`);
            continue;
        }

        try {
            // Compress image to reduce payload size (Vercel limit: 4.5MB)
            const dataUrl = await compressImageForUpload(file);
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                promptImageDataUrls.push(dataUrl);
                renderPromptAttachments();
            }
        } catch (error) {
            console.error('Failed to compress image:', error);
            showError(`Failed to process "${file.name}".`);
        }
    }
}

function clearPromptAttachments() {
    promptImageDataUrls = [];
    const input = document.getElementById('prompt-image-input');
    if (input instanceof HTMLInputElement) input.value = '';
    renderPromptAttachments();
}

function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function loadSpendState() {
    const raw = (() => {
        try {
            return localStorage.getItem(SPEND_STORAGE_KEY);
        } catch {
            return null;
        }
    })();

    const parsed = raw ? safeParseJson(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
        return { total: 0, byModel: {} };
    }

    const total = typeof parsed.total === 'number' && Number.isFinite(parsed.total) ? parsed.total : 0;
    const byModel = parsed.byModel && typeof parsed.byModel === 'object' ? parsed.byModel : {};
    const pending = parsed.pending === true;
    return { total, byModel, pending };
}

function saveSpendState(state) {
    try {
        localStorage.setItem(SPEND_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore storage failures
    }
}

function formatUsd(amount) {
    const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(safe);
}

function updateSpendTrackerUI() {
    const pill = document.getElementById('spend-tracker');
    if (!pill) return;
    const spend = loadSpendState();
    pill.textContent = spend.pending
        ? `Spent: ~${formatUsd(spend.total)}`
        : `Spent: ${formatUsd(spend.total)}`;
    pill.title = spend.pending ? 'Some costs are pending from OpenRouter.' : '';
}

/**
 * Create a reusable dropdown controller
 * @param {Object} config - Dropdown configuration
 * @param {string} config.dropdownId - ID of the dropdown container element
 * @param {string} config.hiddenId - ID of the hidden input element
 * @param {string} config.triggerId - ID of the trigger button element
 * @param {string} config.menuId - ID of the menu element
 * @param {string} [config.defaultValue] - Default value if hidden is empty
 * @param {string} [config.placeholder] - Placeholder text when no value
 * @param {boolean} [config.showTitle] - Whether to set title attribute on trigger
 * @param {boolean} [config.dispatchChange] - Whether to dispatch change event on value set
 * @param {Function} [config.formatDisplay] - Custom function to format display text
 * @returns {{ syncUI: Function, setValue: Function, close: Function } | null}
 */
function createDropdown(config) {
    const {
        dropdownId,
        hiddenId,
        triggerId,
        menuId,
        defaultValue,
        placeholder = 'Select',
        showTitle = false,
        dispatchChange = false,
        formatDisplay = (v) => v || placeholder
    } = config;

    const dropdown = document.getElementById(dropdownId);
    const hidden = document.getElementById(hiddenId);
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);

    if (!dropdown || !(hidden instanceof HTMLInputElement) || !(trigger instanceof HTMLButtonElement) || !menu) {
        return null;
    }

    const syncUI = () => {
        const v = hidden.value || '';
        trigger.textContent = formatDisplay(v);
        if (showTitle) {
            trigger.title = v || placeholder;
        }
        menu.querySelectorAll('.input-bar__dropdown-item').forEach((btn) => {
            const selected = btn.getAttribute('data-value') === v;
            btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
    };

    const close = () => {
        dropdown.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
        dropdown.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    };

    const setValue = (value) => {
        hidden.value = String(value);
        syncUI();
        if (dispatchChange) {
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    // Set default value if needed
    if (defaultValue && !hidden.value) {
        const first = menu.querySelector('.input-bar__dropdown-item[data-value]');
        const firstVal = first?.getAttribute?.('data-value');
        if (firstVal) hidden.value = firstVal;
    }

    // Initial sync
    syncUI();

    // Event listeners
    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.contains('is-open') ? close() : open();
    });

    menu.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const item = target.closest('.input-bar__dropdown-item');
        if (!(item instanceof HTMLButtonElement)) return;
        const value = item.getAttribute('data-value');
        if (!value) return;
        setValue(value);
        close();
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.classList.contains('is-open')) return;
        if (e.target instanceof Node && dropdown.contains(e.target)) return;
        close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!dropdown.classList.contains('is-open')) return;
        close();
    });

    return { syncUI, setValue, close };
}

// Store dropdown controllers for external access
let modelDropdown = null;
let numImagesDropdown = null;

function syncNumImagesDropdownUI() {
    if (numImagesDropdown) {
        numImagesDropdown.syncUI();
    }
}

function syncModelDropdownUI() {
    if (modelDropdown) {
        modelDropdown.syncUI();
    }
}

function initModelDropdown() {
    modelDropdown = createDropdown({
        dropdownId: 'model-dropdown',
        hiddenId: 'setting-model',
        triggerId: 'model-trigger',
        menuId: 'model-menu',
        defaultValue: true,
        placeholder: 'Select model',
        showTitle: true,
        dispatchChange: true
    });
}

function initNumImagesDropdown() {
    numImagesDropdown = createDropdown({
        dropdownId: 'num-images-dropdown',
        hiddenId: 'setting-num-images',
        triggerId: 'num-images-trigger',
        menuId: 'num-images-menu',
        formatDisplay: (v) => v || '2'
    });
}

/**
 * Initialize folder selector dropdown
 */
function initFolderSelectorDropdown() {
    const dropdown = document.getElementById('folder-selector-dropdown');
    const hidden = document.getElementById('selected-folder');
    const trigger = document.getElementById('folder-selector-trigger');
    const menu = document.getElementById('folder-selector-menu');
    const nameSpan = trigger?.querySelector('.folder-selector__name');

    if (!dropdown || !(hidden instanceof HTMLInputElement) || !(trigger instanceof HTMLButtonElement) || !menu) {
        return;
    }

    const close = () => {
        dropdown.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
        dropdown.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
    };

    const setValue = (folderId, folderName, updateSidebar = false) => {
        hidden.value = folderId || '';
        if (nameSpan) {
            nameSpan.textContent = folderName || 'All Photos';
        }
        // Optionally update sidebar selection to keep in sync
        if (updateSidebar && state.selectedFolderId !== folderId) {
            state.setSelectedFolder(folderId || null);
        }
        close();
    };

    const syncWithSidebar = () => {
        // Sync folder selector with sidebar's selected folder
        const selectedFolderId = state.selectedFolderId;
        if (selectedFolderId) {
            const folder = state.getFolder(selectedFolderId);
            if (folder) {
                hidden.value = folder.id;
                if (nameSpan) nameSpan.textContent = folder.name;
            }
        } else {
            hidden.value = '';
            if (nameSpan) nameSpan.textContent = 'All Photos';
        }
    };

    const renderMenu = () => {
        menu.innerHTML = '';

        // "All Photos" option
        const allOption = document.createElement('button');
        allOption.type = 'button';
        allOption.className = 'input-bar__dropdown-item';
        allOption.setAttribute('role', 'option');
        allOption.setAttribute('data-value', '');
        allOption.setAttribute('aria-selected', hidden.value === '' ? 'true' : 'false');
        allOption.textContent = 'All Photos';
        allOption.addEventListener('click', () => setValue('', 'All Photos', true));
        menu.appendChild(allOption);

        // Folder options
        const folders = state.getFolders();
        folders.forEach(folder => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'input-bar__dropdown-item';
            option.setAttribute('role', 'option');
            option.setAttribute('data-value', folder.id);
            option.setAttribute('aria-selected', hidden.value === folder.id ? 'true' : 'false');
            option.textContent = folder.name;
            option.addEventListener('click', () => setValue(folder.id, folder.name, true));
            menu.appendChild(option);
        });

        // "New Folder" option
        const newFolderOption = document.createElement('button');
        newFolderOption.type = 'button';
        newFolderOption.className = 'input-bar__dropdown-item input-bar__dropdown-item--action';
        newFolderOption.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> New Folder`;
        newFolderOption.addEventListener('click', async () => {
            close();
            const name = prompt('Enter folder name:');
            if (name && name.trim()) {
                const folder = await state.addFolder(name.trim());
                setValue(folder.id, folder.name, true);
            }
        });
        menu.appendChild(newFolderOption);
    };

    // Initial render
    renderMenu();

    // Sync with sidebar selection on init
    syncWithSidebar();

    // Re-render menu and sync when folders or selection change
    state.subscribe((action) => {
        if (action === 'folder-add' || action === 'folder-rename' || action === 'folder-delete') {
            renderMenu();
            syncWithSidebar();
        }
        if (action === 'folder-selected') {
            // When sidebar folder selection changes, update the dropdown
            syncWithSidebar();
        }
    });

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropdown.classList.contains('is-open')) {
            close();
        } else {
            renderMenu(); // Refresh options before opening
            open();
        }
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.classList.contains('is-open')) return;
        if (e.target instanceof Node && dropdown.contains(e.target)) return;
        close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!dropdown.classList.contains('is-open')) return;
        close();
    });
}

function recordSpend(meta, imagesReturned) {
    if (!meta || typeof meta !== 'object') return;
    const requests = Array.isArray(meta.requests) ? meta.requests : [];
    if (requests.length === 0) return;

    const spend = loadSpendState();
    const hasPending =
        meta.usage_pending === true ||
        requests.some((req) => req && req.usage_pending === true);

    const images = typeof imagesReturned === 'number' && Number.isFinite(imagesReturned) ? imagesReturned : 0;
    const imagesPerGeneration = requests.length > 0 ? images / requests.length : 0;

    for (const req of requests) {
        const model = typeof req?.model === 'string' ? req.model : 'unknown';
        const usage = typeof req?.usage === 'number' && Number.isFinite(req.usage) ? req.usage : 0;

        if (!spend.byModel[model]) {
            spend.byModel[model] = { cost: 0, generations: 0, images: 0 };
        }

        spend.byModel[model].cost += usage;
        spend.byModel[model].generations += 1;
        spend.byModel[model].images += imagesPerGeneration;
        spend.total += usage;
    }

    if (hasPending) {
        spend.pending = true;
    }

    saveSpendState(spend);
    updateSpendTrackerUI();
}

function openSpendBreakdownModal() {
    const spend = loadSpendState();
    const entries = Object.entries(spend.byModel)
        .map(([model, v]) => ({
            model,
            cost: typeof v?.cost === 'number' ? v.cost : 0,
            generations: typeof v?.generations === 'number' ? v.generations : 0,
            images: typeof v?.images === 'number' ? v.images : 0,
        }))
        .sort((a, b) => b.cost - a.cost);

    const existing = document.getElementById('spend-breakdown-modal');
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'spend-breakdown-modal';
    overlay.className = 'openrouter-key-modal openrouter-key-modal--active';

    const rowsHtml = entries.length
        ? entries
            .map((e) => {
                const imgCount = Number.isFinite(e.images) ? Math.round(e.images) : 0;
                return `
                    <tr>
                        <td class="spend-breakdown__model">${e.model}</td>
                        <td class="spend-breakdown__cost">${formatUsd(e.cost)}</td>
                        <td class="spend-breakdown__stat">${e.generations}</td>
                        <td class="spend-breakdown__stat">${imgCount}</td>
                    </tr>
                `;
            })
            .join('')
        : `<tr><td colspan="4" class="spend-breakdown__empty">No spend recorded yet.</td></tr>`;

    const totalValue = spend.pending ? `~${formatUsd(spend.total)}` : formatUsd(spend.total);
    const hint = spend.pending
        ? 'Costs are recorded from the OpenRouter response field usage (USD) when present. Some costs are still pending.'
        : 'Costs are recorded from the OpenRouter response field usage (USD) when present.';

    overlay.innerHTML = `
        <div class="openrouter-key-modal__backdrop" role="presentation"></div>
        <div class="openrouter-key-modal__card" role="dialog" aria-modal="true" aria-label="Spend breakdown">
            <div class="openrouter-key-modal__header">
                <h2 class="openrouter-key-modal__title">Spend breakdown</h2>
                <button type="button" class="openrouter-key-modal__close" aria-label="Close">✕</button>
            </div>
            <div class="openrouter-key-modal__body">
                <div class="spend-breakdown__total">
                    <span class="spend-breakdown__total-label">Total spent</span>
                    <span class="spend-breakdown__total-value">${totalValue}</span>
                </div>
                <div class="spend-breakdown__table-container">
                    <table class="spend-breakdown__table">
                        <thead>
                            <tr>
                                <th>Model</th>
                                <th>Cost</th>
                                <th>Generations</th>
                                <th>Images</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                <p class="openrouter-key-modal__hint">${hint}</p>
            </div>
        </div>
    `;

    const close = () => overlay.classList.remove('openrouter-key-modal--active');
    overlay.querySelector('.openrouter-key-modal__close').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__backdrop').addEventListener('click', close);

    document.body.appendChild(overlay);
}

/**
 * Get current generation settings from the UI
 * @returns {Object} Generation options
 */
function getGenerationSettings() {
    const modelSelect = document.getElementById('setting-model');
    const numImagesSelect = document.getElementById('setting-num-images');
    const aspectRatioSelect = document.getElementById('setting-aspect-ratio');
    const resolutionSelect = document.getElementById('setting-resolution');

    const model = modelSelect?.value || 'black-forest-labs/flux.2-pro';

    const settings = {
        model,
        num_images: parseInt(numImagesSelect?.value || 2, 10),
        // OpenRouter image generation (used for Gemini via `image_config` in the backend)
        aspect_ratio: aspectRatioSelect?.value || '1:1',
        resolution: resolutionSelect?.value || '1K',
    };

    return settings;
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
    const promptImageBtn = document.getElementById('prompt-image-btn');
    const promptImageInput = document.getElementById('prompt-image-input');
    const generateBtn = document.getElementById('generate-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const enhanceBtn = document.getElementById('enhance-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    const surpriseBtn = document.getElementById('surprise-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');

    // Initialize gallery
    if (galleryContainer && emptyState) {
        initGallery(galleryContainer, emptyState);
    }

    // Initialize lightbox
    initLightbox();

    // Initialize sidebar
    initSidebar();

    // Set up event listeners
    if (generateBtn && promptInput) {
        generateBtn.addEventListener('click', () => handleGenerate(promptInput, generateBtn));

        // Handle Enter key (Shift+Enter for new line)
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate(promptInput, generateBtn);
            }
            // Escape key to cancel generation
            if (e.key === 'Escape' && isGenerating) {
                e.preventDefault();
                handleCancelGeneration();
            }
        });

        // Auto-resize textarea
        promptInput.addEventListener('input', () => autoResizeTextarea(promptInput));

        // Paste-to-attach images (clipboard)
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

    // Set up cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelGeneration);
    }

    // Attach images from file picker
    if (promptImageBtn && promptImageInput) {
        promptImageBtn.addEventListener('click', () => {
            promptImageInput.click();
        });

        promptImageInput.addEventListener('change', async (e) => {
            const files = e.target?.files;
            await addPromptImageFiles(files);
        });
    }

    // Set up enhance button listener
    if (enhanceBtn && promptInput) {
        enhanceBtn.addEventListener('click', () => handleEnhance(promptInput, enhanceBtn));
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

    // Initialize settings UI interactions
    initSettingsUI();
    initModelDropdown();
    initNumImagesDropdown();
    initFolderSelectorDropdown();

    // Spend tracker
    updateSpendTrackerUI();
    const spendTracker = document.getElementById('spend-tracker');
    if (spendTracker) {
        spendTracker.addEventListener('click', () => openSpendBreakdownModal());
    }

    // Listen for remix-image event from lightbox
    window.addEventListener('remix-image', handleRemixImage);

    // Subscribe to state changes to update storage indicator
    state.subscribe(() => updateStorageIndicator());

    // Initial storage indicator update
    updateStorageIndicator();

    console.log('AI Image Generator initialized');
}

/**
 * Update the storage indicator UI
 */
async function updateStorageIndicator() {
    const storageBar = document.getElementById('storage-used');
    const storageText = document.getElementById('storage-text');
    const imageCount = document.getElementById('image-count');

    if (!storageBar && !storageText) return;

    try {
        const estimate = await state.getStorageEstimate();
        const images = state.getImages();

        if (imageCount) {
            imageCount.textContent = `${images.length} image${images.length !== 1 ? 's' : ''}`;
        }

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
            storageText.textContent = `${images.length} image${images.length !== 1 ? 's' : ''} stored`;
        }
    } catch (error) {
        console.error('Failed to update storage indicator:', error);
        if (storageText) {
            const images = state.getImages();
            storageText.textContent = `${images.length} image${images.length !== 1 ? 's' : ''} stored`;
        }
    }
}

/**
 * Handle clear all images button
 */
async function handleClearAll() {
    const images = state.getImages();
    if (images.length === 0) return;

    const confirmed = confirm(`Are you sure you want to delete all ${images.length} images? This cannot be undone.`);
    if (!confirmed) return;

    await state.clearAll();
    updateStorageIndicator();
}

/**
 * Initialize settings UI interactions
 */
function initSettingsUI() {
    const modelSelect = document.getElementById('setting-model');
    const openRouterKeyInput = document.getElementById('setting-openrouter-key');
    const openRouterKeyShow = document.getElementById('setting-openrouter-key-show');
    const openRouterSaveBtn = document.getElementById('setting-openrouter-save');
    const openRouterTestBtn = document.getElementById('setting-openrouter-test');
    const openRouterTestStatus = document.getElementById('setting-openrouter-test-status');

    // Toggle settings based on model selection
    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            updateSettingsForModel(modelSelect.value);
        });
    }

    // Load OpenRouter key into the settings input and persist changes to localStorage
    if (openRouterKeyInput) {
        try {
            openRouterKeyInput.value = localStorage.getItem('openrouter_api_key') || '';
        } catch {
            openRouterKeyInput.value = '';
        }

        openRouterKeyInput.addEventListener('input', () => {
            try {
                localStorage.setItem('openrouter_api_key', openRouterKeyInput.value.trim());
            } catch {
                // ignore storage failures (private mode, disabled storage, etc.)
            }
        });
    }

    if (openRouterKeyShow && openRouterKeyInput) {
        openRouterKeyShow.addEventListener('change', () => {
            openRouterKeyInput.type = openRouterKeyShow.checked ? 'text' : 'password';
        });
    }

    // Save API key button (even though we also auto-save on input, users expect an explicit action)
    if (openRouterSaveBtn && openRouterKeyInput) {
        openRouterSaveBtn.addEventListener('click', () => {
            try {
                localStorage.setItem('openrouter_api_key', openRouterKeyInput.value.trim());
                if (openRouterTestStatus) openRouterTestStatus.textContent = 'Saved';
                showSuccess('API key saved.');
            } catch {
                showError('Failed to save API key (storage unavailable).');
            }
        });
    }

    // Test API key button
    if (openRouterTestBtn) {
        openRouterTestBtn.addEventListener('click', async () => {
            if (openRouterTestBtn.disabled) return;

            if (openRouterTestStatus) openRouterTestStatus.textContent = 'Testing...';
            openRouterTestBtn.disabled = true;

            try {
                await testOpenRouterKey();
                if (openRouterTestStatus) openRouterTestStatus.textContent = 'Key works';
                showSuccess('OpenRouter API key is valid.');
            } catch (error) {
                if (openRouterTestStatus) openRouterTestStatus.textContent = '';
                if (error?.code === 'OPENROUTER_API_KEY_REQUIRED') {
                    showOpenRouterApiKeyPopup(error?.help);
                    return;
                }
                showError(error?.message || 'API key test failed.');
            } finally {
                openRouterTestBtn.disabled = false;
            }
        });
    }

    // Apply initial visibility state for the currently selected model
    if (modelSelect) {
        updateSettingsForModel(modelSelect.value);
    }

    // Photo visibility mode
    const photoVisibilitySelect = document.getElementById('setting-photo-visibility');
    if (photoVisibilitySelect) {
        // Load saved value
        photoVisibilitySelect.value = state.getPhotoVisibilityMode();

        // Save on change
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

    // Initialize global storage for image data URI
    window.__inputImageDataUri = null;

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
function handleImageFile(file, label, preview, previewImg) {
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
    }

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
        showError('Image file is too large (max 10MB)');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUri = e.target?.result;
        if (dataUri) {
            // Store the data URI globally
            window.__inputImageDataUri = dataUri;
            // Show preview
            previewImg.src = dataUri;
            preview.classList.remove('image-upload__preview--hidden');
            label.style.display = 'none';
        }
    };
    reader.onerror = () => {
        showError('Failed to read image file');
    };
    reader.readAsDataURL(file);
}

/**
 * Clear the uploaded image
 * @param {HTMLInputElement} input - The file input
 * @param {HTMLElement} label - The upload label element
 * @param {HTMLElement} preview - The preview container
 * @param {HTMLImageElement} previewImg - The preview image element
 */
function clearImageUpload(input, label, preview, previewImg) {
    window.__inputImageDataUri = null;
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

    // Initialize global storage for multiple image data URIs
    window.__multiImageDataUris = [];

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
function handleMultipleImageFiles(files, previewsContainer) {
    // Limit to 3 images for Wan v2.6
    if (files.length > 3) {
        showError('Maximum 3 images allowed');
        files = files.slice(0, 3);
    }

    // Validate files
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showError('Please select valid image files only');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showError(`Image "${file.name}" is too large (max 10MB)`);
            return;
        }
    }

    // Clear existing previews
    window.__multiImageDataUris = [];
    previewsContainer.innerHTML = '';

    // Process each file
    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUri = e.target?.result;
            if (dataUri) {
                window.__multiImageDataUris.push(dataUri);
                addMultiImagePreview(dataUri, index + 1, previewsContainer);
            }
        };
        reader.onerror = () => {
            showError(`Failed to read image file: ${file.name}`);
        };
        reader.readAsDataURL(file);
    });
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
    window.__multiImageDataUris.splice(index - 1, 1);

    // Clear and rebuild previews
    container.innerHTML = '';
    window.__multiImageDataUris.forEach((dataUri, i) => {
        addMultiImagePreview(dataUri, i + 1, container);
    });

    // Update file input
    const multiImageInput = document.getElementById('setting-multi-images');
    if (multiImageInput && window.__multiImageDataUris.length === 0) {
        multiImageInput.value = '';
    }
}

/**
 * Update visible settings based on selected model
 * @param {string} model - The selected model ID
 */
function updateSettingsForModel(model) {
    const resolutionGroup = document.getElementById('resolution-group');
    const aspectRatioGroup = document.getElementById('aspect-ratio-group');

    const isGemini = typeof model === 'string' && model.startsWith('google/gemini-');
    if (isGemini) {
        aspectRatioGroup?.classList.remove('settings-group--hidden');
        resolutionGroup?.classList.remove('settings-group--hidden');
    } else {
        aspectRatioGroup?.classList.add('settings-group--hidden');
        resolutionGroup?.classList.add('settings-group--hidden');
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

/**
 * Handle image generation
 * @param {HTMLInputElement} input - Prompt input element
 * @param {HTMLButtonElement} button - Generate button element
 */
async function handleGenerate(input, button) {
    // Guard against rapid clicks - check flag BEFORE any async operations
    if (isGenerating || button.disabled) return;
    isGenerating = true;

    const prompt = input.value.trim();

    if (!prompt) {
        isGenerating = false;
        input.focus();
        shakeElement(input);
        return;
    }

    // Get generation settings
    const settings = getGenerationSettings();
    const numImages = settings.num_images;

    // Create abort controller for cancellation
    generationAbortController = new AbortController();

    // Keep textarea enabled but disable generate button and show cancel button
    setLoading(input, button, true);

    // Show placeholder cards for each image with unique IDs
    const placeholderIds = [];
    for (let i = 0; i < numImages; i++) {
        const placeholderId = generateId();
        placeholderIds.push(placeholderId);
        showPlaceholder(placeholderId);
        placeholderMetadata.set(placeholderId, { prompt, settings });
    }

    try {
        const requestSettings = {
            ...settings,
            ...(promptImageDataUrls.length > 0
                ? { image_urls: promptImageDataUrls.slice(0, PROMPT_ATTACHMENTS_MAX) }
                : {}),
        };

        const response = await generateImage(prompt, requestSettings, generationAbortController.signal);

        // Check if generation was cancelled
        if (generationAbortController.signal.aborted) {
            // Remove all placeholders on cancel
            placeholderIds.forEach(id => removePlaceholder(id));
            placeholderIds.forEach(id => placeholderMetadata.delete(id));
            return;
        }

        if (response.images && response.images.length > 0) {
            recordSpend(response.meta, response.images.length);
            // Create storable settings (exclude large data URIs to prevent localStorage overflow)
            const storableSettings = { ...settings };
            delete storableSettings.image_url;
            delete storableSettings.image_urls;

            // Get selected folder from folder selector (if available)
            const selectedFolderInput = document.getElementById('selected-folder');
            const folderId = selectedFolderInput?.value || null;

            // Add each generated image to state with settings for remix
            response.images.forEach((image, index) => {
                // Remove corresponding placeholder
                if (placeholderIds[index]) {
                    removePlaceholder(placeholderIds[index]);
                    placeholderMetadata.delete(placeholderIds[index]);
                }

                state.addImage({
                    id: generateId(),
                    url: image.url,
                    prompt: prompt,
                    createdAt: Date.now(),
                    settings: storableSettings,
                    folderId: folderId,
                    generation: {
                        model: image.model || null,
                        cost: image.cost || 0,
                        provider: image.provider || null
                    }
                });
            });

            // Remove any remaining placeholders (if fewer images returned than requested)
            placeholderIds.slice(response.images.length).forEach(id => {
                removePlaceholder(id);
                placeholderMetadata.delete(id);
            });

            // Clear input and reset height
            input.value = '';
            autoResizeTextarea(input);

            // Clear prompt attachments after a successful generation
            clearPromptAttachments();

        } else {
            // No images returned - show error cards for all placeholders
            placeholderIds.forEach(id => {
                const metadata = placeholderMetadata.get(id);
                if (metadata) {
                    showErrorCard(
                        id,
                        'No images were generated. Please try again.',
                        metadata.prompt,
                        () => retryGeneration(metadata.prompt, metadata.settings)
                    );
                    placeholderMetadata.delete(id);
                }
            });
        }
    } catch (error) {
        console.error('Generation failed:', error);

        // Check if it was a cancellation
        if (error.name === 'AbortError') {
            placeholderIds.forEach(id => {
                removePlaceholder(id);
                placeholderMetadata.delete(id);
            });
            return;
        }

        // Show error cards for all placeholders instead of removing them
        placeholderIds.forEach(id => {
            const metadata = placeholderMetadata.get(id);
            if (metadata) {
                showErrorCard(
                    id,
                    error.message || 'Failed to generate image. Please try again.',
                    metadata.prompt,
                    () => retryGeneration(metadata.prompt, metadata.settings)
                );
                placeholderMetadata.delete(id);
            }
        });

        if (error?.code === 'OPENROUTER_API_KEY_REQUIRED') {
            showOpenRouterApiKeyPopup(error?.help);
            return;
        }
        showError(error.message || 'Failed to generate image. Please try again.');
    } finally {
        isGenerating = false;
        generationAbortController = null;
        setLoading(input, button, false);
    }
}

/**
 * Retry generation with saved prompt and settings
 * @param {string} prompt - Original prompt
 * @param {Object} settings - Original settings
 */
async function retryGeneration(prompt, settings) {
    const input = document.getElementById('prompt-input');
    const button = document.getElementById('generate-btn');

    if (input && button) {
        input.value = prompt;
        autoResizeTextarea(input);
        await handleGenerate(input, button);
    }
}

/**
 * Cancel ongoing generation
 */
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

/**
 * Handle prompt enhancement
 * @param {HTMLInputElement} input - Prompt input element
 * @param {HTMLButtonElement} button - Enhance button element
 */
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
        const enhanced = await enhancePrompt(prompt);

        // Update input with enhanced prompt
        input.value = enhanced;

        // Trigger visual flash to show update
        flashInput(input);

        // Focus input
        input.focus();
    } catch (error) {
        console.error('Enhancement failed:', error);
        if (error?.code === 'OPENROUTER_API_KEY_REQUIRED') {
            showOpenRouterApiKeyPopup(error?.help);
            return;
        }
        showError(error.message || 'Failed to enhance prompt. Please try again.');
    } finally {
        setEnhanceLoading(button, false);
        input.disabled = false;
    }
}

/**
 * Show a popup explaining how to get an OpenRouter API key, and focus the Settings key input.
 * @param {{ message?: string, url?: string } | undefined} help
 */
function showOpenRouterApiKeyPopup(help) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');

    if (settingsBtn && settingsPanel) {
        openSettings(settingsBtn, settingsPanel);
    }

    const keyInput = document.getElementById('setting-openrouter-key');
    if (keyInput) {
        keyInput.focus();
        keyInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const url = help?.url || 'https://openrouter.ai/keys';
    const message =
        help?.message ||
        'You need an OpenRouter API key to use this app. Create one at openrouter.ai/keys, then paste it into Settings.';

    // Create a lightweight modal overlay (only one instance).
    const existing = document.getElementById('openrouter-key-modal');
    if (existing) {
        existing.querySelector('.openrouter-key-modal__message').textContent = message;
        existing.querySelector('.openrouter-key-modal__link').href = url;
        existing.classList.add('openrouter-key-modal--active');
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'openrouter-key-modal';
    overlay.className = 'openrouter-key-modal openrouter-key-modal--active';
    overlay.innerHTML = `
        <div class="openrouter-key-modal__backdrop" role="presentation"></div>
        <div class="openrouter-key-modal__card" role="dialog" aria-modal="true" aria-label="OpenRouter API key required">
            <div class="openrouter-key-modal__header">
                <div class="openrouter-key-modal__title">OpenRouter API key required</div>
                <button type="button" class="openrouter-key-modal__close" aria-label="Close">✕</button>
            </div>
            <div class="openrouter-key-modal__body">
                <p class="openrouter-key-modal__message"></p>
                <div class="openrouter-key-modal__actions">
                    <a class="openrouter-key-modal__link" target="_blank" rel="noopener noreferrer">Get API key</a>
                    <button type="button" class="openrouter-key-modal__ok">I pasted it</button>
                </div>
                <p class="openrouter-key-modal__hint">Your key is stored locally in your browser and sent with each request.</p>
            </div>
        </div>
    `;

    overlay.querySelector('.openrouter-key-modal__message').textContent = message;
    overlay.querySelector('.openrouter-key-modal__link').href = url;

    const close = () => overlay.classList.remove('openrouter-key-modal--active');
    overlay.querySelector('.openrouter-key-modal__close').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__backdrop').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__ok').addEventListener('click', close);

    document.body.appendChild(overlay);
}

/**
 * Handle "Surprise Me" button - fill input with AI-generated random creative prompt
 * @param {HTMLTextAreaElement} input - Prompt input element
 */
async function handleSurpriseMe(input) {
    const surpriseBtn = document.getElementById('surprise-btn');

    // Set loading state
    if (surpriseBtn) {
        setSurpriseLoading(surpriseBtn, true);
    }
    input.disabled = true;

    try {
        // Get AI-generated random prompt
        const randomPrompt = await getRandomPromptFromAI();

        // Clear existing text
        input.value = '';

        // Typing animation effect
        let index = 0;
        const typingSpeed = 15; // ms per character

        const typeNextChar = () => {
            if (index < randomPrompt.length) {
                input.value += randomPrompt[index];
                index++;
                autoResizeTextarea(input);
                setTimeout(typeNextChar, typingSpeed);
            } else {
                // Done typing - flash and focus
                flashInput(input);
                input.focus();
            }
        };

        typeNextChar();
    } catch (error) {
        console.error('Failed to get random prompt:', error);
        if (error?.code === 'OPENROUTER_API_KEY_REQUIRED') {
            showOpenRouterApiKeyPopup(error?.help);
        } else {
            showError(error.message || 'Failed to generate random prompt. Please try again.');
        }
    } finally {
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
 * Restore settings from saved image data
 * @param {Object} settings - Saved generation settings
 */
function restoreSettings(settings) {
    // Model selection (must be first to trigger UI updates)
    const modelSelect = document.getElementById('setting-model');
    if (modelSelect && settings.model) {
        modelSelect.value = settings.model;
        syncModelDropdownUI();
        updateSettingsForModel(settings.model);
    }

    // Aspect ratio (OpenRouter / Gemini image_config)
    const aspectRatioSelect = document.getElementById('setting-aspect-ratio');
    if (aspectRatioSelect && settings.aspect_ratio) {
        aspectRatioSelect.value = settings.aspect_ratio;
    }

    // Gemini image size (1K/2K/4K)
    const resolutionSelect = document.getElementById('setting-resolution');
    if (resolutionSelect && settings.resolution) {
        resolutionSelect.value = settings.resolution;
    }

    // Number of images
    const numImagesSelect = document.getElementById('setting-num-images');
    if (numImagesSelect && settings.num_images !== undefined) {
        numImagesSelect.value = settings.num_images;
        syncNumImagesDropdownUI();
    }
}

/**
 * Set loading state for enhance button
 * @param {HTMLButtonElement} button
 * @param {boolean} isLoading
 */
function setEnhanceLoading(button, isLoading) {
    button.disabled = isLoading;

    const enhanceIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
    const loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    if (isLoading) {
        button.classList.add('input-bar__icon-btn--loading');
        button.innerHTML = loadingIcon;
    } else {
        button.classList.remove('input-bar__icon-btn--loading');
        button.innerHTML = enhanceIcon;
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
