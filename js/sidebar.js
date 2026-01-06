/**
 * Sidebar module for folder management
 */

import { state } from './state.js';
import { createElement } from './utils.js';

const SIDEBAR_STATE_KEY = 'sidebar_open';

let sidebarElement = null;
let expandButton = null;
let appContainer = null;

/**
 * Initialize the sidebar
 */
export function initSidebar() {
    sidebarElement = document.getElementById('sidebar');
    expandButton = document.getElementById('sidebar-expand');
    appContainer = document.querySelector('.app-container');

    if (!sidebarElement) return;

    // Load saved sidebar state
    const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
    if (savedState === 'closed') {
        closeSidebar();
    }

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
        }
        if (action === 'edit-mode-changed') {
            updateEditModeUI(data.enabled);
        }
    });

    // Initial render
    renderFolderList();
    updateFolderCounts();
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
    if (expandButton) {
        expandButton.classList.add('sidebar__expand-btn--hidden');
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, 'open');
}

/**
 * Close sidebar
 */
export function closeSidebar() {
    if (!sidebarElement || !appContainer) return;

    sidebarElement.classList.remove('sidebar--open');
    appContainer.classList.remove('app-container--sidebar-open');
    if (expandButton) {
        expandButton.classList.remove('sidebar__expand-btn--hidden');
    }
    localStorage.setItem(SIDEBAR_STATE_KEY, 'closed');
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
 * Show create folder modal
 */
export function showCreateFolderModal() {
    const name = prompt('Enter folder name:');
    if (name && name.trim()) {
        state.addFolder(name.trim());
    }
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
    const newName = prompt('Enter new folder name:', folder.name);
    if (newName && newName.trim() && newName.trim() !== folder.name) {
        state.renameFolder(folder.id, newName.trim());
    }
}

/**
 * Show delete folder confirmation
 * @param {Object} folder - Folder data
 */
export function showDeleteFolderConfirm(folder) {
    const count = state.getImageCountForFolder(folder.id);
    const message = count > 0
        ? `Delete "${folder.name}"? ${count} image(s) will be moved to All Photos.`
        : `Delete "${folder.name}"?`;

    if (confirm(message)) {
        state.deleteFolder(folder.id);
    }
}
