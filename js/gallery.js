/**
 * Gallery module for rendering the grid
 */

import { createElement, downloadImage } from './utils.js';
import { state } from './state.js';

/** @type {HTMLElement|null} */
let galleryElement = null;

/** @type {HTMLElement|null} */
let emptyStateElement = null;

/** @type {HTMLElement[]} */
let placeholderElements = [];

/** @type {Map<string, number>} */
let confirmationTimeouts = new Map();

/** @type {Set<string>} */
let pendingDeletions = new Set();

/** @type {HTMLElement|null} */
let lastFocusedElement = null;

/** @type {string|null} */
let currentLightboxImageId = null;

/** @type {HTMLElement|null} */
let lightboxModalContentElement = null;

/** @type {number} */
let scrollYBeforeLock = 0;

/** @type {boolean} */
let isScrollLocked = false;

/**
 * Swipe-to-close state for the lightbox (kept at module scope so it can be reset on close).
 * @type {{startX:number,startY:number,startTime:number,deltaY:number,isActive:boolean}}
 */
const lightboxSwipeState = { startX: 0, startY: 0, startTime: 0, deltaY: 0, isActive: false };

function resetLightboxSwipeState() {
    lightboxSwipeState.startX = 0;
    lightboxSwipeState.startY = 0;
    lightboxSwipeState.startTime = 0;
    lightboxSwipeState.deltaY = 0;
    lightboxSwipeState.isActive = false;

    const modal = document.getElementById('lightbox-modal');
    if (modal) {
        modal.classList.remove('modal--dragging');
    }
    if (lightboxModalContentElement) {
        lightboxModalContentElement.style.transform = '';
    }
}

function lockBodyScroll() {
    if (isScrollLocked) return;
    isScrollLocked = true;

    scrollYBeforeLock = window.scrollY || window.pageYOffset || 0;

    // iOS Safari: `overflow: hidden` is not sufficient; fix the body in place.
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYBeforeLock}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
}

function unlockBodyScroll() {
    if (!isScrollLocked) return;
    isScrollLocked = false;

    const top = document.body.style.top;
    const y = top ? Math.abs(parseInt(top, 10)) : scrollYBeforeLock;

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';

    window.scrollTo(0, y);
}

/**
 * Reset confirmation state for an image
 * @param {string} imageId - Image ID
 */
function resetConfirmationState(imageId) {
    pendingDeletions.delete(imageId);

    const timeout = confirmationTimeouts.get(imageId);
    if (timeout) {
        clearTimeout(timeout);
        confirmationTimeouts.delete(imageId);
    }

    // Reset button appearance
    const deleteBtn = document.querySelector(`[data-id="${imageId}"] .gallery__delete-btn`);
    if (deleteBtn) {
        deleteBtn.classList.remove('gallery__delete-btn--confirm');
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete image';
    }
}

/**
 * Handle first delete button press
 * @param {string} imageId - Image ID
 */
function handleFirstDeletePress(imageId) {
    pendingDeletions.add(imageId);

    const deleteBtn = document.querySelector(`[data-id="${imageId}"] .gallery__delete-btn`);
    if (deleteBtn) {
        deleteBtn.classList.add('gallery__delete-btn--confirm');
        deleteBtn.textContent = '!';
        deleteBtn.title = 'Tap again to confirm';
    }

    // Auto-reset after 3 seconds
    const timeout = setTimeout(() => {
        resetConfirmationState(imageId);
    }, 3000);

    confirmationTimeouts.set(imageId, timeout);
}

/**
 * Initialize the gallery
 * @param {HTMLElement} container - Gallery container element
 * @param {HTMLElement} emptyState - Empty state element
 */
export function initGallery(container, emptyState) {
    galleryElement = container;
    emptyStateElement = emptyState;

    // Subscribe to state changes
    state.subscribe(handleStateChange);

    // Initial render
    renderGallery();
}

/**
 * Handle state changes
 * @param {string} action
 * @param {Object} data
 */
