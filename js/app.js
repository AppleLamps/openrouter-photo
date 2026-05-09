/**
 * Main application entry point
 */

import { generateImage, enhancePrompt, testOpenRouterKey, testXaiKey, testFalKey, getRandomPromptFromAI, pollVideoStatus } from './api.js';
import {
    PROMPT_ATTACHMENTS_MAX,
    PROMPT_ATTACHMENT_MAX_BYTES,
    PROMPT_ATTACHMENT_MAX_DIMENSION,
    PROMPT_ATTACHMENT_JPEG_QUALITY
} from './config.js';
import { state } from './state.js';
import { generateId } from './utils.js';
import { initGallery, showPlaceholder, removePlaceholder, removeAllPlaceholders, showErrorCard, initLightbox, closeLightbox, downloadAllImages } from './gallery.js';
import { formatBytes } from './image-utils.js';
import { initSidebar, showCreateFolderModal } from './sidebar.js';
import {
    MODELS,
    CAPABILITY_TABS,
    TYPE_PILL_LABEL,
    TIER_LABEL,
    DEFAULT_MODEL_ID,
    findModelById,
    getTriggerLabel,
    normalizeModelId,
} from './models.js';

const SPEND_STORAGE_KEY = 'openrouter_spend_v1';
const PIXVERSE_C1_IMAGE_TO_VIDEO_MODEL = 'fal-ai/pixverse/c1/image-to-video';
const SEEDANCE_20_TEXT_TO_VIDEO_MODEL = 'bytedance/seedance-2.0/text-to-video';
const SEEDANCE_20_IMAGE_TO_VIDEO_MODEL = 'bytedance/seedance-2.0/image-to-video';
const VIDEO_QUALITY_PRESETS = {
    default: {
        options: ['480p', '720p', '1080p'],
        defaultValue: '720p',
    },
    seedance20: {
        options: ['480p', '720p'],
        defaultValue: '720p',
    },
    highRes: {
        options: ['720p', '1080p'],
        defaultValue: '1080p',
    },
    pixverse: {
        options: ['360p', '540p', '720p', '1080p'],
        defaultValue: '720p',
    },
};
const IMAGE_RESOLUTION_PRESETS = {
    gemini: {
        options: ['1K', '2K', '4K'],
        defaultValue: '1K',
    },
    xai: {
        options: ['1K', '2K'],
        defaultValue: '1K',
    },
};

/** @type {string[]} */
let promptImageDataUrls = [];

/** @type {boolean} - Prevents race condition from rapid button clicks */
let isGenerating = false;

/** @type {AbortController|null} - For canceling generation */
let generationAbortController = null;

/** @type {Map<string, {prompt: string, settings: Object}>} - Track placeholder metadata for retry */
let placeholderMetadata = new Map();

/** @type {string|null} - Single image data URI for image-to-image models */
let inputImageDataUri = null;

/** @type {string[]} - Multiple image data URIs for multi-image models */
let multiImageDataUris = [];
let storageIndicatorQueued = false;
let storageIndicatorInFlight = false;
let storageIndicatorNeedsRerun = false;

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

function getAttachedImageUrls(limit = PROMPT_ATTACHMENTS_MAX) {
    const images = [
        ...promptImageDataUrls,
        ...(inputImageDataUri ? [inputImageDataUri] : []),
        ...multiImageDataUris,
    ].filter((url) => typeof url === 'string' && url.startsWith('data:image/'));

    return Array.from(new Set(images)).slice(0, limit);
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

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

/**
 * Global registry of open dropdowns — document-level pointer/key handlers
 * close them all, instead of attaching N×2 listeners per dropdown.
 * @type {Set<{ element: HTMLElement, close: () => void, portaledMenu?: HTMLElement }>}
 */
const _openDropdowns = new Set();

// Close open dropdowns on outside interaction. Use pointerdown + capture so we run
// before nested targets inside a portaled menu receive the event (bubble order would
// otherwise close the picker before row clicks fire when #model-menu is under <body>).
document.addEventListener('pointerdown', (e) => {
    for (const entry of _openDropdowns) {
        if (!entry.element.classList.contains('is-open')) continue;
        const target = e.target;
        if (!(target instanceof Node)) continue;
        if (entry.element.contains(target)) continue;
        // Model picker moves #model-menu to <body> on narrow viewports; treat it as part of the dropdown.
        if (entry.portaledMenu?.contains(target)) continue;
        entry.close();
    }
}, true);

// Single document-level handler: close any open dropdown on Escape
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const entry of _openDropdowns) {
        if (!entry.element.classList.contains('is-open')) continue;
        entry.close();
    }
});

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

    // Register with global dropdown handler instead of per-dropdown document listeners
    _openDropdowns.add({ element: dropdown, close });

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
    modelDropdown = createModelPicker();
}

