/**
 * Model picker, num-images dropdown, folder selector, and settings panel sync
 */

import { state } from './state.js';
import { showCreateFolderModal } from './sidebar.js';
import {
    PICKER_MODELS,
    CAPABILITY_TABS,
    TYPE_PILL_LABEL,
    TIER_LABEL,
    DEFAULT_MODEL_ID,
    getTriggerLabel,
    normalizeModelId,
    getUiCapabilities,
    getInputConstraints,
    getOutputConstraints,
} from './models.js';

/**
 * Global registry of open dropdowns — document-level pointer/key handlers
 * close them all, instead of attaching N×2 listeners per dropdown.
 * @type {Set<{ element: HTMLElement, close: () => void, portaledMenu?: HTMLElement }>}
 */
const _openDropdowns = new Set();

const DEFAULT_ASPECT_RATIO_OPTIONS = [
    ['1:1', '1:1 (Square)'],
    ['4:3', '4:3 (Landscape)'],
    ['3:4', '3:4 (Portrait)'],
    ['16:9', '16:9 (Widescreen)'],
    ['9:16', '9:16 (Vertical)'],
    ['3:2', '3:2'],
    ['2:3', '2:3'],
    ['21:9', '21:9 (Ultrawide)'],
    ['9:21', '9:21'],
];

const API_KEY_STORAGE_KEYS = {
    openrouter: 'openrouter_api_key',
    xai: 'xai_api_key',
    evolink: 'evolink_api_key',
};

function hasLocalApiKey(provider) {
    const storageKey = API_KEY_STORAGE_KEYS[provider];
    if (!storageKey) return false;
    try {
        return Boolean(localStorage.getItem(storageKey)?.trim());
    } catch {
        return false;
    }
}

const ASPECT_RATIO_LABELS = new Map([
    ...DEFAULT_ASPECT_RATIO_OPTIONS,
    ['auto', 'Auto'],
    ['4:5', '4:5 (Portrait)'],
    ['5:4', '5:4 (Landscape)'],
    ['adaptive', 'Adaptive'],
]);

document.addEventListener('pointerdown', (e) => {
    for (const entry of _openDropdowns) {
        if (!entry.element.classList.contains('is-open')) continue;
        const target = e.target;
        if (!(target instanceof Node)) continue;
        if (entry.element.contains(target)) continue;
        if (entry.portaledMenu?.contains(target)) continue;
        entry.close();
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const entry of _openDropdowns) {
        if (!entry.element.classList.contains('is-open')) continue;
        entry.close();
    }
});