function handleStateChange(action, data) {
    switch (action) {
        case 'add':
            // Check if the new image should be visible in current folder view
            if (shouldShowImageInCurrentView(data)) {
                // Preload image before showing to ensure seamless transition
                preloadAndShowImage(data);
            } else {
                // Image goes to a different folder, just remove placeholder
                removePlaceholder();
                updateEmptyState();
            }
            break;
        case 'remove':
            removeImageCard(data.id);
            updateEmptyState();
            break;
        case 'clear':
            // Clean up all confirmation states
            confirmationTimeouts.forEach(timeout => clearTimeout(timeout));
            confirmationTimeouts.clear();
            pendingDeletions.clear();
            renderGallery();
            break;
        case 'folder-selected':
        case 'images-moved':
        case 'settings-changed':
            // Re-render gallery when folder filter or visibility changes
            renderGallery();
            break;
        case 'edit-mode-changed':
            // Re-render gallery to show/hide checkboxes
            renderGallery();
            updateEditModeActionBar();
            break;
        case 'selection-changed':
            // Update selection count in action bar
            updateEditModeActionBar();
            break;
    }
}

/**
 * Check if an image should be visible in the current folder view
 * @param {Object} image - Image data
 * @returns {boolean}
 */
function shouldShowImageInCurrentView(image) {
    const visibilityMode = state.getPhotoVisibilityMode();
    const selectedFolder = state.selectedFolderId;
    const imageFolderId = image.folderId || null;

    if (selectedFolder === null) {
        // "All Photos" selected
        if (visibilityMode === 'all') {
            return true; // Show all images
        } else {
            // folder-only: show only uncategorized images
            return imageFolderId === null;
        }
    } else {
        // Specific folder selected - only show images in that folder
        return imageFolderId === selectedFolder;
    }
}

/**
 * Preload image and show with seamless transition
 * @param {Object} image - Image data
 */
function preloadAndShowImage(image) {
    const img = new Image();
    img.src = image.url;

    const showImage = () => {
        // Clean up event handlers to allow garbage collection
        img.onload = null;
        img.onerror = null;
        removePlaceholder();
        prependImageCard(image, true); // true = already loaded
        updateEmptyState();
    };

    if (img.complete) {
        showImage();
    } else {
        img.onload = showImage;
        img.onerror = showImage; // Still show on error
    }
}

/**
 * Render the full gallery
 */
function renderGallery() {
    if (!galleryElement) return;

    galleryElement.innerHTML = '';

    // Use filtered images based on folder selection and visibility settings
    const images = state.getFilteredImages();

    if (images.length === 0) {
        updateEmptyState();
        return;
    }

    // Use DocumentFragment to batch DOM insertions (single reflow)
    const fragment = document.createDocumentFragment();
    images.forEach(image => {
        const card = createImageCard(image);
        fragment.appendChild(card);
    });
    galleryElement.appendChild(fragment);

    updateEmptyState();

    // Add edit mode action bar if in edit mode
    updateEditModeActionBar();
}

/**
 * Update or create the edit mode floating action bar
 */
function updateEditModeActionBar() {
    const existingBar = document.getElementById('edit-mode-action-bar');

    if (!state.editMode) {
        // Remove action bar if not in edit mode
        if (existingBar) existingBar.remove();
        return;
    }

    const selectedCount = state.selectedImageIds.size;

    if (!existingBar) {
        // Create action bar
        const bar = createElement('div', {
            id: 'edit-mode-action-bar',
            className: 'edit-mode-action-bar'
        });

        const countSpan = createElement('span', {
            className: 'edit-mode-action-bar__count'
        }, `${selectedCount} selected`);

        const moveBtn = createElement('button', {
            className: 'edit-mode-action-bar__btn',
            type: 'button',
            disabled: selectedCount === 0,
            onClick: () => showMoveToFolderMenu(moveBtn)
        }, 'Move to Folder');

        const selectAllBtn = createElement('button', {
            className: 'edit-mode-action-bar__btn edit-mode-action-bar__btn--secondary',
            type: 'button',
            onClick: () => state.selectAllImages()
        }, 'Select All');

        const cancelBtn = createElement('button', {
            className: 'edit-mode-action-bar__btn edit-mode-action-bar__btn--secondary',
            type: 'button',
            onClick: () => state.setEditMode(false)
        }, 'Done');

        bar.appendChild(countSpan);
        bar.appendChild(moveBtn);
        bar.appendChild(selectAllBtn);
        bar.appendChild(cancelBtn);

        document.body.appendChild(bar);
    } else {
        // Update existing bar
        const countSpan = existingBar.querySelector('.edit-mode-action-bar__count');
        if (countSpan) countSpan.textContent = `${selectedCount} selected`;

        const moveBtn = existingBar.querySelector('.edit-mode-action-bar__btn');
        if (moveBtn) moveBtn.disabled = selectedCount === 0;
    }
}