/**
 * Build the searchable, tab-filtered, provider-grouped model picker.
 * Returns the same { syncUI, setValue, close } shape as createDropdown so the
 * rest of the app (which calls modelDropdown.syncUI() / .setValue()) keeps working.
 */
function createModelPicker() {
    const dropdown = document.getElementById('model-dropdown');
    const trigger = document.getElementById('model-trigger');
    const menu = document.getElementById('model-menu');
    const hidden = document.getElementById('setting-model');
    const search = /** @type {HTMLInputElement|null} */ (document.getElementById('model-picker-search'));
    const closeBtn = document.getElementById('model-picker-close');
    const tabsEl = document.getElementById('model-picker-tabs');
    const listEl = document.getElementById('model-picker-list');

    if (!dropdown || !(hidden instanceof HTMLInputElement) || !(trigger instanceof HTMLButtonElement)
        || !menu || !search || !tabsEl || !listEl) {
        return null;
    }

    let activeTab = 'all';
    let query = '';

    hidden.value = normalizeModelId(hidden.value || DEFAULT_MODEL_ID);

    const syncTriggerLabel = () => {
        trigger.textContent = getTriggerLabel(hidden.value);
        trigger.title = hidden.value || 'Select model';
    };

    // ── Tabs ─────────────────────────────────────────────────────────
    tabsEl.innerHTML = '';
    CAPABILITY_TABS.forEach(tab => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'model-picker__tab';
        btn.dataset.tab = tab.id;
        btn.setAttribute('role', 'tab');
        btn.textContent = tab.label;
        if (tab.id === activeTab) btn.setAttribute('aria-selected', 'true');
        btn.addEventListener('click', () => {
            activeTab = tab.id;
            tabsEl.querySelectorAll('.model-picker__tab').forEach(t => {
                t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
            });
            renderList();
        });
        tabsEl.appendChild(btn);
    });

    // ── Filtering ────────────────────────────────────────────────────
    const matches = (m) => {
        const tabDef = CAPABILITY_TABS.find(t => t.id === activeTab);
        if (tabDef?.types && !tabDef.types.includes(m.type)) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return m.name.toLowerCase().includes(q)
            || m.provider.toLowerCase().includes(q)
            || (m.via || '').toLowerCase().includes(q)
            || m.id.toLowerCase().includes(q);
    };

    const setValue = (value) => {
        if (!value || hidden.value === value) {
            hidden.value = value || hidden.value;
        } else {
            hidden.value = value;
        }
        syncTriggerLabel();
        // Update aria-selected on rows
        listEl.querySelectorAll('.model-picker__row').forEach((row) => {
            row.setAttribute('aria-selected', row.getAttribute('data-value') === hidden.value ? 'true' : 'false');
        });
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // ── Row construction ─────────────────────────────────────────────
    const buildBadge = (cls, text) => {
        const span = document.createElement('span');
        span.className = `model-picker__badge ${cls}`;
        span.textContent = text;
        return span;
    };

    const buildRow = (m) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'model-picker__row';
        row.setAttribute('role', 'option');
        row.setAttribute('data-value', m.id);
        row.setAttribute('aria-selected', hidden.value === m.id ? 'true' : 'false');

        const main = document.createElement('div');
        main.className = 'model-picker__row-main';

        const name = document.createElement('span');
        name.className = 'model-picker__row-name';
        name.textContent = m.name;
        main.appendChild(name);

        const badges = document.createElement('div');
        badges.className = 'model-picker__row-badges';

        const typeText = TYPE_PILL_LABEL[m.type];
        if (typeText) badges.appendChild(buildBadge(`model-picker__badge--type model-picker__badge--type-${m.type}`, typeText));
        if (m.tier) badges.appendChild(buildBadge(`model-picker__badge--tier model-picker__badge--tier-${m.tier}`, TIER_LABEL[m.tier] || m.tier));
        if (m.via) badges.appendChild(buildBadge('model-picker__badge--via', `via ${m.via}`));

        main.appendChild(badges);
        row.appendChild(main);

        // Selection check (visible only when aria-selected="true" via CSS)
        const check = document.createElement('span');
        check.className = 'model-picker__row-check';
        check.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        row.appendChild(check);

        row.addEventListener('click', () => {
            setValue(m.id);
            close();
        });
        return row;
    };

    const renderList = () => {
        listEl.innerHTML = '';
        const filtered = MODELS.filter(matches);

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'model-picker__empty';
            empty.textContent = 'No models match your search.';
            listEl.appendChild(empty);
            return;
        }

        // Group by provider, preserving the order each provider first appears in MODELS.
        const groups = new Map();
        filtered.forEach(m => {
            if (!groups.has(m.provider)) groups.set(m.provider, []);
            groups.get(m.provider).push(m);
        });

        groups.forEach((models, provider) => {
            const group = document.createElement('div');
            group.className = 'model-picker__group';

            const header = document.createElement('div');
            header.className = 'model-picker__group-header';
            header.textContent = provider;
            group.appendChild(header);

            models.forEach(m => group.appendChild(buildRow(m)));
            listEl.appendChild(group);
        });
    };

    // ── Open / close ─────────────────────────────────────────────────
    const close = () => {
        dropdown.classList.remove('is-open');
        document.body.classList.remove('model-picker-open');
        trigger.setAttribute('aria-expanded', 'false');
        // If the menu was portaled to <body> (mobile), move it back
        if (menu.parentElement === document.body) {
            menu.classList.remove('model-picker--open');
            dropdown.appendChild(menu);
        }
    };

    const open = () => {
        dropdown.classList.add('is-open');
        document.body.classList.add('model-picker-open');
        trigger.setAttribute('aria-expanded', 'true');
        // On narrow viewports, .input-bar uses transform, which makes it the
        // containing block for position:fixed children. Portal the menu to <body>
        // so it can fill the viewport as a full-screen bottom sheet (matches sidebar overlay breakpoint).
        if (window.matchMedia('(max-width: 900px)').matches && menu.parentElement !== document.body) {
            document.body.appendChild(menu);
            menu.classList.add('model-picker--open');
        }
        renderList();
        // Focus search after the menu renders so iOS doesn't suppress the keyboard.
        requestAnimationFrame(() => {
            search.value = query;
            search.focus({ preventScroll: true });
        });
        // Scroll the selected row into view
        requestAnimationFrame(() => {
            const sel = listEl.querySelector('[aria-selected="true"]');
            if (sel instanceof HTMLElement) sel.scrollIntoView({ block: 'nearest' });
        });
    };

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.contains('is-open') ? close() : open();
    });

    search.addEventListener('input', () => {
        query = search.value.trim();
        renderList();
    });

    search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // Pick the first matching row.
            const first = listEl.querySelector('.model-picker__row');
            if (first instanceof HTMLElement) first.click();
        } else if (e.key === 'Escape') {
            close();
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
            trigger.focus({ preventScroll: true });
        });
    }

    // Close when clicking the backdrop on mobile
    menu.addEventListener('click', (e) => {
        if (e.target === menu) close();
    });

    _openDropdowns.add({ element: dropdown, close, portaledMenu: menu });

    syncTriggerLabel();
    renderList();

    return {
        syncUI: syncTriggerLabel,
        setValue,
        close,
    };
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
        newFolderOption.addEventListener('click', () => {
            close();
            showCreateFolderModal((folder) => {
                setValue(folder.id, folder.name, true);
            });
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

    // Register with global dropdown handler instead of per-dropdown document listeners
    _openDropdowns.add({ element: dropdown, close });
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

    const totalGenerations = entries.reduce((sum, entry) => sum + entry.generations, 0);
    const totalImages = entries.reduce((sum, entry) => sum + entry.images, 0);
    const roundedImages = Number.isFinite(totalImages) ? Math.round(totalImages) : 0;
    const averagePerImage = roundedImages > 0 ? spend.total / roundedImages : 0;
    const topEntry = entries[0] || null;
    const hasSpend = entries.length > 0;

    const existing = document.getElementById('spend-breakdown-modal');
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'spend-breakdown-modal';
    overlay.className = 'openrouter-key-modal openrouter-key-modal--active spend-breakdown-modal';

    const formatSmallUsd = (amount) => {
        const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
        if (safe > 0 && safe < 0.01) {
            return `$${safe.toFixed(4)}`;
        }
        return formatUsd(safe);
    };
    const totalValue = spend.pending ? `~${formatSmallUsd(spend.total)}` : formatSmallUsd(spend.total);

    const getModelDisplay = (model) => {
        const catalogModel = findModelById(model);
        const name = catalogModel?.name || model.split('/').slice(-2).join(' / ') || model;
        const provider = catalogModel
            ? `${catalogModel.provider}${catalogModel.via ? ` via ${catalogModel.via}` : ''}`
            : model;
        return { name, provider };
    };

    const rowsHtml = entries.length
        ? entries
            .map((e, index) => {
                const imgCount = Number.isFinite(e.images) ? Math.round(e.images) : 0;
                const avgCost = imgCount > 0 ? e.cost / imgCount : 0;
                const modelDisplay = getModelDisplay(e.model);
                return `
                    <tr>
                        <td class="spend-breakdown__rank"><span>${index + 1}</span></td>
                        <td class="spend-breakdown__model">
                            <span class="spend-breakdown__model-name">${escapeHtml(modelDisplay.name)}</span>
                            <span class="spend-breakdown__model-provider">${escapeHtml(modelDisplay.provider)}</span>
                        </td>
                        <td class="spend-breakdown__cost">${formatSmallUsd(e.cost)}</td>
                        <td class="spend-breakdown__cost">${formatSmallUsd(avgCost)}</td>
                        <td class="spend-breakdown__stat">${e.generations}</td>
                        <td class="spend-breakdown__stat">${imgCount}</td>
                    </tr>
                `;
            })
            .join('')
        : '';

    const topModelDisplay = topEntry ? getModelDisplay(topEntry.model) : null;
    const hint = spend.pending
        ? 'Some OpenRouter costs are still pending. Fal and xAI estimates are recorded when the app can calculate them.'
        : 'Spend is stored locally in this browser and updates after each completed generation.';

    overlay.innerHTML = `
        <div class="openrouter-key-modal__backdrop" role="presentation"></div>
        <div class="openrouter-key-modal__card spend-breakdown__card" role="dialog" aria-modal="true" aria-label="Spend breakdown">
            <div class="openrouter-key-modal__header">
                <div>
                    <p class="spend-breakdown__eyebrow">Usage ledger</p>
                    <h2 class="openrouter-key-modal__title">Spend breakdown</h2>
                </div>
                <button type="button" class="openrouter-key-modal__close" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
            <div class="openrouter-key-modal__body">
                <div class="spend-breakdown__summary" aria-label="Spend summary">
                    <div class="spend-breakdown__metric spend-breakdown__metric--primary">
                        <span class="spend-breakdown__metric-label">Total spent</span>
                        <span class="spend-breakdown__metric-value">${totalValue}</span>
                        ${spend.pending ? '<span class="spend-breakdown__pending">Pending costs included</span>' : ''}
                    </div>
                    <div class="spend-breakdown__metric">
                        <span class="spend-breakdown__metric-label">Generations</span>
                        <span class="spend-breakdown__metric-value">${totalGenerations}</span>
                    </div>
                    <div class="spend-breakdown__metric">
                        <span class="spend-breakdown__metric-label">Images</span>
                        <span class="spend-breakdown__metric-value">${roundedImages}</span>
                    </div>
                    <div class="spend-breakdown__metric">
                        <span class="spend-breakdown__metric-label">Avg / image</span>
                        <span class="spend-breakdown__metric-value">${formatSmallUsd(averagePerImage)}</span>
                    </div>
                </div>
                ${topEntry ? `
                    <div class="spend-breakdown__top-model">
                        <span class="spend-breakdown__top-label">Top spend</span>
                        <span class="spend-breakdown__top-name">${escapeHtml(topModelDisplay.name)}</span>
                        <span class="spend-breakdown__top-cost">${formatSmallUsd(topEntry.cost)}</span>
                    </div>
                ` : ''}
                ${hasSpend ? `
                    <div class="spend-breakdown__table-container">
                        <table class="spend-breakdown__table">
                            <thead>
                                <tr>
                                    <th class="spend-breakdown__rank-heading">#</th>
                                    <th>Model</th>
                                    <th>Spend</th>
                                    <th>Avg / image</th>
                                    <th>Runs</th>
                                    <th>Images</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    <div class="spend-breakdown__empty">
                        <div class="spend-breakdown__empty-icon">$</div>
                        <h3>No spend recorded yet</h3>
                        <p>Generate an image and this view will break down cost by model.</p>
                    </div>
                `}
                <p class="openrouter-key-modal__hint">${hint}</p>
                <div class="spend-breakdown__actions">
                    ${hasSpend ? '<button type="button" class="spend-breakdown__reset">Reset spend history</button>' : ''}
                    <button type="button" class="spend-breakdown__done">Done</button>
                </div>
            </div>
        </div>
    `;

    const close = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        document.body.classList.remove('is-modal-open');
    };
    overlay.querySelector('.openrouter-key-modal__close').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__backdrop').addEventListener('click', close);
    overlay.querySelector('.spend-breakdown__done')?.addEventListener('click', close);
    overlay.querySelector('.spend-breakdown__reset')?.addEventListener('click', () => {
        if (!window.confirm('Reset local spend history? This only clears the counter in this browser.')) return;
        saveSpendState({ total: 0, byModel: {}, pending: false });
        updateSpendTrackerUI();
        close();
        openSpendBreakdownModal();
    });

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    };
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(overlay);
    document.body.classList.add('is-modal-open');
    overlay.querySelector('.openrouter-key-modal__close')?.focus();
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
    const xaiVideoLengthInput = document.getElementById('setting-xai-video-length');
    const xaiVideoQualitySelect = document.getElementById('setting-xai-video-quality');
    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');

    const model = normalizeModelId(modelSelect?.value || DEFAULT_MODEL_ID);

    const parsedXaiVideoLength = parseInt(xaiVideoLengthInput?.value || 10, 10);
    const xaiVideoLength = Number.isFinite(parsedXaiVideoLength) ? parsedXaiVideoLength : 10;

    const settings = {
        model,
        num_images: parseInt(numImagesSelect?.value || 2, 10),
        // OpenRouter image generation (used for Gemini via `image_config` in the backend)
        aspect_ratio: aspectRatioSelect?.value || '3:4',
        resolution: resolutionSelect?.value || '1K',
        xai_video_length: xaiVideoLength,
        xai_video_quality: xaiVideoQualitySelect?.value || '720p',
        generate_audio_switch: generateAudioSwitch instanceof HTMLInputElement ? generateAudioSwitch.checked : true,
    };

    return settings;
}

