/**
 * Gallery module for rendering the grid
 */

import { createElement, downloadImage, responseToMediaBlob } from './utils.js';
import { state } from './state.js';

/** @type {HTMLElement|null} */
let galleryElement = null;

/** @type {HTMLElement|null} */
let emptyStateElement = null;

/** @type {Map<string, { element: HTMLElement, folderId: string|null }>} */
let placeholderElements = new Map();

/** @type {Map<string, number>} */
let confirmationTimeouts = new Map();

/** @type {Set<string>} */
let pendingDeletions = new Set();

/** @type {HTMLElement|null} */
let lastFocusedElement = null;

/** @type {string|null} */
let currentLightboxImageId = null;

/** @type {number} */
let lightboxLoadToken = 0;

/** @type {HTMLElement|null} */
let lightboxModalContentElement = null;

/** @type {number} */
let scrollYBeforeLock = 0;

/** @type {boolean} */
let isScrollLocked = false;

const ZIP_DOWNLOAD_THRESHOLD = 5;
const GALLERY_PAGE_SIZE = 48;
let jsZipLoaderPromise = null;

/** @type {IntersectionObserver|null} */
let lazyObserver = null;

/** @type {IntersectionObserver|null} */
let galleryPaginationObserver = null;

/** Number of filtered image cards currently mounted. */
let renderedImageCount = 0;

/**
 * Get or create the shared IntersectionObserver for lazy-loading gallery media.
 * Observed elements must have `data-lazy-src` set; on intersection the src is
 * applied and the element is unobserved.
 */
function getLazyObserver() {
    if (lazyObserver) return lazyObserver;

    lazyObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const el = entry.target;
            const imageId = el.dataset.lazyImageId;

            // For IndexedDB images, materialise the thumbnail blob URL on demand
            if (imageId) {
                const thumbUrl = state.getThumbnailUrl(imageId);
                if (thumbUrl) {
                    el.src = thumbUrl;
                }
            } else {
                // Fallback: use the stored data-lazy-src
                const src = el.dataset.lazySrc;
                if (src) el.src = src;
            }

            lazyObserver.unobserve(el);
        }
    }, { rootMargin: '200px' });

    return lazyObserver;
}

function getGalleryPaginationObserver() {
    if (galleryPaginationObserver) return galleryPaginationObserver;

    galleryPaginationObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
            appendNextGalleryPage();
        }
    }, { rootMargin: '800px 0px' });

    return galleryPaginationObserver;
}

function syncGalleryPaginationSentinel() {
    if (!galleryElement) return;

    galleryPaginationObserver?.disconnect();
    galleryElement.querySelector('.gallery__sentinel')?.remove();

    const images = state.getFilteredImages();
    if (renderedImageCount >= images.length) return;

    const sentinel = createElement('div', {
        className: 'gallery__sentinel',
        'aria-hidden': 'true',
    });
    galleryElement.appendChild(sentinel);
    getGalleryPaginationObserver().observe(sentinel);
}

function appendNextGalleryPage() {
    if (!galleryElement) return;

    const images = state.getFilteredImages();
    if (renderedImageCount >= images.length) {
        syncGalleryPaginationSentinel();
        return;
    }

    galleryPaginationObserver?.disconnect();
    galleryElement.querySelector('.gallery__sentinel')?.remove();

    const end = Math.min(renderedImageCount + GALLERY_PAGE_SIZE, images.length);
    const fragment = document.createDocumentFragment();
    images.slice(renderedImageCount, end).forEach((image) => {
        fragment.appendChild(createImageCard(image));
    });
    galleryElement.appendChild(fragment);
    renderedImageCount = end;
    syncGalleryPaginationSentinel();
}

/**
 * Swipe state for the lightbox (kept at module scope so it can be reset on close).
 * Handles both swipe-to-close (vertical) and swipe-to-navigate (horizontal).
 * @type {{startX:number,startY:number,startTime:number,deltaX:number,deltaY:number,isActive:boolean,direction:string|null}}
 */
const lightboxSwipeState = { startX: 0, startY: 0, startTime: 0, deltaX: 0, deltaY: 0, isActive: false, direction: null };

function resetLightboxSwipeState() {
    lightboxSwipeState.startX = 0;
    lightboxSwipeState.startY = 0;
    lightboxSwipeState.startTime = 0;
    lightboxSwipeState.deltaX = 0;
    lightboxSwipeState.deltaY = 0;
    lightboxSwipeState.isActive = false;
    lightboxSwipeState.direction = null;

    const modal = document.getElementById('lightbox-modal');
    if (modal) {
        modal.classList.remove('modal--dragging');
    }
    if (lightboxModalContentElement) {
        lightboxModalContentElement.style.transform = '';
    }
    const stageEl = document.querySelector('.modal__stage');
    if (stageEl instanceof HTMLElement) {
        stageEl.style.transform = '';
        stageEl.style.transition = '';
    }
}

function isCurrentLightboxLoad(modal, imageId, token) {
    return currentLightboxImageId === imageId
        && lightboxLoadToken === token
        && modal.classList.contains('modal--active');
}