/**
 * Show move to folder menu
 * @param {HTMLElement} anchor - Button that triggered the menu
 */
function showMoveToFolderMenu(anchor) {
    // Remove any existing menu
    const existingMenu = document.querySelector('.move-folder-menu');
    if (existingMenu) existingMenu.remove();

    const selectedIds = state.getSelectedImageIds();
    if (selectedIds.length === 0) return;

    const menu = createElement('div', {
        className: 'move-folder-menu'
    });

    // "All Photos" (uncategorized) option
    const allOption = createElement('button', {
        className: 'move-folder-menu__item',
        type: 'button',
        onClick: async () => {
            menu.remove();
            await state.moveImagesToFolder(selectedIds, null);
            state.clearSelection();
        }
    }, 'All Photos (No Folder)');
    menu.appendChild(allOption);

    // Folder options
    const folders = state.getFolders();
    folders.forEach(folder => {
        const option = createElement('button', {
            className: 'move-folder-menu__item',
            type: 'button',
            onClick: async () => {
                menu.remove();
                await state.moveImagesToFolder(selectedIds, folder.id);
                state.clearSelection();
            }
        }, folder.name);
        menu.appendChild(option);
    });

    // Position the menu above the button
    const rect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
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
 * Update empty state visibility
 */
function updateEmptyState() {
    if (!emptyStateElement) return;

    const hasImages = state.getImages().length > 0 || placeholderElements.length > 0;
    emptyStateElement.style.display = hasImages ? 'none' : 'flex';
}

/**
 * Create an image card element
 * @param {Object} image - Image data
 * @param {boolean} [preloaded=false] - Whether image is already loaded
 * @returns {HTMLElement}
 */
function createImageCard(image, preloaded = false) {
    const isEditMode = state.editMode;
    const isSelected = state.selectedImageIds.has(image.id);

    const card = createElement('div', {
        className: `gallery__card${isEditMode ? ' gallery__card--edit-mode' : ''}${isSelected ? ' gallery__card--selected' : ''}`,
        dataset: { id: image.id }
    });

    // Checkbox for edit mode
    if (isEditMode) {
        const checkboxWrapper = createElement('label', {
            className: 'gallery__checkbox-wrapper',
            onClick: (e) => e.stopPropagation()
        });

        const checkbox = createElement('input', {
            type: 'checkbox',
            className: 'gallery__checkbox',
            checked: isSelected,
            onChange: () => {
                state.toggleImageSelection(image.id);
                // Update card's selected state
                card.classList.toggle('gallery__card--selected', state.selectedImageIds.has(image.id));
            }
        });

        const checkmark = createElement('span', { className: 'gallery__checkmark' });

        checkboxWrapper.appendChild(checkbox);
        checkboxWrapper.appendChild(checkmark);
        card.appendChild(checkboxWrapper);
    }

    // Delete button (hidden in edit mode)
    const deleteBtn = createElement('button', {
        className: 'gallery__delete-btn',
        title: 'Delete image',
        onClick: (e) => {
            e.stopPropagation();

            if (pendingDeletions.has(image.id)) {
                // Second press - confirm deletion
                resetConfirmationState(image.id);
                state.removeImage(image.id);
            } else {
                // First press - show confirmation
                handleFirstDeletePress(image.id);
            }
        }
    }, '✕');

    // Image element
    const img = createElement('img', {
        className: preloaded ? 'gallery__image gallery__image--loaded' : 'gallery__image gallery__image--loading',
        src: image.url,
        alt: image.prompt,
        loading: 'lazy'
    });

    if (!preloaded) {
        img.onload = () => {
            // Use replace() for single reflow instead of remove+add
            img.classList.replace('gallery__image--loading', 'gallery__image--loaded');
            img.onload = null; // Clean up handler
        };
    }

    card.appendChild(deleteBtn);
    card.appendChild(img);

    // Click to open lightbox (or toggle selection in edit mode)
    card.addEventListener('click', () => {
        if (state.editMode) {
            state.toggleImageSelection(image.id);
            card.classList.toggle('gallery__card--selected', state.selectedImageIds.has(image.id));
            // Update checkbox state
            const checkbox = card.querySelector('.gallery__checkbox');
            if (checkbox) checkbox.checked = state.selectedImageIds.has(image.id);
        } else {
            openLightbox(image);
        }
    });

    return card;
}

/**
 * Prepend a new image card to the gallery
 * @param {Object} image - Image data
 * @param {boolean} [preloaded=false] - Whether image is already loaded
 */
function prependImageCard(image, preloaded = false) {
    if (!galleryElement) return;

    const card = createImageCard(image, preloaded);
    galleryElement.insertBefore(card, galleryElement.firstChild);
}

/**
 * Remove an image card from the gallery
 * @param {string} id - Image ID
 */
function removeImageCard(id) {
    if (!galleryElement) return;

    const card = galleryElement.querySelector(`[data-id="${id}"]`);
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';

        // Use transitionend for more reliable removal
        const handleTransitionEnd = () => {
            card.removeEventListener('transitionend', handleTransitionEnd);
            card.remove();
        };
        card.addEventListener('transitionend', handleTransitionEnd);

        // Fallback timeout in case transitionend doesn't fire
        setTimeout(() => {
            if (card.parentNode) {
                card.remove();
            }
        }, 300);

        // Clean up confirmation state when image is removed
        resetConfirmationState(id);
    }
}