function syncVideoQualityOptions(model) {
    const videoQualitySelect = document.getElementById('setting-xai-video-quality');
    if (!(videoQualitySelect instanceof HTMLSelectElement)) {
        return;
    }

    let preset = VIDEO_QUALITY_PRESETS.default;
    if (
        model === 'grok-imagine-video' ||
        model === SEEDANCE_20_TEXT_TO_VIDEO_MODEL ||
        model === SEEDANCE_20_IMAGE_TO_VIDEO_MODEL
    ) {
        preset = VIDEO_QUALITY_PRESETS.seedance20;
    } else if (model === 'alibaba/happy-horse/reference-to-video') {
        preset = VIDEO_QUALITY_PRESETS.highRes;
    } else if (model === PIXVERSE_C1_IMAGE_TO_VIDEO_MODEL) {
        preset = VIDEO_QUALITY_PRESETS.pixverse;
    }

    const currentValue = videoQualitySelect.value;
    videoQualitySelect.innerHTML = '';
    preset.options.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        videoQualitySelect.appendChild(option);
    });

    videoQualitySelect.value = preset.options.includes(currentValue) ? currentValue : preset.defaultValue;
}

function syncImageResolutionOptions(model) {
    const resolutionSelect = document.getElementById('setting-resolution');
    if (!(resolutionSelect instanceof HTMLSelectElement)) {
        return;
    }

    const preset = (model === 'grok-imagine-image' || model === 'grok-imagine-image-quality')
        ? IMAGE_RESOLUTION_PRESETS.xai
        : IMAGE_RESOLUTION_PRESETS.gemini;

    const currentValue = resolutionSelect.value;
    resolutionSelect.innerHTML = '';
    preset.options.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        resolutionSelect.appendChild(option);
    });
    resolutionSelect.value = preset.options.includes(currentValue) ? currentValue : preset.defaultValue;
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

    // Set up event listeners
    if (generateBtn && promptInput) {
        generateBtn.addEventListener('click', () => handleGenerate(promptInput, generateBtn));

        // Handle Enter key (Shift+Enter for new line, Ctrl/Cmd+Enter also generates)
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                handleGenerate(promptInput, generateBtn);
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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

    const confirmed = confirm(`Are you sure you want to delete all ${imageTotal} photos and videos? This cannot be undone.`);
    if (!confirmed) return;

    await state.clearAll();
    updateStorageIndicator();
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
    const openRouterKeyInput = document.getElementById('setting-openrouter-key');
    const openRouterKeyShow = document.getElementById('setting-openrouter-key-show');
    const openRouterSaveBtn = document.getElementById('setting-openrouter-save');
    const openRouterTestBtn = document.getElementById('setting-openrouter-test');
    const openRouterTestStatus = document.getElementById('setting-openrouter-test-status');
    const xaiKeyInput = document.getElementById('setting-xai-key');
    const xaiKeyShow = document.getElementById('setting-xai-key-show');
    const xaiSaveBtn = document.getElementById('setting-xai-save');
    const xaiTestBtn = document.getElementById('setting-xai-test');
    const xaiSaveStatus = document.getElementById('setting-xai-save-status');
    const falKeyInput = document.getElementById('setting-fal-key');
    const falKeyShow = document.getElementById('setting-fal-key-show');
    const falSaveBtn = document.getElementById('setting-fal-save');
    const falTestBtn = document.getElementById('setting-fal-test');
    const falSaveStatus = document.getElementById('setting-fal-save-status');
    const appAccessTokenInput = document.getElementById('setting-app-access-token');
    const appAccessTokenShow = document.getElementById('setting-app-access-token-show');
    const appAccessTokenSaveBtn = document.getElementById('setting-app-access-token-save');
    const appAccessTokenStatus = document.getElementById('setting-app-access-token-status');

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
            if (openRouterTestStatus) openRouterTestStatus.textContent = 'Unsaved';
        });
    }

    if (openRouterKeyShow && openRouterKeyInput) {
        openRouterKeyShow.addEventListener('change', () => {
            openRouterKeyInput.type = openRouterKeyShow.checked ? 'text' : 'password';
        });
    }

    // Load xAI key into the settings input and persist changes to localStorage
    if (xaiKeyInput) {
        try {
            xaiKeyInput.value = localStorage.getItem('xai_api_key') || '';
        } catch {
            xaiKeyInput.value = '';
        }

        xaiKeyInput.addEventListener('input', () => {
            if (xaiSaveStatus) xaiSaveStatus.textContent = 'Unsaved';
        });
    }

    if (xaiKeyShow && xaiKeyInput) {
        xaiKeyShow.addEventListener('change', () => {
            xaiKeyInput.type = xaiKeyShow.checked ? 'text' : 'password';
        });
    }

    if (xaiSaveBtn && xaiKeyInput) {
        xaiSaveBtn.addEventListener('click', () => {
            try {
                localStorage.setItem('xai_api_key', xaiKeyInput.value.trim());
                if (xaiSaveStatus) xaiSaveStatus.textContent = 'Saved';
                showSuccess('xAI API key saved.');
            } catch {
                showError('Failed to save xAI API key (storage unavailable).');
            }
        });
    }

    if (xaiTestBtn) {
        xaiTestBtn.addEventListener('click', async () => {
            if (xaiTestBtn.disabled) return;

            if (xaiSaveStatus) xaiSaveStatus.textContent = 'Testing...';
            xaiTestBtn.disabled = true;

            try {
                if (xaiKeyInput) {
                    localStorage.setItem('xai_api_key', xaiKeyInput.value.trim());
                }
                await testXaiKey();
                if (xaiSaveStatus) xaiSaveStatus.textContent = 'Key works';
                showSuccess('xAI API key is valid.');
            } catch (error) {
                if (xaiSaveStatus) xaiSaveStatus.textContent = '';
                showError(error?.message || 'xAI API key test failed.');
            } finally {
                xaiTestBtn.disabled = false;
            }
        });
    }

    // Load Fal key into the settings input and persist changes to localStorage
    if (falKeyInput) {
        try {
            falKeyInput.value = localStorage.getItem('fal_api_key') || '';
        } catch {
            falKeyInput.value = '';
        }

        falKeyInput.addEventListener('input', () => {
            if (falSaveStatus) falSaveStatus.textContent = 'Unsaved';
        });
    }

    if (falKeyShow && falKeyInput) {
        falKeyShow.addEventListener('change', () => {
            falKeyInput.type = falKeyShow.checked ? 'text' : 'password';
        });
    }

    if (falSaveBtn && falKeyInput) {
        falSaveBtn.addEventListener('click', () => {
            try {
                localStorage.setItem('fal_api_key', falKeyInput.value.trim());
                if (falSaveStatus) falSaveStatus.textContent = 'Saved';
                showSuccess('Fal API key saved.');
            } catch {
                showError('Failed to save Fal API key (storage unavailable).');
            }
        });
    }

    if (falTestBtn) {
        falTestBtn.addEventListener('click', async () => {
            if (falTestBtn.disabled) return;

            if (falSaveStatus) falSaveStatus.textContent = 'Testing...';
            falTestBtn.disabled = true;

            try {
                if (falKeyInput) {
                    localStorage.setItem('fal_api_key', falKeyInput.value.trim());
                }
                await testFalKey();
                if (falSaveStatus) falSaveStatus.textContent = 'Key works';
                showSuccess('Fal API key is valid.');
            } catch (error) {
                if (falSaveStatus) falSaveStatus.textContent = '';
                showError(error?.message || 'Fal API key test failed.');
            } finally {
                falTestBtn.disabled = false;
            }
        });
    }

    // Optional deployment-level token for access to protected server-side provider keys.
    if (appAccessTokenInput) {
        try {
            appAccessTokenInput.value = localStorage.getItem('app_access_token') || '';
        } catch {
            appAccessTokenInput.value = '';
        }

        appAccessTokenInput.addEventListener('input', () => {
            if (appAccessTokenStatus) appAccessTokenStatus.textContent = 'Unsaved';
        });
    }

    if (appAccessTokenShow && appAccessTokenInput) {
        appAccessTokenShow.addEventListener('change', () => {
            appAccessTokenInput.type = appAccessTokenShow.checked ? 'text' : 'password';
        });
    }

    if (appAccessTokenSaveBtn && appAccessTokenInput) {
        appAccessTokenSaveBtn.addEventListener('click', () => {
            try {
                localStorage.setItem('app_access_token', appAccessTokenInput.value.trim());
                if (appAccessTokenStatus) appAccessTokenStatus.textContent = 'Saved';
                showSuccess('App access token saved.');
            } catch {
                showError('Failed to save app access token (storage unavailable).');
            }
        });
    }

    // Save API key button
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
                if (openRouterKeyInput) {
                    localStorage.setItem('openrouter_api_key', openRouterKeyInput.value.trim());
                }
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
 * Update visible settings based on selected model
 * @param {string} model - The selected model ID
 */