function revokeStaleFullImageUrl(imageId, fullUrl) {
    if (fullUrl) {
        state.revokeFullImageUrl(imageId, fullUrl);
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
        deleteBtn.setAttribute('aria-label', 'Delete image');
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
        deleteBtn.setAttribute('aria-label', 'Confirm delete image');
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
                // Image goes to a different folder; nothing to render here
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
            // Toggle checkbox/delete visibility via a container class instead of
            // rebuilding every card (checkboxes already live in the DOM).
            applyEditModeUI();
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
    if (image.mediaType === 'video') {
        prependImageCard(image, true);
        updateEmptyState();
        return;
    }

    const img = new Image();
    img.src = image.url;

    const showImage = () => {
        // Clean up event handlers to allow garbage collection
        img.onload = null;
        img.onerror = null;
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

    // Disconnect stale observer entries before clearing DOM
    if (lazyObserver) {
        lazyObserver.disconnect();
    }
    galleryPaginationObserver?.disconnect();

    galleryElement.innerHTML = '';

    // Use filtered images based on folder selection and visibility settings
    const images = state.getFilteredImages();

    // Use DocumentFragment to batch DOM insertions (single reflow)
    const fragment = document.createDocumentFragment();

    // Re-attach in-flight placeholders that belong to this view (newest first).
    // Without this, switching folders mid-generation makes the shimmer disappear
    // and looks like generation was cancelled.
    placeholderElements.forEach(({ element, folderId }) => {
        if (shouldShowPlaceholderInCurrentView(folderId)) {
            fragment.appendChild(element);
        }
    });

    const initialImages = images.slice(0, GALLERY_PAGE_SIZE);
    initialImages.forEach(image => {
        const card = createImageCard(image);
        fragment.appendChild(card);
    });
    galleryElement.appendChild(fragment);
    renderedImageCount = initialImages.length;
    syncGalleryPaginationSentinel();

    // Keep the container's edit-mode class in sync with state (e.g. after a
    // folder switch while multi-select is active).
    galleryElement.classList.toggle('gallery--edit-mode', state.editMode);

    updateEmptyState();

    // Add edit mode action bar if in edit mode
    updateEditModeActionBar();
}

/**
 * Reflect edit-mode state on the existing gallery DOM without rebuilding cards.
 * Flips the container class (which drives checkbox/delete visibility via CSS)
 * and syncs each card's selection visual, checkbox state, and ARIA attributes.
 */
function applyEditModeUI() {
    if (!galleryElement) return;

    const isEditMode = state.editMode;
    galleryElement.classList.toggle('gallery--edit-mode', isEditMode);

    const cards = galleryElement.querySelectorAll('.gallery__card');
    cards.forEach((card) => {
        const id = card.dataset.id;
        const selected = isEditMode && !!id && state.selectedImageIds.has(id);

        card.classList.toggle('gallery__card--selected', selected);

        const checkbox = card.querySelector('.gallery__checkbox');
        if (checkbox instanceof HTMLInputElement) checkbox.checked = selected;

        const openBtn = card.querySelector('.gallery__open-btn');
        if (openBtn) {
            const media = card.querySelector('.gallery__image');
            const isVideo = media instanceof HTMLVideoElement;
            const label = media?.getAttribute('alt') || media?.getAttribute('aria-label') || 'Generated media';
            openBtn.setAttribute('aria-label', `${isEditMode ? 'Select' : 'Open'} ${isVideo ? 'video' : 'image'}: ${label}`);
            if (isEditMode) {
                openBtn.setAttribute('aria-pressed', String(selected));
            } else {
                openBtn.removeAttribute('aria-pressed');
            }
        }
    });
}

function getExtensionFromType(mimeType) {
    if (!mimeType) return 'png';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('jpeg')) return 'jpg';
    const [, subtype] = mimeType.split('/');
    if (!subtype) return 'png';
    return subtype.split(';')[0] || 'png';
}

function triggerBlobDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
}

async function loadJSZip() {
    if (window.JSZip) {
        return window.JSZip;
    }

    if (!jsZipLoaderPromise) {
        jsZipLoaderPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/public/vendor/jszip.min.js';
            script.async = true;
            script.onload = () => {
                if (window.JSZip) resolve(window.JSZip);
                else reject(new Error('JSZip failed to load from local vendor bundle'));
            };
            script.onerror = () => reject(new Error('Failed to load JSZip from local vendor bundle'));
            document.head.appendChild(script);
        }).catch((error) => {
            jsZipLoaderPromise = null;
            throw error;
        });
    }
    return jsZipLoaderPromise;
}