/**
 * Show loading placeholder
 */
export function showPlaceholder() {
    if (!galleryElement) return;

    const placeholder = createElement('div', {
        className: 'gallery__placeholder'
    });

    placeholderElements.push(placeholder);
    galleryElement.insertBefore(placeholder, galleryElement.firstChild);
    updateEmptyState();
}

/**
 * Remove loading placeholder
 */
export function removePlaceholder() {
    const placeholder = placeholderElements.pop();
    if (placeholder) {
        placeholder.remove();
    }
}

/**
 * Remove all loading placeholders
 */
export function removeAllPlaceholders() {
    placeholderElements.forEach(p => p.remove());
    placeholderElements = [];
    updateEmptyState();
}

/**
 * Open lightbox modal
 * @param {Object} image - Image data
 */
async function openLightbox(image) {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    const modalImage = modal.querySelector('.modal__image');
    const modalPrompt = modal.querySelector('.modal__prompt');
    const downloadBtn = modal.querySelector('.modal__download-btn');
    const copyBtn = modal.querySelector('.modal__copy-btn');
    const actionsContainer = modal.querySelector('.modal__actions');
    const closeBtn = modal.querySelector('.modal__close');

    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Track current image for memory cleanup on close
    currentLightboxImageId = image.id;

    // Defensive: ensure any previous swipe/drag state is cleared before opening.
    resetLightboxSwipeState();

    if (modalImage) {
        // Show thumbnail first for instant feedback
        modalImage.src = image.url;
        modalImage.alt = image.prompt;
        modalImage.classList.add('modal__image--loading');
    }

    if (modalPrompt) {
        modalPrompt.textContent = image.prompt;
    }

    // Populate metadata (model and cost)
    const modalModel = modal.querySelector('#modal-model');
    const modalCost = modal.querySelector('#modal-cost');

    if (modalModel) {
        const modelName = image.generation?.model;
        // Show short model name (last part after /)
        modalModel.textContent = modelName
            ? modelName.split('/').pop() || modelName
            : '-';
        modalModel.title = modelName || '';
    }

    if (modalCost) {
        const cost = image.generation?.cost;
        if (typeof cost === 'number' && cost > 0) {
            // Format as USD with appropriate precision
            modalCost.textContent = cost < 0.01
                ? `$${cost.toFixed(4)}`
                : `$${cost.toFixed(3)}`;
        } else {
            modalCost.textContent = '-';
        }
    }

    if (downloadBtn) {
        downloadBtn.onclick = async () => {
            const fullUrl = await state.getFullImageUrl(image.id);
            downloadImage(fullUrl || image.url, `ai-image-${image.id}.png`);
        };
    }

    if (copyBtn) {
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(image.prompt);
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
                setTimeout(() => {
                    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };
    }

    // Add or update Remix button
    if (actionsContainer) {
        // Remove existing remix button if any
        const existingRemixBtn = actionsContainer.querySelector('.modal__remix-btn');
        if (existingRemixBtn) {
            existingRemixBtn.remove();
        }

        // Create new remix button
        const remixBtn = createElement('button', {
            className: 'modal__button modal__remix-btn',
            onClick: () => {
                window.dispatchEvent(new CustomEvent('remix-image', { detail: image }));
            }
        }, 'Remix');

        // Insert before download button
        actionsContainer.insertBefore(remixBtn, downloadBtn);
    }

    modal.classList.remove('modal--ui-hidden', 'modal--dragging');
    modal.classList.add('modal--active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-modal-open');

    lockBodyScroll();

    // Move focus into the dialog for better keyboard accessibility.
    if (closeBtn instanceof HTMLElement) {
        closeBtn.focus({ preventScroll: true });
    } else {
        modal.focus({ preventScroll: true });
    }

    // Load full resolution image after modal is visible
    if (modalImage) {
        const fullUrl = await state.getFullImageUrl(image.id);
        // Only update if modal is still open and we got a full URL
        if (fullUrl && modal.classList.contains('modal--active')) {
            modalImage.src = fullUrl;
        }
        modalImage.classList.remove('modal__image--loading');
    }
}

/**
 * Close lightbox modal
 */
export function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    modal.classList.remove('modal--active');
    modal.classList.remove('modal--ui-hidden', 'modal--dragging');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-modal-open');

    // Reset swipe-to-close state in case the modal is closed mid-gesture (e.g. ESC/backdrop).
    resetLightboxSwipeState();

    // Clean up full-resolution blob URL to free memory
    if (currentLightboxImageId) {
        state.revokeFullImageUrl(currentLightboxImageId);
        currentLightboxImageId = null;
    }

    unlockBodyScroll();

    if (lastFocusedElement instanceof HTMLElement) {
        lastFocusedElement.focus({ preventScroll: true });
        lastFocusedElement = null;
    }
}

