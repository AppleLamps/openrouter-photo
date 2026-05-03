/**
 * Sidebar module for folder management
 */

import { state } from './state.js';
import { createElement } from './utils.js';

const SIDEBAR_STATE_KEY = 'sidebar_open';

/** Media query that matches the CSS overlay breakpoint for the sidebar. */
const MOBILE_MQ = window.matchMedia('(max-width: 900px)');

let sidebarElement = null;
let expandButton = null;
let appContainer = null;

// Modal elements
let folderModal = null;
let folderModalTitle = null;
let folderModalDesc = null;
let folderModalInput = null;
let folderModalSave = null;
let folderModalCancel = null;
let folderModalClose = null;

// Modal state
let currentFolderAction = null; // 'create' or 'rename'
let currentFolderTarget = null; // folder object being renamed
let currentFolderComplete = null;

function syncSidebarDocumentState(isOpen) {
    const isMobileOverlay = MOBILE_MQ.matches;
    document.body.classList.toggle('is-sidebar-open', isOpen);
    document.body.classList.toggle('is-sidebar-overlay-open', isOpen && isMobileOverlay);
}

/**
 * Initialize the sidebar
 */
export function initSidebar() {
    sidebarElement = document.getElementById('sidebar');
    expandButton = document.getElementById('sidebar-expand');
    appContainer = document.querySelector('.app-container');

    initFolderModal();

    if (!sidebarElement) return;

    // Load saved sidebar state on desktop; overlay (narrow) always starts closed
    // so a desktop "open" preference does not trap mobile users behind the sheet.
    const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
    const isMobileOverlay = MOBILE_MQ.matches;
    if (isMobileOverlay) {
        closeSidebar(false);
    } else if (savedState !== 'closed') {
        openSidebar();
    } else if (savedState === 'closed') {
        closeSidebar();
    }

    // Close sidebar when tapping the backdrop (mobile overlay mode only).
    // The sidebar's ::before pseudo-element creates the visual backdrop but
    // cannot receive click events, so we listen at the document level and
    // close whenever the tap lands outside the sidebar panel.
    document.addEventListener('click', (e) => {
        if (!MOBILE_MQ.matches) return;
        if (!sidebarElement.classList.contains('sidebar--open')) return;
        const target = /** @type {Node} */ (e.target);
        if (sidebarElement.contains(target)) return;
        if (expandButton && expandButton.contains(target)) return;
        // Model picker portals its menu to document.body on narrow screens; don't treat it as "outside" the app.
        const modelMenu = document.getElementById('model-menu');
        if (modelMenu?.contains(target)) return;
        closeSidebar();
    });

    // Collapse button
    const collapseBtn = document.getElementById('sidebar-collapse');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', toggleSidebar);
    }

    // Expand button
    if (expandButton) {
        expandButton.addEventListener('click', toggleSidebar);
    }

    // All Photos button
    const folderAllBtn = document.getElementById('folder-all');
    if (folderAllBtn) {
        folderAllBtn.addEventListener('click', () => {
            state.setSelectedFolder(null);
        });
    }

    // Create folder button
    const createFolderBtn = document.getElementById('create-folder-btn');
    if (createFolderBtn) {
        createFolderBtn.addEventListener('click', showCreateFolderModal);
    }

    // Edit folders button
    const editFoldersBtn = document.getElementById('edit-folders-btn');
    if (editFoldersBtn) {
        editFoldersBtn.addEventListener('click', () => {
            state.setEditMode(!state.editMode);
        });
    }

    // Subscribe to state changes
    state.subscribe((action, data) => {
        if (action === 'add' || action === 'remove' || action === 'clear' || action === 'images-moved') {
            updateFolderCounts();
        }
        if (action === 'folder-add' || action === 'folder-rename' || action === 'folder-delete') {
            renderFolderList();
            updateFolderCounts();
        }
        if (action === 'folder-selected') {
            updateSelectedFolder(data.folderId);
            // Auto-close sidebar after selecting a folder on mobile
            if (MOBILE_MQ.matches) {
                closeSidebar();
            }
        }
        if (action === 'edit-mode-changed') {
            updateEditModeUI(data.enabled);
        }
    });

    // Initial render
    renderFolderList();
    updateFolderCounts();

    const onOverlayBreakpointChange = () => {
        if (MOBILE_MQ.matches && sidebarElement.classList.contains('sidebar--open')) {
            closeSidebar(false);
        } else {
            syncSidebarDocumentState(sidebarElement.classList.contains('sidebar--open'));
        }
    };
    if (typeof MOBILE_MQ.addEventListener === 'function') {
        MOBILE_MQ.addEventListener('change', onOverlayBreakpointChange);
    } else {
        // Safari < 14
        MOBILE_MQ.addListener(onOverlayBreakpointChange);
    }
}