async function getImageBlobForDownload(imageId) {
    await state.ready;

    const image = state.getImage(imageId);
    if (!image || !image.url) return null;

    if (image.mediaType === 'video') {
        try {
            const fullUrl = await state.getFullImageUrl(imageId);
            const response = await fetch(fullUrl || image.url);
            return await responseToMediaBlob(response);
        } catch (error) {
            console.error(`Failed to fetch video ${imageId}:`, error);
            return null;
        }
    }

    if (!state.useFallback && state.storage) {
        try {
            const blob = await state.storage.getFullImageBlob(imageId);
            if (blob) return blob;
        } catch (error) {
            console.error(`Failed to read blob for image ${imageId}:`, error);
        }
    }

    try {
        const fullUrl = await state.getFullImageUrl(imageId);
        const response = await fetch(fullUrl || image.url);
        return await responseToMediaBlob(response);
    } catch (error) {
        console.error(`Failed to fetch image ${imageId}:`, error);
        return null;
    }
}

async function downloadImagesByIds(imageIds, button, options = {}) {
    const ids = Array.from(new Set(imageIds || []));
    if (ids.length === 0) return false;

    const originalText = button?.textContent || '';
    if (button) {
        button.disabled = true;
        button.dataset.loading = 'true';
        button.textContent = 'Preparing...';
    }

    try {
        const files = [];
        let failures = 0;
        for (const id of ids) {
            const blob = await getImageBlobForDownload(id);
            if (!blob) {
                failures += 1;
                continue;
            }
            const extension = getExtensionFromType(blob.type);
            files.push({ id, blob, extension, type: blob.type });
        }

        if (files.length === 0) {
            window.dispatchEvent(new CustomEvent('media-download-summary', {
                detail: { completed: 0, failed: failures },
            }));
            return false;
        }

        if (options.forceZip || files.length >= ZIP_DOWNLOAD_THRESHOLD) {
            if (button) button.textContent = 'Zipping...';
            try {
                const JSZip = await loadJSZip();
                const zip = new JSZip();
                files.forEach(({ id, blob, extension, type }) => {
                    const prefix = type?.startsWith('video') ? 'ai-video' : 'ai-image';
                    zip.file(`${prefix}-${id}.${extension}`, blob);
                });
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                triggerBlobDownload(zipBlob, options.zipFilename || `ai-media-${files.length}.zip`);
                if (failures) window.dispatchEvent(new CustomEvent('media-download-summary', { detail: { completed: files.length, failed: failures } }));
                return true;
            } catch (error) {
                console.error('Bulk zip download failed, falling back to individual downloads:', error);
            }
        }

        files.forEach(({ id, blob, extension, type }) => {
            const prefix = type?.startsWith('video') ? 'ai-video' : 'ai-image';
            triggerBlobDownload(blob, `${prefix}-${id}.${extension}`);
        });
        if (failures) {
            window.dispatchEvent(new CustomEvent('media-download-summary', {
                detail: { completed: files.length, failed: failures },
            }));
        }
        return true;
    } catch (error) {
        console.error('Failed to download images:', error);
        return false;
    } finally {
        if (button) {
            button.dataset.loading = 'false';
            button.textContent = originalText;
            button.disabled = typeof options.getDisabled === 'function' ? options.getDisabled() : false;
        }
    }
}

async function downloadSelectedImages(button) {
    await downloadImagesByIds(state.getSelectedImageIds(), button, {
        getDisabled: () => state.selectedImageIds.size === 0,
    });
}

export async function downloadAllImages(button) {
    const allIds = state.getImages().map((image) => image.id);
    return downloadImagesByIds(allIds, button, {
        zipFilename: `ai-media-${allIds.length}.zip`,
        forceZip: allIds.length > 1,
        getDisabled: () => state.getImageCount() === 0,
    });
}

/**
 * Update or create the edit mode floating action bar
 */
