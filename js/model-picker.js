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
} from './models.js';

/**
 * Global registry of open dropdowns — document-level pointer/key handlers
 * close them all, instead of attaching N×2 listeners per dropdown.
 * @type {Set<{ element: HTMLElement, close: () => void, portaledMenu?: HTMLElement }>}
 */
const _openDropdowns = new Set();

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
        trigger.textContent = getTriggerLabel(hidden.value);
        trigger.title = hidden.value || 'Select model';
    };

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

        const typeText = TYPE_PILL_LABEL[m.type];
        if (typeText) badges.appendChild(buildBadge(`model-picker__badge--type model-picker__badge--type-${m.type}`, typeText));
        if (m.tier) badges.appendChild(buildBadge(`model-picker__badge--tier model-picker__badge--tier-${m.tier}`, TIER_LABEL[m.tier] || m.tier));
        if (m.via) badges.appendChild(buildBadge('model-picker__badge--via', `via ${m.via}`));

        main.appendChild(badges);
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
        const filtered = MODELS.filter(matches);

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
        dropdown.classList.remove('is-open');
        document.body.classList.remove('model-picker-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (menu.parentElement === document.body) {
            menu.classList.remove('model-picker--open');
            dropdown.appendChild(menu);
        }
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

export function updateSettingsForModel(model) {
    const resolutionGroup = document.getElementById('resolution-group');
    const aspectRatioGroup = document.getElementById('aspect-ratio-group');
    const xaiVideoLengthGroup = document.getElementById('xai-video-length-group');
    const xaiVideoQualityGroup = document.getElementById('xai-video-quality-group');
    const generateAudioGroup = document.getElementById('generate-audio-group');
    const generateAudioSwitch = document.getElementById('setting-generate-audio-switch');
    const flashheadSettingsGroup = document.getElementById('flashhead-settings-group');
    const falImageToVideoHintGroup = document.getElementById('fal-image-to-video-hint-group');

    const ui = getUiCapabilities(model);

    syncImageResolutionOptions(model);
    syncVideoQualityOptions(model);

    aspectRatioGroup?.classList.toggle('settings-group--hidden', !ui.aspectRatio);
    resolutionGroup?.classList.toggle('settings-group--hidden', !ui.resolution);
    xaiVideoLengthGroup?.classList.toggle('settings-group--hidden', !ui.videoLength);
    xaiVideoQualityGroup?.classList.toggle('settings-group--hidden', !ui.videoQuality);
    generateAudioGroup?.classList.toggle('settings-group--hidden', !ui.generateAudio);
    flashheadSettingsGroup?.classList.toggle('settings-group--hidden', !ui.flashhead);
    falImageToVideoHintGroup?.classList.toggle('settings-group--hidden', !ui.imageToVideoHint);

    if (ui.generateAudio && generateAudioSwitch instanceof HTMLInputElement) {
        generateAudioSwitch.checked = true;
    }
}

export function initModelPicker() {
    modelDropdown = createModelPicker();
    initNumImagesDropdown();
    initFolderSelectorDropdown();
}