function updateSettingsForModel(model) {
    const resolutionGroup = document.getElementById('resolution-group');
    const aspectRatioGroup = document.getElementById('aspect-ratio-group');
    const xaiVideoLengthGroup = document.getElementById('xai-video-length-group');
    const xaiVideoQualityGroup = document.getElementById('xai-video-quality-group');
    const generateAudioGroup = document.getElementById('generate-audio-group');
    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');
    const falImageToVideoHintGroup = document.getElementById('fal-image-to-video-hint-group');

    const isGemini = typeof model === 'string' && model.startsWith('google/gemini-');
    const isSeedream = typeof model === 'string' && model.includes('seedream');
    const isHappyHorse = model === 'alibaba/happy-horse/reference-to-video';
    const isPixverseC1 = model === PIXVERSE_C1_IMAGE_TO_VIDEO_MODEL;
    const isSeedance20 = model === SEEDANCE_20_TEXT_TO_VIDEO_MODEL || model === SEEDANCE_20_IMAGE_TO_VIDEO_MODEL;
    const isFalModel = typeof model === 'string' && (model.startsWith('fal-ai/') || isHappyHorse || isSeedance20);
    const isXaiImage = model === 'grok-imagine-image' || model === 'grok-imagine-image-quality';
    const isXaiVideo = model === 'grok-imagine-video';
    const isFalVideo =
        model === 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video' ||
        model === 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' ||
        isSeedance20 ||
        isHappyHorse;
    const isFalImageToVideo =
        model === 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video' ||
        model === SEEDANCE_20_IMAGE_TO_VIDEO_MODEL ||
        isPixverseC1 ||
        isHappyHorse;
    const isXai = isXaiImage || isXaiVideo;
    const isVideoModel = isXaiVideo || isFalVideo;

    syncImageResolutionOptions(model);
    syncVideoQualityOptions(model);

    // Show aspect ratio for Gemini, Seedream, Fal, and xAI models
    if (isGemini || isSeedream || isFalModel || isXai) {
        aspectRatioGroup?.classList.remove('settings-group--hidden');
    } else {
        aspectRatioGroup?.classList.add('settings-group--hidden');
    }

    // Resolution/image size is supported for Gemini and xAI image models.
    if (isGemini || isXaiImage) {
        resolutionGroup?.classList.remove('settings-group--hidden');
    } else {
        resolutionGroup?.classList.add('settings-group--hidden');
    }

    if (isVideoModel) {
        xaiVideoLengthGroup?.classList.remove('settings-group--hidden');
        xaiVideoQualityGroup?.classList.remove('settings-group--hidden');
    } else {
        xaiVideoLengthGroup?.classList.add('settings-group--hidden');
        xaiVideoQualityGroup?.classList.add('settings-group--hidden');
    }

    if (isPixverseC1) {
        generateAudioGroup?.classList.remove('settings-group--hidden');
        if (generateAudioSwitch instanceof HTMLInputElement) {
            generateAudioSwitch.checked = true;
        }
    } else {
        generateAudioGroup?.classList.add('settings-group--hidden');
    }

    if (isFalImageToVideo) {
        falImageToVideoHintGroup?.classList.remove('settings-group--hidden');
    } else {
        falImageToVideoHintGroup?.classList.add('settings-group--hidden');
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

    // Capture folder selection NOW so the image lands where the user intended,
    // even if they switch folders while it's still generating.
    const selectedFolderInputAtStart = document.getElementById('selected-folder');
    const generationFolderId = selectedFolderInputAtStart?.value || null;

    const attachedImageUrls = getAttachedImageUrls();
    const requestSettings = {
        ...settings,
        ...(attachedImageUrls.length > 0
            ? { image_urls: attachedImageUrls }
            : {}),
    };

    // Show placeholder cards for each image with unique IDs
    const placeholderIds = [];
    for (let i = 0; i < numImages; i++) {
        const placeholderId = generateId();
        placeholderIds.push(placeholderId);
        showPlaceholder(placeholderId, generationFolderId);
        placeholderMetadata.set(placeholderId, { prompt, settings: requestSettings, folderId: generationFolderId });
    }

    try {
        // Cache the abort signal so we can safely check it even if
        // generationAbortController is set to null by cancel/finally.
        const abortSignal = generationAbortController.signal;

        let response = await generateImage(prompt, requestSettings, abortSignal);

        // Check if generation was cancelled
        if (abortSignal.aborted) {
            // Remove all placeholders on cancel
            placeholderIds.forEach(id => removePlaceholder(id));
            placeholderIds.forEach(id => placeholderMetadata.delete(id));
            return;
        }

        // Handle video generation 202 (pending) — poll client-side
        if (response.status === 'pending' && response.request_id) {
            const VIDEO_POLL_INITIAL = 3000;
            const VIDEO_POLL_MULTIPLIER = 1.5;
            const VIDEO_POLL_MAX_INTERVAL = 15000;
            const VIDEO_POLL_MAX_ELAPSED = 360000; // 6 min max
            let pollCount = 0;
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
                pollCount++;

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
                    placeholderIds.forEach(id => {
                        const metadata = placeholderMetadata.get(id);
                        if (metadata) {
                            showErrorCard(id, 'Video generation failed. Please try again.', metadata.prompt,
                                () => retryGeneration(metadata.prompt, metadata.settings));
                            placeholderMetadata.delete(id);
                        }
                    });
                    return;
                }
                // status === 'pending' → continue polling
            }

            // If we exhausted all polls without completion
            if (elapsed >= VIDEO_POLL_MAX_ELAPSED && !(response.images && response.images.length > 0)) {
                placeholderIds.forEach(id => {
                    const metadata = placeholderMetadata.get(id);
                    if (metadata) {
                        showErrorCard(id, 'Video generation timed out. Please try again.', metadata.prompt,
                            () => retryGeneration(metadata.prompt, metadata.settings));
                        placeholderMetadata.delete(id);
                    }
                });
                return;
            }
        }

        if (response.images && response.images.length > 0) {
            recordSpend(response.meta, response.images.length);
            // Create storable settings (exclude large data URIs to prevent localStorage overflow)
            const storableSettings = { ...settings };
            delete storableSettings.image_url;
            delete storableSettings.image_urls;

            // Use the folderId captured when the user pressed Generate, NOT the
            // current selector value — they may have switched folders since.
            const folderId = generationFolderId;

            // Add each generated image to state with settings for remix
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
                    generation: {
                        model: image.model || null,
                        cost: image.cost || 0,
                        provider: image.provider || null
                    }
                });

                // Remove corresponding placeholder only after storage has accepted the item.
                if (placeholderIds[index]) {
                    removePlaceholder(placeholderIds[index]);
                    placeholderMetadata.delete(placeholderIds[index]);
                }

                return result;
            }));

            if (saveResults.some((result) => result && result.persisted === false)) {
                showError('Generated media is visible now, but could not be saved for reload. Download anything important.');
            }

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
        if (error?.code === 'XAI_API_KEY_REQUIRED') {
            showError(error?.message || 'xAI API key required.');
            return;
        }
        if (error?.code === 'FAL_API_KEY_REQUIRED') {
            showFalApiKeyPopup(error?.help);
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
 * Show a popup explaining how to get a Fal API key, and focus the Settings key input.
 * @param {{ message?: string, url?: string } | undefined} help
 */
function showFalApiKeyPopup(help) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');

    if (settingsBtn && settingsPanel) {
        openSettings(settingsBtn, settingsPanel);
    }

    const keyInput = document.getElementById('setting-fal-key');
    if (keyInput) {
        keyInput.focus();
        keyInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const url = help?.url || 'https://fal.ai/dashboard/keys';
    const message =
        help?.message ||
        'You need a Fal API key to use Fal Seedream models. Create one at fal.ai/dashboard/keys, then paste it into Settings.';

    const existing = document.getElementById('fal-key-modal');
    if (existing) {
        existing.querySelector('.openrouter-key-modal__message').textContent = message;
        existing.querySelector('.openrouter-key-modal__link').href = url;
        existing.classList.add('openrouter-key-modal--active');
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'fal-key-modal';
    overlay.className = 'openrouter-key-modal openrouter-key-modal--active';
    overlay.innerHTML = `
        <div class="openrouter-key-modal__backdrop" role="presentation"></div>
        <div class="openrouter-key-modal__card" role="dialog" aria-modal="true" aria-label="Fal API key required">
            <div class="openrouter-key-modal__header">
                <div class="openrouter-key-modal__title">Fal API key required</div>
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
        if (error?.code === 'OPENROUTER_API_KEY_REQUIRED') {
            showOpenRouterApiKeyPopup(error?.help);
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
        modelSelect.value = SEEDANCE_20_IMAGE_TO_VIDEO_MODEL;
        syncModelDropdownUI();
        updateSettingsForModel(SEEDANCE_20_IMAGE_TO_VIDEO_MODEL);
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
            promptImageDataUrls = [];
            // Fetch the image and convert to data URL
            const resp = await fetch(imageUrl);
            const blob = await resp.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
                promptImageDataUrls.push(dataUrl);
                renderPromptAttachments();
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
 * Restore settings from saved image data
 * @param {Object} settings - Saved generation settings
 */
function restoreSettings(settings) {
    // Model selection (must be first to trigger UI updates)
    const modelSelect = document.getElementById('setting-model');
    if (modelSelect && settings.model) {
        modelSelect.value = normalizeModelId(settings.model);
        syncModelDropdownUI();
        updateSettingsForModel(modelSelect.value);
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

    const xaiVideoLengthInput = document.getElementById('setting-xai-video-length');
    if (xaiVideoLengthInput && Number.isFinite(settings.xai_video_length)) {
        xaiVideoLengthInput.value = settings.xai_video_length;
    }

    const xaiVideoQualitySelect = document.getElementById('setting-xai-video-quality');
    if (xaiVideoQualitySelect && settings.xai_video_quality) {
        xaiVideoQualitySelect.value = settings.xai_video_quality;
    }

    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');
    if (generateAudioSwitch instanceof HTMLInputElement && typeof settings.generate_audio_switch === 'boolean') {
        generateAudioSwitch.checked = settings.generate_audio_switch;
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