function updateEditModeActionBar() {
    const existingBar = document.getElementById('edit-mode-action-bar');
    document.body.classList.toggle('is-gallery-edit-mode', state.editMode);

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
            className: 'edit-mode-action-bar',
            role: 'toolbar',
            'aria-label': 'Photo selection actions'
        });
        const countSpan = createElement('span', {
            className: 'edit-mode-action-bar__count',
            'aria-live': 'polite'
        }, `${selectedCount} selected`);

        const downloadBtn = createElement('button', {
            className: 'edit-mode-action-bar__btn',
            type: 'button',
            disabled: selectedCount === 0,
            dataset: { action: 'download', loading: 'false' },
            onClick: (event) => {
                if (event?.currentTarget instanceof HTMLElement) {
                    downloadSelectedImages(event.currentTarget);
                }
            }
        }, 'Download Selected');

        const moveBtn = createElement('button', {
            className: 'edit-mode-action-bar__btn',
            type: 'button',
            disabled: selectedCount === 0,
            dataset: { action: 'move' },
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
        bar.appendChild(downloadBtn);
        bar.appendChild(moveBtn);
        bar.appendChild(selectAllBtn);
        bar.appendChild(cancelBtn);

        document.body.appendChild(bar);
    } else {
        // Update existing bar
        const countSpan = existingBar.querySelector('.edit-mode-action-bar__count');
        if (countSpan) countSpan.textContent = `${selectedCount} selected`;

        const moveBtn = existingBar.querySelector('[data-action="move"]');
        if (moveBtn) moveBtn.disabled = selectedCount === 0;

        const downloadBtn = existingBar.querySelector('[data-action="download"]');
        if (downloadBtn) {
            const isLoading = downloadBtn.dataset.loading === 'true';
            downloadBtn.disabled = isLoading || selectedCount === 0;
            if (!isLoading) {
                downloadBtn.textContent = 'Download Selected';
            }
        }
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

    const hasImages = state.getImageCount() > 0 || placeholderElements.size > 0;
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
    const isVideo = image.mediaType === 'video';

    const card = createElement('div', {
        className: `gallery__card${isEditMode && isSelected ? ' gallery__card--selected' : ''}`,
        dataset: { id: image.id }
    });

    // Checkbox is always in the DOM; its visibility (and the delete button's) is
    // gated by the `.gallery--edit-mode` class on the gallery container so that
    // toggling edit mode is a single class flip rather than a full re-render.
    const checkboxWrapper = createElement('label', {
        className: 'gallery__checkbox-wrapper',
        onClick: (e) => e.stopPropagation()
    });

    const checkbox = createElement('input', {
        type: 'checkbox',
        className: 'gallery__checkbox',
        checked: isSelected,
        'aria-label': `Select ${isVideo ? 'video' : 'image'}: ${image.prompt || 'Generated media'}`,
        onChange: () => {
            state.toggleImageSelection(image.id);
            // Update card's selected state
            const selected = state.selectedImageIds.has(image.id);
            card.classList.toggle('gallery__card--selected', selected);
            openButton.setAttribute('aria-pressed', String(selected));
        }
    });

    const checkmark = createElement('span', { className: 'gallery__checkmark' });

    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(checkmark);
    card.appendChild(checkboxWrapper);

    // Delete button (hidden in edit mode)
    const deleteBtn = createElement('button', {
        className: 'gallery__delete-btn',
        type: 'button',
        title: 'Delete image',
        'aria-label': 'Delete image',
        onClick: async (e) => {
            e.stopPropagation();

            if (pendingDeletions.has(image.id)) {
                // Second press - confirm deletion
                resetConfirmationState(image.id);
                try {
                    await state.removeImage(image.id);
                } catch (error) {
                    console.error('Failed to delete image:', error);
                }
            } else {
                // First press - show confirmation
                handleFirstDeletePress(image.id);
            }
        }
    }, '✕');

    // Image or video element
    // For non-preloaded images we defer setting src until the card enters the
    // viewport via IntersectionObserver.  This also defers thumbnail blob-URL
    // creation (see state.getThumbnailUrl) so startup doesn't pay the cost for
    // off-screen images.
    const needsLazy = !preloaded && !isVideo;
    const resolvedSrc = needsLazy ? '' : image.url;
    const videoUrl = isVideo ? (image.sourceUrl || image.url || '') : '';
    const videoAttributes = {
        className: preloaded ? 'gallery__image gallery__image--loaded' : 'gallery__image gallery__image--loading',
        preload: 'metadata',
        'aria-label': image.prompt
    };
    if (videoUrl) {
        videoAttributes.src = videoUrl;
    }

    const media = isVideo
        ? createElement('video', videoAttributes)
        : createElement('img', {
            className: preloaded ? 'gallery__image gallery__image--loaded' : 'gallery__image gallery__image--loading',
            src: resolvedSrc,
            alt: image.prompt,
            decoding: 'async',
            ...(needsLazy ? {} : { loading: 'lazy' })
        });

    // Register non-preloaded images with the IntersectionObserver
    if (needsLazy && media instanceof HTMLImageElement) {
        media.dataset.lazyImageId = image.id;
        if (image.url) media.dataset.lazySrc = image.url;
        getLazyObserver().observe(media);
    }

    if (media instanceof HTMLVideoElement) {
        media.muted = true;
        media.defaultMuted = true;
        media.autoplay = true;
        media.loop = true;
        media.playsInline = true;
    }

    if (!preloaded) {
        const handleLoaded = () => {
            media.classList.replace('gallery__image--loading', 'gallery__image--loaded');
            media.removeEventListener('load', handleLoaded);
            media.removeEventListener('loadeddata', handleLoaded);
        };
        media.addEventListener('load', handleLoaded);
        media.addEventListener('loadeddata', handleLoaded);
    }

    const openButton = createElement('button', {
        className: 'gallery__open-btn',
        type: 'button',
        'aria-label': `${isEditMode ? 'Select' : 'Open'} ${isVideo ? 'video' : 'image'}: ${image.prompt || 'Generated media'}`,
        ...(isEditMode ? { 'aria-pressed': String(isSelected) } : {}),
        onClick: () => {
            if (state.editMode) {
                state.toggleImageSelection(image.id);
                const selected = state.selectedImageIds.has(image.id);
                card.classList.toggle('gallery__card--selected', selected);
                openButton.setAttribute('aria-pressed', String(selected));
                // Update checkbox state
                const checkbox = card.querySelector('.gallery__checkbox');
                if (checkbox) checkbox.checked = selected;
            } else {
                openLightbox(image);
            }
        }
    });

    openButton.appendChild(media);
    card.appendChild(openButton);
    card.appendChild(deleteBtn);

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
    card.classList.add('gallery__card--enter');
    galleryElement.insertBefore(card, galleryElement.firstChild);
    renderedImageCount += 1;
    syncGalleryPaginationSentinel();

    requestAnimationFrame(() => {
        card.classList.add('gallery__card--enter-active');
    });
}

/**
 * Remove an image card from the gallery
 * @param {string} id - Image ID
 */
function removeImageCard(id) {
    if (!galleryElement) return;

    const card = galleryElement.querySelector(`[data-id="${id}"]`);
    if (card) {
        renderedImageCount = Math.max(0, renderedImageCount - 1);
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
                card.removeEventListener('transitionend', handleTransitionEnd);
                card.remove();
            }
        }, 300);

        // Clean up confirmation state when image is removed
        resetConfirmationState(id);
        syncGalleryPaginationSentinel();
    }
}