/**
 * Toggle sidebar open/close
 */
export function toggleSidebar() {
    if (!sidebarElement || !appContainer) return;

    const isOpen = sidebarElement.classList.contains('sidebar--open');

    if (isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

/**
 * Open sidebar
 */
export function openSidebar() {
    if (!sidebarElement || !appContainer) return;

    sidebarElement.classList.add('sidebar--open');
    appContainer.classList.add('app-container--sidebar-open');
    syncSidebarDocumentState(true);
    if (expandButton) {
        expandButton.classList.add('sidebar__expand-btn--hidden');
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, 'open');
}

/**
 * Close sidebar
 */
export function closeSidebar(persist = true) {
    if (!sidebarElement || !appContainer) return;

    sidebarElement.classList.remove('sidebar--open');
    appContainer.classList.remove('app-container--sidebar-open');
    syncSidebarDocumentState(false);
    if (expandButton) {
        expandButton.classList.remove('sidebar__expand-btn--hidden');
    }
    if (persist) {
        localStorage.setItem(SIDEBAR_STATE_KEY, 'closed');
    }
}

/**
 * Render the folder list
 */
export function renderFolderList() {
    const folderList = document.getElementById('folder-list');
    if (!folderList) return;

    folderList.innerHTML = '';

    const folders = state.getFolders();

    folders.forEach(folder => {
        const folderBtn = createFolderButton(folder);
        folderList.appendChild(folderBtn);
    });
}

/**
 * Create a folder button element
 * @param {Object} folder - Folder data
 * @returns {HTMLElement}
 */
function createFolderButton(folder) {
    const isActive = state.selectedFolderId === folder.id;

    const btn = createElement('button', {
        className: `sidebar__folder${isActive ? ' sidebar__folder--active' : ''}`,
        dataset: { folderId: folder.id },
        type: 'button',
        onClick: () => state.setSelectedFolder(folder.id)
    });

    // Folder icon
    const icon = createElement('span', { className: 'sidebar__folder-icon' });
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>`;

    // Folder name
    const name = createElement('span', {
        className: 'sidebar__folder-name',
        title: folder.name
    }, folder.name);

    // Image count
    const count = createElement('span', {
        className: 'sidebar__folder-count',
        id: `folder-count-${folder.id}`
    }, '0');

    // Context menu button (for rename/delete)
    const menuBtn = createElement('button', {
        className: 'sidebar__folder-menu',
        type: 'button',
        title: 'Folder options',
        onClick: (e) => {
            e.stopPropagation();
            showFolderContextMenu(folder, menuBtn);
        }
    });
    menuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="12" cy="5" r="1"></circle>
        <circle cx="12" cy="19" r="1"></circle>
    </svg>`;

    btn.appendChild(icon);
    btn.appendChild(name);
    btn.appendChild(count);
    btn.appendChild(menuBtn);

    return btn;
}

/**
 * Update folder counts
 */
function updateFolderCounts() {
    // Update "All Photos" count
    const allCount = document.getElementById('folder-all-count');
    if (allCount) {
        allCount.textContent = state.images.length.toString();
    }

    // Update individual folder counts
    const folders = state.getFolders();
    folders.forEach(folder => {
        const countEl = document.getElementById(`folder-count-${folder.id}`);
        if (countEl) {
            const count = state.getImageCountForFolder(folder.id);
            countEl.textContent = count.toString();
        }
    });
}

/**
 * Update the selected folder UI
 * @param {string|null} folderId
 */
function updateSelectedFolder(folderId) {
    // Remove active from all folders
    document.querySelectorAll('.sidebar__folder').forEach(btn => {
        btn.classList.remove('sidebar__folder--active');
    });

    // Add active to selected folder
    if (folderId === null) {
        const allBtn = document.getElementById('folder-all');
        if (allBtn) allBtn.classList.add('sidebar__folder--active');
    } else {
        const folderBtn = document.querySelector(`[data-folder-id="${folderId}"]`);
        if (folderBtn) folderBtn.classList.add('sidebar__folder--active');
    }
}

/**
 * Update edit mode UI
 * @param {boolean} enabled
 */
function updateEditModeUI(enabled) {
    const editBtn = document.getElementById('edit-folders-btn');
    if (editBtn) {
        const span = editBtn.querySelector('span');
        if (enabled) {
            editBtn.classList.add('sidebar__action-btn--active');
            if (span) span.textContent = 'Done Editing';
        } else {
            editBtn.classList.remove('sidebar__action-btn--active');
            if (span) span.textContent = 'Edit Folders';
        }
    }
}

/**
 * Initialize folder modal elements and events
 */
function initFolderModal() {
    folderModal = document.getElementById('folder-modal');
    folderModalTitle = document.getElementById('folder-modal-title');
    folderModalDesc = document.getElementById('folder-modal-description');
    folderModalInput = document.getElementById('folder-modal-input');
    folderModalSave = document.getElementById('folder-modal-save');
    folderModalCancel = document.getElementById('folder-modal-cancel');
    folderModalClose = document.getElementById('folder-modal-close');

    if (!folderModal) return;

    // Close buttons
    folderModalClose.addEventListener('click', closeFolderModal);
    folderModalCancel.addEventListener('click', closeFolderModal);

    // Click outside to close
    folderModal.addEventListener('click', (e) => {
        if (e.target === folderModal || e.target.classList.contains('openrouter-key-modal__backdrop')) {
            closeFolderModal();
        }
    });

    // Save button
    folderModalSave.addEventListener('click', handleFolderSave);

    // Enter key to save
    folderModalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleFolderSave();
        }
        if (e.key === 'Escape') {
            closeFolderModal();
        }
    });
}