/**
 * @param {Object} config
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

    if (defaultValue && !hidden.value) {
        const first = menu.querySelector('.input-bar__dropdown-item[data-value]');
        const firstVal = first?.getAttribute?.('data-value');
        if (firstVal) hidden.value = firstVal;
    }

    syncUI();

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

    _openDropdowns.add({ element: dropdown, close });

    return { syncUI, setValue, close };
}

let modelDropdown = null;
let numImagesDropdown = null;
const modelSettings = new Map();
let activeSettingsModel = null;

export function syncNumImagesDropdownUI() {
    if (numImagesDropdown) {
        numImagesDropdown.syncUI();
    }
}

export function syncModelDropdownUI() {
    if (modelDropdown) {
        modelDropdown.syncUI();
    }
}

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
        const label = document.createElement('span');
        label.className = 'model-trigger__label';
        label.textContent = getTriggerLabel(hidden.value);
        trigger.replaceChildren(label);
        const selected = PICKER_MODELS.find((model) => model.id === hidden.value);
        const fullLabel = selected
            ? `${selected.name}, ${selected.provider}${selected.via ? ` via ${selected.via}` : ''}`
            : hidden.value || 'Select model';
        trigger.title = fullLabel;
        trigger.setAttribute('aria-label', fullLabel);
    };

    tabsEl.innerHTML = '';
    CAPABILITY_TABS.forEach(tab => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'model-picker__tab';
        btn.dataset.tab = tab.id;
        btn.setAttribute('role', 'tab');
        btn.tabIndex = tab.id === activeTab ? 0 : -1;
        btn.textContent = tab.label;
        if (tab.id === activeTab) btn.setAttribute('aria-selected', 'true');
        btn.addEventListener('click', () => {
            activeTab = tab.id;
            tabsEl.querySelectorAll('.model-picker__tab').forEach(t => {
                t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
                t.tabIndex = t === btn ? 0 : -1;
            });
            renderList();
        });
        tabsEl.appendChild(btn);
    });

    const matches = (m) => {
        const tabDef = CAPABILITY_TABS.find(t => t.id === activeTab);
        if (tabDef?.types && !m.modes.some((mode) => tabDef.types.includes(mode))) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return m.name.toLowerCase().includes(q)
            || m.provider.toLowerCase().includes(q)
            || (m.via || '').toLowerCase().includes(q)
            || (m.costLabel || '').toLowerCase().includes(q)
            || (m.inputLabel || '').toLowerCase().includes(q)
            || (m.apiKeyLabel || '').toLowerCase().includes(q)
            || m.id.toLowerCase().includes(q);
    };

    const setValue = (value) => {
        if (!value || hidden.value === value) {
            hidden.value = value || hidden.value;
        } else {
            hidden.value = value;
        }
        syncTriggerLabel();
        listEl.querySelectorAll('.model-picker__row').forEach((row) => {
            row.setAttribute('aria-selected', row.getAttribute('data-value') === hidden.value ? 'true' : 'false');
        });
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };

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

        const typeText = m.modes.includes('image') && m.modes.includes('edit')
            ? 'Image + Edit'
            : TYPE_PILL_LABEL[m.type];
        if (typeText) badges.appendChild(buildBadge(`model-picker__badge--type model-picker__badge--type-${m.type}`, typeText));
        if (m.tier) badges.appendChild(buildBadge(`model-picker__badge--tier model-picker__badge--tier-${m.tier}`, TIER_LABEL[m.tier] || m.tier));
        if (m.via) badges.appendChild(buildBadge('model-picker__badge--via', `via ${m.via}`));

        main.appendChild(badges);

        const guidance = document.createElement('span');
        guidance.className = 'model-picker__row-guidance';
        const keyState = hasLocalApiKey(m.apiKey)
            ? `${m.apiKeyLabel} key ready`
            : `${m.apiKeyLabel} key required`;
        guidance.textContent = `${m.costLabel} · ${m.inputLabel} · ${keyState}`;
        main.appendChild(guidance);
        row.appendChild(main);

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
        const filtered = PICKER_MODELS.filter(matches);

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'model-picker__empty';
            empty.textContent = 'No models match your search.';
            listEl.appendChild(empty);
            return;
        }

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

    const close = () => {
        const wasOpen = dropdown.classList.contains('is-open');
        dropdown.classList.remove('is-open');
        document.body.classList.remove('model-picker-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (menu.parentElement === document.body) {
            menu.classList.remove('model-picker--open');
            dropdown.appendChild(menu);
        }
        if (wasOpen) trigger.focus({ preventScroll: true });
    };

    const open = () => {
        dropdown.classList.add('is-open');
        document.body.classList.add('model-picker-open');
        trigger.setAttribute('aria-expanded', 'true');
        if (window.matchMedia('(max-width: 900px)').matches && menu.parentElement !== document.body) {
            document.body.appendChild(menu);
            menu.classList.add('model-picker--open');
        }
        renderList();
        requestAnimationFrame(() => {
            search.value = query;
            search.focus({ preventScroll: true });
        });
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
            const first = listEl.querySelector('.model-picker__row');
            if (first instanceof HTMLElement) first.click();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            listEl.querySelector('.model-picker__row')?.focus();
        } else if (e.key === 'Escape') {
            close();
        }
    });

    tabsEl.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const tabs = Array.from(tabsEl.querySelectorAll('.model-picker__tab'));
        const current = tabs.indexOf(document.activeElement);
        if (current < 0) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0
            : e.key === 'End' ? tabs.length - 1
                : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click();
        tabs[next].focus();
    });

    listEl.addEventListener('keydown', (e) => {
        if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
        const rows = Array.from(listEl.querySelectorAll('.model-picker__row'));
        const current = rows.indexOf(document.activeElement);
        if (current < 0) return;
        e.preventDefault();
        if (e.key === 'Enter') rows[current].click();
        else rows[(current + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    });

    menu.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || menu.parentElement !== document.body) return;
        const focusable = Array.from(menu.querySelectorAll('button:not([disabled]), input:not([disabled])'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
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
        if (updateSidebar && state.selectedFolderId !== folderId) {
            state.setSelectedFolder(folderId || null);
        }
        close();
    };

    const syncWithSidebar = () => {
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

        const allOption = document.createElement('button');
        allOption.type = 'button';
        allOption.className = 'input-bar__dropdown-item';
        allOption.setAttribute('role', 'option');
        allOption.setAttribute('data-value', '');
        allOption.setAttribute('aria-selected', hidden.value === '' ? 'true' : 'false');
        allOption.textContent = 'All Photos';
        allOption.addEventListener('click', () => setValue('', 'All Photos', true));
        menu.appendChild(allOption);

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

    renderMenu();
    syncWithSidebar();

    state.subscribe((action) => {
        if (action === 'folder-add' || action === 'folder-rename' || action === 'folder-delete') {
            renderMenu();
            syncWithSidebar();
        }
        if (action === 'folder-selected') {
            syncWithSidebar();
        }
    });

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropdown.classList.contains('is-open')) {
            close();
        } else {
            renderMenu();
            open();
        }
    });

    _openDropdowns.add({ element: dropdown, close });
}

function syncVideoQualityOptions(model) {
    const videoQualitySelect = document.getElementById('setting-xai-video-quality');
    if (!(videoQualitySelect instanceof HTMLSelectElement)) {
        return;
    }

    const { videoQuality } = getUiCapabilities(model);
    if (!videoQuality) return;

    const currentValue = videoQualitySelect.value;
    videoQualitySelect.innerHTML = '';
    videoQuality.options.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        videoQualitySelect.appendChild(option);
    });

    videoQualitySelect.value = videoQuality.options.includes(currentValue)
        ? currentValue
        : videoQuality.default;
}

function syncImageResolutionOptions(model) {
    const resolutionSelect = document.getElementById('setting-resolution');
    if (!(resolutionSelect instanceof HTMLSelectElement)) {
        return;
    }

    const { resolution } = getUiCapabilities(model);
    if (!resolution) return;

    const currentValue = resolutionSelect.value;
    resolutionSelect.innerHTML = '';
    resolution.options.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        resolutionSelect.appendChild(option);
    });
    resolutionSelect.value = resolution.options.includes(currentValue)
        ? currentValue
        : resolution.default;
}

function syncAspectRatioOptions(model) {
    const aspectRatioSelect = document.getElementById('setting-aspect-ratio');
    if (!(aspectRatioSelect instanceof HTMLSelectElement)) return;

    const { aspectRatioOptions } = getUiCapabilities(model);
    const configuredOptions = aspectRatioOptions?.options;
    const entries = Array.isArray(configuredOptions)
        ? configuredOptions.map((value) => [value, ASPECT_RATIO_LABELS.get(value) || value])
        : DEFAULT_ASPECT_RATIO_OPTIONS;
    const currentValue = aspectRatioSelect.value;

    aspectRatioSelect.innerHTML = '';
    entries.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        aspectRatioSelect.appendChild(option);
    });
    const values = entries.map(([value]) => value);
    aspectRatioSelect.value = values.includes(currentValue)
        ? currentValue
        : aspectRatioOptions?.default || '3:4';
}

function syncOutputFormatOptions(model) {
    const outputFormatSelect = document.getElementById('setting-output-format');
    if (!(outputFormatSelect instanceof HTMLSelectElement)) return;

    const { outputFormat } = getUiCapabilities(model);
    if (!outputFormat) return;

    const currentValue = outputFormatSelect.value;
    outputFormatSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Provider default';
    outputFormatSelect.appendChild(defaultOption);
    outputFormat.options.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value.toUpperCase();
        outputFormatSelect.appendChild(option);
    });
    outputFormatSelect.value = outputFormat.options.includes(currentValue)
        ? currentValue
        : outputFormat.default || '';
}

function syncExactSizeOptions(model) {
    const { exactSize } = getUiCapabilities(model);
    const modeSelect = document.getElementById('setting-size-mode');
    const widthInput = document.getElementById('setting-exact-width');
    const heightInput = document.getElementById('setting-exact-height');
    if (!exactSize || !(modeSelect instanceof HTMLSelectElement)) return;

    if (widthInput instanceof HTMLInputElement && !Number.isInteger(Number(widthInput.value))) {
        widthInput.value = String(exactSize.defaultWidth);
    }
    if (heightInput instanceof HTMLInputElement && !Number.isInteger(Number(heightInput.value))) {
        heightInput.value = String(exactSize.defaultHeight);
    }
}

function updateExactSizeVisibility() {
    const modeSelect = document.getElementById('setting-size-mode');
    const inputs = document.getElementById('exact-size-inputs');
    const resolutionGroup = document.getElementById('resolution-group');
    const exactSizeGroup = document.getElementById('exact-size-group');
    if (exactSizeGroup?.classList.contains('settings-group--hidden')) {
        if (inputs instanceof HTMLElement) inputs.hidden = true;
        return;
    }
    const exact = modeSelect instanceof HTMLSelectElement && modeSelect.value === 'exact';
    if (inputs instanceof HTMLElement) inputs.hidden = !exact;
    resolutionGroup?.classList.toggle('settings-group--hidden', exact);
}

export function updateSettingsForModel(model) {
    const resolutionGroup = document.getElementById('resolution-group');
    const aspectRatioGroup = document.getElementById('aspect-ratio-group');
    const outputFormatGroup = document.getElementById('output-format-group');
    const exactSizeGroup = document.getElementById('exact-size-group');
    const xaiVideoLengthGroup = document.getElementById('xai-video-length-group');
    const xaiVideoQualityGroup = document.getElementById('xai-video-quality-group');
    const generateAudioGroup = document.getElementById('generate-audio-group');
    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');
    const contentFilterGroup = document.getElementById('content-filter-group');
    const contentFilterSwitch = document.getElementById('setting-content-filter-switch');
    const webSearchGroup = document.getElementById('web-search-group');
    const webSearchSwitch = document.getElementById('setting-web-search-switch');
    const flashheadSettingsGroup = document.getElementById('flashhead-settings-group');
    const imageToVideoHintGroup = document.getElementById('image-to-video-hint-group');
    const promptInput = document.getElementById('prompt-input');
    const attachmentButton = document.getElementById('prompt-image-btn');

    if (activeSettingsModel) {
        modelSettings.set(activeSettingsModel, {
            generateAudio: generateAudioSwitch instanceof HTMLInputElement ? generateAudioSwitch.checked : true,
            contentFilter: contentFilterSwitch instanceof HTMLInputElement ? contentFilterSwitch.checked : true,
            webSearch: webSearchSwitch instanceof HTMLInputElement ? webSearchSwitch.checked : true,
        });
    }

    const ui = getUiCapabilities(model);
    const output = getOutputConstraints(model);
    const numImagesDropdownEl = document.getElementById('num-images-dropdown');
    const numImagesInput = document.getElementById('setting-num-images');

    numImagesDropdownEl?.classList.toggle('settings-group--hidden', output.maxImages === 1);
    if (numImagesInput instanceof HTMLInputElement) {
        const current = Number.parseInt(numImagesInput.value, 10);
        numImagesInput.value = String(output.maxImages === 1
            ? 1
            : Math.min(Math.max(Number.isInteger(current) ? current : output.defaultImages, 1), output.maxImages));
        syncNumImagesDropdownUI();
    }

    syncImageResolutionOptions(model);
    syncAspectRatioOptions(model);
    syncOutputFormatOptions(model);
    syncExactSizeOptions(model);
    syncVideoQualityOptions(model);

    aspectRatioGroup?.classList.toggle('settings-group--hidden', !ui.aspectRatio);
    resolutionGroup?.classList.toggle('settings-group--hidden', !ui.resolution);
    outputFormatGroup?.classList.toggle('settings-group--hidden', !ui.outputFormat);
    exactSizeGroup?.classList.toggle('settings-group--hidden', !ui.exactSize);
    xaiVideoLengthGroup?.classList.toggle('settings-group--hidden', !ui.videoLength);
    xaiVideoQualityGroup?.classList.toggle('settings-group--hidden', !ui.videoQuality);
    generateAudioGroup?.classList.toggle('settings-group--hidden', !ui.generateAudio);
    contentFilterGroup?.classList.toggle('settings-group--hidden', !ui.contentFilter);
    webSearchGroup?.classList.toggle('settings-group--hidden', !ui.webSearch);
    flashheadSettingsGroup?.classList.toggle('settings-group--hidden', !ui.flashhead);
    imageToVideoHintGroup?.classList.toggle('settings-group--hidden', !ui.imageToVideoHint);

    const input = getInputConstraints(model);
    if (promptInput instanceof HTMLTextAreaElement) {
        if (Number.isInteger(input.promptMaxLength)) promptInput.maxLength = input.promptMaxLength;
        else promptInput.removeAttribute('maxlength');
    }
    if (attachmentButton instanceof HTMLButtonElement) {
        const editing = input.maxImages > 0 && PICKER_MODELS.find((entry) => entry.id === model)?.modes.includes('edit');
        const label = editing ? 'Attach reference images for editing' : 'Attach images';
        attachmentButton.title = label;
        attachmentButton.setAttribute('aria-label', label);
    }
    if (!ui.exactSize) {
        const modeSelect = document.getElementById('setting-size-mode');
        if (modeSelect instanceof HTMLSelectElement) modeSelect.value = 'ratio';
    }
    updateExactSizeVisibility();

    const remembered = modelSettings.get(model);
    if (ui.generateAudio && generateAudioSwitch instanceof HTMLInputElement) {
        generateAudioSwitch.checked = remembered?.generateAudio ?? true;
    }
    if (ui.contentFilter && contentFilterSwitch instanceof HTMLInputElement) {
        contentFilterSwitch.checked = remembered?.contentFilter ?? true;
    }
    if (ui.webSearch && webSearchSwitch instanceof HTMLInputElement) {
        webSearchSwitch.checked = remembered?.webSearch ?? true;
    }
    activeSettingsModel = model;
}

export function initModelPicker() {
    modelDropdown = createModelPicker();
    initNumImagesDropdown();
    initFolderSelectorDropdown();
    document.getElementById('setting-size-mode')?.addEventListener('change', updateExactSizeVisibility);
}