/**
 * Show loading placeholder with premium golden shimmer
 * @param {string} placeholderId - Unique ID for this placeholder
 * @param {string|null} [folderId=null] - Folder this generation belongs to
 *   (so we know whether to display the placeholder in the current view).
 */
export function showPlaceholder(placeholderId, folderId = null) {
    if (!galleryElement) return;

    const placeholder = createElement('div', {
        className: 'gallery__placeholder',
        'data-placeholder-id': placeholderId
    });

    // Add inner layers for enhanced shimmer effect
    const innerShimmer = createElement('div', {
        className: 'gallery__placeholder-inner'
    });
    const glowEffect = createElement('div', {
        className: 'gallery__placeholder-glow'
    });

    placeholder.appendChild(innerShimmer);
    placeholder.appendChild(glowEffect);

    placeholderElements.set(placeholderId, { element: placeholder, folderId: folderId ?? null });
    if (shouldShowPlaceholderInCurrentView(folderId ?? null)) {
        galleryElement.insertBefore(placeholder, galleryElement.firstChild);
    }
    updateEmptyState();
}

/**
 * Remove loading placeholder by ID
 * @param {string} placeholderId - Unique ID for this placeholder
 */
export function removePlaceholder(placeholderId) {
    const entry = placeholderElements.get(placeholderId);
    if (entry) {
        entry.element.remove();
        placeholderElements.delete(placeholderId);
        updateEmptyState();
    }
}

/**
 * Remove all loading placeholders
 */
export function removeAllPlaceholders() {
    placeholderElements.forEach(({ element }) => element.remove());
    placeholderElements.clear();
    updateEmptyState();
}

/**
 * Decide whether a placeholder for `folderId` should be visible in the
 * current folder + visibility-mode combination. Mirrors shouldShowImageInCurrentView.
 * @param {string|null} folderId
 * @returns {boolean}
 */
function shouldShowPlaceholderInCurrentView(folderId) {
    const visibilityMode = state.getPhotoVisibilityMode();
    const selectedFolder = state.selectedFolderId;
    const phFolderId = folderId || null;

    if (selectedFolder === null) {
        return visibilityMode === 'all' ? true : phFolderId === null;
    }
    return phFolderId === selectedFolder;
}

/**
 * Replace a placeholder with an error card
 * @param {string} placeholderId - Unique ID for the placeholder
 * @param {string} errorMessage - Error message to display
 * @param {string} prompt - Original prompt
 * @param {Function} onRetry - Retry callback
 */