/**
 * Open folder modal
 * @param {'create'|'rename'|'delete'} action
 * @param {Object|null} folder
 * @param {(folder: Object) => void|null} onComplete
 */
function openFolderModal(action, folder = null, onComplete = null) {
    if (!folderModal) return;

    currentFolderAction = action;
    currentFolderTarget = folder;
    currentFolderComplete = typeof onComplete === 'function' ? onComplete : null;

    // Reset UI state
    folderModalInput.value = '';
    folderModalInput.classList.remove('input-error');
    folderModalInput.parentElement.style.display = 'block'; // Show input by default
    folderModalSave.className = 'openrouter-key-modal__link'; // Reset button style
    folderModalSave.style.backgroundColor = ''; // Reset inline style if any

    // Update UI based on action
    if (action === 'create') {
        folderModalTitle.textContent = 'New Folder';
        folderModalDesc.textContent = 'Enter a name for the new folder.';
        folderModalSave.textContent = 'Create';
        setTimeout(() => folderModalInput.focus(), 100);
    } else if (action === 'rename' && folder) {
        folderModalTitle.textContent = 'Rename Folder';
        folderModalDesc.textContent = `Enter a new name for "${folder.name}".`;
        folderModalInput.value = folder.name;
        folderModalSave.textContent = 'Save';
        setTimeout(() => folderModalInput.focus(), 100);
    } else if (action === 'delete' && folder) {
        const count = state.getImageCountForFolder(folder.id);
        folderModalTitle.textContent = 'Delete Folder';
        folderModalDesc.textContent = count > 0
            ? `Delete "${folder.name}"? ${count} image(s) will be moved to All Photos.`
            : `Are you sure you want to delete "${folder.name}"?`;
        
        folderModalInput.parentElement.style.display = 'none'; // Hide input
        folderModalSave.textContent = 'Delete';
        folderModalSave.style.backgroundColor = '#ef4444'; // Red for danger
        folderModalSave.style.color = 'white';
    }

    // Show modal
    folderModal.classList.add('openrouter-key-modal--active');
    document.body.classList.add('is-modal-open');
}