/**
 * Initialize lightbox event listeners
 */
export function initLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.modal__close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeLightbox);
    }

    const modalContent = modal.querySelector('.modal__content');
    lightboxModalContentElement = modalContent instanceof HTMLElement ? modalContent : null;
    const modalImage = modal.querySelector('.modal__image');

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeLightbox();
        }
    });

    // Tap image to toggle UI (mobile-friendly "clean view")
    if (modalImage) {
        modalImage.addEventListener('click', () => {
            if (!modal.classList.contains('modal--active')) return;
            modal.classList.toggle('modal--ui-hidden');
        });
    }

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLightbox();
        }
    });

    // Swipe down to close (touch devices)
    if (modalContent) {
        const shouldIgnoreSwipe = (target) => {
            if (!(target instanceof Element)) return true;
            // Don't hijack scrolling inside the prompt / actions area.
            return Boolean(target.closest('.modal__info'));
        };

        modalContent.addEventListener('touchstart', (e) => {
            if (!modal.classList.contains('modal--active')) return;
            if (e.touches.length !== 1) return;
            if (shouldIgnoreSwipe(e.target)) return;

            lightboxSwipeState.startX = e.touches[0].clientX;
            lightboxSwipeState.startY = e.touches[0].clientY;
            lightboxSwipeState.startTime = Date.now();
            lightboxSwipeState.deltaY = 0;
            lightboxSwipeState.isActive = true;
        }, { passive: true });

        modalContent.addEventListener('touchmove', (e) => {
            if (!modal.classList.contains('modal--active')) {
                // If we somehow receive move events while closed, discard swipe state.
                resetLightboxSwipeState();
                return;
            }
            if (!lightboxSwipeState.isActive) return;
            if (e.touches.length !== 1) return;

            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - lightboxSwipeState.startX;
            const dy = y - lightboxSwipeState.startY;

            // Only treat as swipe-to-close when dragging downward more than sideways.
            if (dy <= 0 || Math.abs(dy) < Math.abs(dx)) return;

            lightboxSwipeState.deltaY = dy;
            modal.classList.add('modal--dragging');

            // Prevent rubber-banding while dragging.
            e.preventDefault();

            const translateY = Math.min(dy, window.innerHeight * 0.65);
            modalContent.style.transform = `translate3d(0, ${translateY}px, 0)`;
        }, { passive: false });

        const endSwipe = () => {
            if (!lightboxSwipeState.isActive) return;
            lightboxSwipeState.isActive = false;

            const elapsed = Math.max(Date.now() - lightboxSwipeState.startTime, 1);
            const velocity = lightboxSwipeState.deltaY / elapsed; // px/ms
            const shouldClose = lightboxSwipeState.deltaY > 110 || velocity > 0.85;

            modal.classList.remove('modal--dragging');
            modalContent.style.transform = '';

            if (shouldClose) {
                closeLightbox();
            }
        };

        modalContent.addEventListener('touchend', endSwipe, { passive: true });
        modalContent.addEventListener('touchcancel', endSwipe, { passive: true });
    }
}