export function showErrorCard(placeholderId, errorMessage, prompt, onRetry) {
    const entry = placeholderElements.get(placeholderId);
    if (!entry || !galleryElement) return;
    const placeholder = entry.element;
    const icon = createElement('div', { className: 'gallery__error-card-icon' });
    icon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
    `;

    const errorCard = createElement('div', {
        className: 'gallery__error-card',
        'data-error-id': placeholderId
    }, [
        icon,
        createElement('div', { className: 'gallery__error-card-message' }, errorMessage),
        createElement('div', { className: 'gallery__error-card-actions' }, [
            createElement('button', {
                className: 'gallery__error-card-btn gallery__error-card-btn--retry',
                onClick: () => {
                    errorCard.remove();
                    onRetry();
                }
            }, 'Retry'),
            createElement('button', {
                className: 'gallery__error-card-btn gallery__error-card-btn--copy',
                onClick: async () => {
                    try {
                        await navigator.clipboard.writeText(errorMessage);
                        // Show success feedback
                        const btn = errorCard.querySelector('.gallery__error-card-btn--copy');
                        if (btn) {
                            const originalText = btn.textContent;
                            btn.textContent = 'Copied!';
                            setTimeout(() => {
                                btn.textContent = originalText;
                            }, 2000);
                        }
                    } catch (err) {
                        console.error('Failed to copy error:', err);
                    }
                }
            }, 'Copy Error'),
            createElement('button', {
                className: 'gallery__error-card-btn gallery__error-card-btn--remove',
                onClick: () => {
                    errorCard.remove();
                    updateEmptyState();
                }
            }, '×')
        ])
    ]);

    // Replace placeholder with error card
    placeholder.replaceWith(errorCard);
    placeholderElements.delete(placeholderId);
}

/**
 * Open lightbox modal
 * @param {Object} image - Image data
 */
async function openLightbox(image) {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    const modalImage = modal.querySelector('.modal__image--photo');
    const modalVideo = modal.querySelector('.modal__image--video');
    const modalPrompt = modal.querySelector('.modal__prompt');
    const downloadBtn = modal.querySelector('.modal__download-btn');
    const shareBtn = modal.querySelector('.modal__share-btn');
    const copyBtn = modal.querySelector('.modal__copy-btn');
    const actionsContainer = modal.querySelector('.modal__actions');
    const closeBtn = modal.querySelector('.modal__close');

    if (!modal.classList.contains('modal--active')) {
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    // Track current image for memory cleanup on close
    currentLightboxImageId = image.id;
    const loadToken = ++lightboxLoadToken;

    // Defensive: ensure any previous swipe/drag state is cleared before opening.
    resetLightboxSwipeState();

    if (image.mediaType === 'video') {
        if (modalVideo) {
            const videoUrl = image.sourceUrl || image.url || '';
            modalVideo.style.display = 'block';
            if (videoUrl) {
                modalVideo.src = videoUrl;
            } else {
                modalVideo.removeAttribute('src');
            }
            modalVideo.classList.add('modal__image--loading');
            modalVideo.load();
        }
        if (modalImage) {
            modalImage.style.display = 'none';
            modalImage.src = '';
        }
    } else if (modalImage) {
        modalImage.style.display = '';
        // Use lazy-resolved thumbnail as immediate preview; full-res loads below
        modalImage.src = state.getThumbnailUrl(image.id) || image.url;
        modalImage.alt = image.prompt;
        modalImage.classList.add('modal__image--loading');
        if (modalVideo) {
            modalVideo.style.display = 'none';
            modalVideo.src = '';
        }
    }

    if (modalPrompt) {
        modalPrompt.textContent = image.prompt;
    }

    // Populate metadata (model and cost)
    const modalModel = modal.querySelector('#modal-model');
    const modalCost = modal.querySelector('#modal-cost');
    const modalCreated = modal.querySelector('#modal-created');
    const modalPosition = modal.querySelector('#modal-position');

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

    if (modalCreated) {
        const createdAt = Number(image.createdAt);
        modalCreated.textContent = Number.isFinite(createdAt)
            ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(createdAt)
            : '-';
    }

    if (modalPosition) {
        const images = state.getFilteredImages();
        const currentIndex = images.findIndex((item) => item.id === image.id);
        modalPosition.textContent = currentIndex >= 0
            ? `${currentIndex + 1} of ${images.length}`
            : `1 of ${Math.max(images.length, 1)}`;
    }

    if (downloadBtn) {
        downloadBtn.onclick = async () => {
            const fullUrl = await state.getFullImageUrl(image.id);
            const filename = image.mediaType === 'video'
                ? `ai-video-${image.id}.mp4`
                : `ai-image-${image.id}.png`;
            downloadImage(fullUrl || image.url, filename);
        };
    }

    if (shareBtn) {
        if (!navigator.share) {
            shareBtn.style.display = 'none';
        } else {
            shareBtn.style.display = '';
            shareBtn.onclick = async () => {
                const originalText = shareBtn.textContent;
                shareBtn.disabled = true;
                shareBtn.textContent = 'Sharing...';
                try {
                    const blob = await getImageBlobForDownload(image.id);
                    if (!blob) throw new Error('Missing image blob');
                    const extension = getExtensionFromType(blob.type);
                    const defaultType = image.mediaType === 'video' ? 'video/mp4' : 'image/png';
                    const file = new File([blob], `ai-media-${image.id}.${extension}`, {
                        type: blob.type || defaultType
                    });
                    const shareData = {
                        files: [file],
                        title: image.mediaType === 'video' ? 'AI Generated Video' : 'AI Generated Image',
                        text: image.prompt
                    };
                    if (navigator.canShare && !navigator.canShare(shareData)) {
                        throw new Error('Cannot share file payload');
                    }
                    await navigator.share(shareData);
                } catch (error) {
                    console.error('Share failed, falling back to download:', error);
                    const fullUrl = await state.getFullImageUrl(image.id);
                    const filename = image.mediaType === 'video'
                        ? `ai-video-${image.id}.mp4`
                        : `ai-image-${image.id}.png`;
                    downloadImage(fullUrl || image.url, filename);
                } finally {
                    shareBtn.textContent = originalText;
                    shareBtn.disabled = false;
                }
            };
        }
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
        // Remove existing dynamic buttons
        const existingRemixBtn = actionsContainer.querySelector('.modal__remix-btn');
        if (existingRemixBtn) {
            existingRemixBtn.remove();
        }
        const existingAnimateBtn = actionsContainer.querySelector('.modal__animate-btn');
        if (existingAnimateBtn) {
            existingAnimateBtn.remove();
        }

        // Create Remix button
        const remixBtn = createElement('button', {
            className: 'modal__button modal__remix-btn',
            onClick: () => {
                window.dispatchEvent(new CustomEvent('remix-image', { detail: image }));
            }
        }, 'Remix');

        // Insert before download button
        actionsContainer.insertBefore(remixBtn, downloadBtn);

        // Create Animate button (only for images, not videos)
        if (image.mediaType !== 'video') {
            const animateBtn = createElement('button', {
                className: 'modal__button modal__button--accent modal__animate-btn',
                title: 'Animate this image into a video',
                onClick: () => {
                    window.dispatchEvent(new CustomEvent('animate-image', { detail: image }));
                }
            });
            // Add video icon SVG
            animateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Animate`;
            actionsContainer.appendChild(animateBtn);
        }
    }

    const modalInfo = modal.querySelector('.modal__info');
    const infoToggle = modal.querySelector('.modal__info-toggle');
    const shouldCollapseDetails = window.matchMedia('(max-width: 768px)').matches;
    modalInfo?.classList.toggle('modal__info--collapsed', shouldCollapseDetails);
    infoToggle?.setAttribute('aria-expanded', String(!shouldCollapseDetails));

    modal.classList.remove('modal--ui-hidden', 'modal--dragging');
    modal.classList.add('modal--active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-modal-open');

    lockBodyScroll();
    updateNavButtons();

    // Move focus into the dialog for better keyboard accessibility.
    if (closeBtn instanceof HTMLElement) {
        closeBtn.focus({ preventScroll: true });
    } else {
        modal.focus({ preventScroll: true });
    }

    // Load full resolution media after modal is visible
    if (image.mediaType === 'video' && modalVideo) {
        const fullUrl = await state.getFullImageUrl(image.id);
        if (!isCurrentLightboxLoad(modal, image.id, loadToken)) {
            revokeStaleFullImageUrl(image.id, fullUrl);
            return;
        }
        if (fullUrl) {
            modalVideo.src = fullUrl;
            modalVideo.load();
            modalVideo.play().catch((error) => {
                console.debug('Video autoplay was blocked:', error);
            });
        }
        modalVideo.classList.remove('modal__image--loading');
    } else if (modalImage) {
        const fullUrl = await state.getFullImageUrl(image.id);
        if (!isCurrentLightboxLoad(modal, image.id, loadToken)) {
            revokeStaleFullImageUrl(image.id, fullUrl);
            return;
        }
        if (fullUrl) {
            modalImage.src = fullUrl;
        }
        modalImage.classList.remove('modal__image--loading');
    }
}