/**
 * Close folder modal
 */
function closeFolderModal() {
    if (!folderModal) return;

    folderModal.classList.remove('openrouter-key-modal--active');
    document.body.classList.remove('is-modal-open');
    currentFolderAction = null;
    currentFolderTarget = null;
    currentFolderComplete = null;
    
    // Clean up inline styles
    folderModalSave.style.backgroundColor = '';
    folderModalSave.style.color = '';
}

/**
 * Handle save action
 */
async function handleFolderSave() {
    if (currentFolderAction === 'delete' && currentFolderTarget) {
        await state.deleteFolder(currentFolderTarget.id);
        closeFolderModal();
        return;
    }

    const name = folderModalInput.value.trim();
    
    if (!name) {
        // Simple validation visual cue
        folderModalInput.style.borderColor = '#ef4444';
        folderModalInput.focus();
        return;
    }

    // Reset validation style
    folderModalInput.style.borderColor = '';

    if (currentFolderAction === 'create') {
        const folder = await state.addFolder(name);
        if (typeof currentFolderComplete === 'function') {
            currentFolderComplete(folder);
        }
    } else if (currentFolderAction === 'rename' && currentFolderTarget) {
        if (name !== currentFolderTarget.name) {
            await state.renameFolder(currentFolderTarget.id, name);
        }
    }

    closeFolderModal();
}

/**
 * Show create folder modal
 */
export function showCreateFolderModal(onCreated = null) {
    openFolderModal('create', null, onCreated);
}

/**
 * Show folder context menu
 * @param {Object} folder - Folder data
 * @param {HTMLElement} anchor - Button that triggered the menu
 */
function showFolderContextMenu(folder, anchor) {
    // Remove any existing context menu
    const existing = document.querySelector('.folder-context-menu');
    if (existing) existing.remove();

    const menu = createElement('div', {
        className: 'folder-context-menu'
    });

    const renameBtn = createElement('button', {
        className: 'folder-context-menu__item',
        type: 'button',
        onClick: () => {
            menu.remove();
            showRenameFolderModal(folder);
        }
    }, 'Rename');

    const deleteBtn = createElement('button', {
        className: 'folder-context-menu__item folder-context-menu__item--danger',
        type: 'button',
        onClick: () => {
            menu.remove();
            showDeleteFolderConfirm(folder);
        }
    }, 'Delete');

    menu.appendChild(renameBtn);
    menu.appendChild(deleteBtn);

    // Position the menu
    const rect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    
    // Adjust if menu goes off screen
    if (rect.left + 150 > window.innerWidth) {
        menu.style.left = `${window.innerWidth - 160}px`;
    }

    document.body.appendChild(menu);

    // Close on click outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * Show rename folder modal
 * @param {Object} folder - Folder data
 */
export function showRenameFolderModal(folder) {
    openFolderModal('rename', folder);
}

/**
 * Show delete folder confirmation
 * @param {Object} folder - Folder data
 */
export function showDeleteFolderConfirm(folder) {
    openFolderModal('delete', folder);
}