/**
 * Navigate to the next or previous image in the lightbox.
 * @param {'next'|'prev'} direction
 */
function navigateLightbox(direction) {
    if (!currentLightboxImageId) return;

    const images = state.getFilteredImages();
    if (images.length <= 1) return;

    const currentIndex = images.findIndex(img => img.id === currentLightboxImageId);
    if (currentIndex === -1) return;

    let nextIndex;
    if (direction === 'next') {
        nextIndex = currentIndex + 1;
        if (nextIndex >= images.length) return; // at the end
    } else {
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) return; // at the start
    }

    const nextImage = images[nextIndex];

    // Revoke the previous image's blob URL before opening the next one
    if (currentLightboxImageId) {
        state.revokeFullImageUrl(currentLightboxImageId);
    }

    openLightbox(nextImage);
    updateNavButtons();
}

/**
 * Update the visibility of lightbox navigation buttons based on current position.
 */
function updateNavButtons() {
    const prevBtn = document.querySelector('.modal__nav-btn--prev');
    const nextBtn = document.querySelector('.modal__nav-btn--next');
    if (!prevBtn || !nextBtn) return;

    const images = state.getFilteredImages();
    if (images.length <= 1) {
        prevBtn.classList.add('modal__nav-btn--hidden');
        nextBtn.classList.add('modal__nav-btn--hidden');
        return;
    }

    const currentIndex = images.findIndex(img => img.id === currentLightboxImageId);
    prevBtn.classList.toggle('modal__nav-btn--hidden', currentIndex <= 0);
    nextBtn.classList.toggle('modal__nav-btn--hidden', currentIndex >= images.length - 1);
}

/**
 * Close lightbox modal
 */
export function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    const modalVideo = modal.querySelector('.modal__image--video');
    const modalInfo = modal.querySelector('.modal__info');
    const infoToggle = modal.querySelector('.modal__info-toggle');

    infoToggle?.addEventListener('click', () => {
        if (!(modalInfo instanceof HTMLElement)) return;
        const collapsed = modalInfo.classList.toggle('modal__info--collapsed');
        infoToggle.setAttribute('aria-expanded', String(!collapsed));
    });
    if (modalVideo instanceof HTMLVideoElement) {
        modalVideo.style.display = 'none';
        modalVideo.pause();
        modalVideo.removeAttribute('src');
        modalVideo.load();
    }

    modal.classList.remove('modal--active');
    modal.classList.remove('modal--ui-hidden', 'modal--dragging');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-modal-open');

    // Reset swipe state in case the modal is closed mid-gesture (e.g. ESC/backdrop).
    resetLightboxSwipeState();

    // Hide nav buttons
    const prevBtn = document.querySelector('.modal__nav-btn--prev');
    const nextBtn = document.querySelector('.modal__nav-btn--next');
    if (prevBtn) prevBtn.classList.add('modal__nav-btn--hidden');
    if (nextBtn) nextBtn.classList.add('modal__nav-btn--hidden');

    // Clean up full-resolution blob URL to free memory
    if (currentLightboxImageId) {
        state.revokeFullImageUrl(currentLightboxImageId);
        currentLightboxImageId = null;
    }
    lightboxLoadToken += 1;

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
    const modalImage = modal.querySelector('.modal__image--photo');
    const modalVideo = modal.querySelector('.modal__image--video');

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeLightbox();
        }
    });

    // Tap image to toggle UI (mobile-friendly "clean view")
    let suppressNextImageClick = false;
    const toggleUi = (e) => {
        if (!modal.classList.contains('modal--active')) return;
        if (suppressNextImageClick) {
            suppressNextImageClick = false;
            e?.preventDefault?.();
            return;
        }
        modal.classList.toggle('modal--ui-hidden');
    };

    if (modalImage) {
        modalImage.addEventListener('click', toggleUi);
    }

    // Keyboard navigation: Escape to close, Arrow keys to navigate
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('modal--active')) return;
        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                navigateLightbox('prev');
                break;
            case 'ArrowRight':
                navigateLightbox('next');
                break;
        }
    });

    // Navigation button click handlers
    const prevBtn = modal.querySelector('.modal__nav-btn--prev');
    const nextBtn = modal.querySelector('.modal__nav-btn--next');
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateLightbox('prev');
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateLightbox('next');
        });
    }

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
            lightboxSwipeState.deltaX = 0;
            lightboxSwipeState.deltaY = 0;
            lightboxSwipeState.isActive = true;
            lightboxSwipeState.direction = null;
        }, { passive: true });

        modalContent.addEventListener('touchmove', (e) => {
            if (!modal.classList.contains('modal--active')) {
                resetLightboxSwipeState();
                return;
            }
            if (!lightboxSwipeState.isActive) return;
            if (e.touches.length !== 1) return;

            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - lightboxSwipeState.startX;
            const dy = y - lightboxSwipeState.startY;

            // Lock direction on first significant movement
            if (!lightboxSwipeState.direction) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                lightboxSwipeState.direction = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
            }

            if (lightboxSwipeState.direction === 'horizontal') {
                lightboxSwipeState.deltaX = dx;
                e.preventDefault();

                const stageEl = modal.querySelector('.modal__stage');
                if (stageEl instanceof HTMLElement) {
                    const resistance = 0.4;
                    const translateX = dx * resistance;
                    stageEl.style.transition = 'none';
                    stageEl.style.transform = `translate3d(${translateX}px, 0, 0)`;
                }
                return;
            }

            // Vertical: swipe-to-close (existing behaviour)
            if (dy <= 0 || Math.abs(dy) < Math.abs(dx)) return;

            lightboxSwipeState.deltaY = dy;
            modal.classList.add('modal--dragging');
            e.preventDefault();

            const translateY = Math.min(dy, window.innerHeight * 0.65);
            modalContent.style.transform = `translate3d(0, ${translateY}px, 0)`;
        }, { passive: false });

        const endSwipe = () => {
            if (!lightboxSwipeState.isActive) return;
            lightboxSwipeState.isActive = false;

            const elapsed = Math.max(Date.now() - lightboxSwipeState.startTime, 1);
            const direction = lightboxSwipeState.direction;

            if (direction === 'horizontal') {
                const velocityX = lightboxSwipeState.deltaX / elapsed;
                const absDx = Math.abs(lightboxSwipeState.deltaX);
                const shouldNav = absDx > 50 || Math.abs(velocityX) > 0.3;

                const stageEl = modal.querySelector('.modal__stage');
                if (stageEl instanceof HTMLElement) {
                    stageEl.style.transition = 'transform 0.25s ease';
                    stageEl.style.transform = '';
                    stageEl.addEventListener('transitionend', () => {
                        stageEl.style.transition = '';
                    }, { once: true });
                }

                if (shouldNav && absDx > 8) {
                    suppressNextImageClick = true;
                    navigateLightbox(lightboxSwipeState.deltaX < 0 ? 'next' : 'prev');
                } else if (absDx > 6) {
                    suppressNextImageClick = true;
                }

                lightboxSwipeState.direction = null;
                lightboxSwipeState.deltaX = 0;
                return;
            }

            // Vertical: swipe-to-close
            const velocity = lightboxSwipeState.deltaY / elapsed;
            const shouldClose = lightboxSwipeState.deltaY > 110 || velocity > 0.85;
            const wasDragged = lightboxSwipeState.deltaY > 6;

            modal.classList.remove('modal--dragging');
            modalContent.style.transform = '';

            if (wasDragged) {
                suppressNextImageClick = true;
            }

            if (shouldClose) {
                closeLightbox();
            }
        };

        modalContent.addEventListener('touchend', endSwipe, { passive: true });
        modalContent.addEventListener('touchcancel', endSwipe, { passive: true });
    }
}
