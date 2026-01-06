/**
 * State management module with IndexedDB persistence
 * Migrates from localStorage automatically on first load
 */

import { ImageStorage } from './storage.js';
import { dataUriToBlob, generateThumbnail, createBlobUrl, revokeBlobUrl } from './image-utils.js';

const LEGACY_STORAGE_KEY = 'ai-image-generator-images';

/**
 * @typedef {Object} ImageData
 * @property {string} id - Unique identifier
 * @property {string} url - Image URL (thumbnail for display, use getFullImageUrl for full)
 * @property {string} prompt - Generation prompt
 * @property {number} createdAt - Timestamp
 * @property {Object} [settings] - Generation settings
 * @property {string|null} [folderId] - Folder ID or null for uncategorized
 * @property {Object} [generation] - Generation metadata
 * @property {string} [generation.model] - Model used for generation
 * @property {number} [generation.cost] - Cost in USD
 * @property {string} [generation.provider] - Provider name
 */

/**
 * @typedef {Object} Folder
 * @property {string} id - Unique folder identifier
 * @property {string} name - Display name
 * @property {number} createdAt - Timestamp
 * @property {number} order - Sort order in sidebar
 */

const PHOTO_VISIBILITY_KEY = 'photo_visibility_mode';

/**
 * State class to manage images with IndexedDB storage
 */
class State {
    constructor() {
        /** @type {ImageData[]} */
        this.images = [];
        /** @type {Folder[]} */
        this.folders = [];
        /** @type {string|null} */
        this.selectedFolderId = null;
        /** @type {boolean} */
        this.editMode = false;
        /** @type {Set<string>} */
        this.selectedImageIds = new Set();
        this.listeners = new Set();
        /** @type {Map<string, string>} */
        this.blobUrls = new Map();
        /** @type {ImageStorage|null} */
        this.storage = null;
        /** @type {boolean} */
        this.useFallback = false;
        /** @type {'all'|'folder-only'} - Cached photo visibility mode */
        this._photoVisibilityMode = null;

        // Ready promise for async initialization
        this.ready = this.init();
    }

    /**
     * Initialize storage (IndexedDB with localStorage fallback)
     */
    async init() {
        if (!ImageStorage.isSupported()) {
            console.warn('IndexedDB not supported, using localStorage fallback');
            this.useFallback = true;
            this.loadFromLocalStorage();
            return;
        }

        try {
            this.storage = new ImageStorage();
            await this.storage.ready;

            // Check for legacy localStorage data to migrate
            const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyData) {
                await this.migrateFromLocalStorage(legacyData);
            }

            await this.loadFromIndexedDB();
            await this.loadFoldersFromIndexedDB();
        } catch (error) {
            console.error('IndexedDB init failed, using localStorage fallback:', error);
            this.useFallback = true;
            this.loadFromLocalStorage();
        }
    }

    /**
     * Migrate images from localStorage to IndexedDB
     * @param {string} legacyJson
     */
    async migrateFromLocalStorage(legacyJson) {
        try {
            const legacyImages = JSON.parse(legacyJson);
            if (!Array.isArray(legacyImages) || legacyImages.length === 0) {
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                return;
            }

            console.log(`Migrating ${legacyImages.length} images from localStorage...`);

            for (const img of legacyImages) {
                if (img.url && img.url.startsWith('data:')) {
                    try {
                        const fullBlob = dataUriToBlob(img.url);
                        const thumbnailBlob = await generateThumbnail(fullBlob);

                        await this.storage.saveImage(
                            {
                                id: img.id,
                                prompt: img.prompt,
                                createdAt: img.createdAt,
                                settings: img.settings
                            },
                            fullBlob,
                            thumbnailBlob
                        );
                    } catch (err) {
                        console.error(`Failed to migrate image ${img.id}:`, err);
                    }
                }
            }

            // Only remove localStorage after successful migration
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            console.log('Migration complete');
        } catch (error) {
            console.error('Migration failed:', error);
        }
    }

    /**
     * Load images from IndexedDB
     */
    async loadFromIndexedDB() {
        const images = await this.storage.getAllImages();

        this.images = images.map(img => {
            let thumbnailUrl = null;
            if (img.thumbnailBlob) {
                thumbnailUrl = createBlobUrl(img.thumbnailBlob);
                this.blobUrls.set(`${img.id}-thumb`, thumbnailUrl);
            }

            return {
                id: img.id,
                url: thumbnailUrl || '', // Use thumbnail URL for display
                prompt: img.prompt,
                createdAt: img.createdAt,
                settings: img.settings,
                folderId: img.folderId || null,
                generation: img.generation || null
            };
        });
    }

    /**
     * Load folders from IndexedDB
     */
    async loadFoldersFromIndexedDB() {
        if (this.useFallback || !this.storage) {
            // Fallback: load from localStorage
            try {
                const stored = localStorage.getItem('ai-image-generator-folders');
                if (stored) {
                    this.folders = JSON.parse(stored);
                }
            } catch (error) {
                console.error('Failed to load folders from localStorage:', error);
                this.folders = [];
            }
            return;
        }

        try {
            this.folders = await this.storage.getAllFolders();
        } catch (error) {
            console.error('Failed to load folders:', error);
            this.folders = [];
        }
    }

    /**
     * Load images from localStorage (fallback)
     */
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (stored) {
                this.images = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            this.images = [];
        }
    }

    /**
     * Save to localStorage (fallback mode only)
     */
    saveToLocalStorage() {
        try {
            localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(this.images));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    /**
     * Get all images
     * @returns {ImageData[]}
     */
    getImages() {
        return [...this.images];
    }

    /**
     * Add a new image (prepend to start)
     * @param {Object} imageData - Image data with url (data URI)
     */
    async addImage(imageData) {
        await this.ready;

        if (this.useFallback) {
            // Fallback: store directly in localStorage
            this.images.unshift(imageData);
            this.saveToLocalStorage();
            this.notifyListeners('add', imageData);
            return;
        }

        try {
            const dataUri = imageData.url;
            const fullBlob = dataUriToBlob(dataUri);
            const thumbnailBlob = await generateThumbnail(fullBlob);

            const metadata = {
                id: imageData.id,
                prompt: imageData.prompt,
                createdAt: imageData.createdAt,
                settings: imageData.settings,
                folderId: imageData.folderId || null,
                generation: imageData.generation || null
            };

            await this.storage.saveImage(metadata, fullBlob, thumbnailBlob);

            // Create thumbnail URL for display
            const thumbnailUrl = createBlobUrl(thumbnailBlob);
            this.blobUrls.set(`${metadata.id}-thumb`, thumbnailUrl);

            const inMemoryImage = {
                ...metadata,
                url: thumbnailUrl
            };

            this.images.unshift(inMemoryImage);
            this.notifyListeners('add', inMemoryImage);
        } catch (error) {
            console.error('Failed to add image:', error);
            // Fallback: try to store the original data URI
            this.images.unshift(imageData);
            this.notifyListeners('add', imageData);
        }
    }

    /**
     * Get full resolution image URL (for lightbox)
     * @param {string} id - Image ID
     * @returns {Promise<string|null>}
     */
    async getFullImageUrl(id) {
        await this.ready;

        if (this.useFallback) {
            // In fallback mode, url is already the full image
            const image = this.images.find(img => img.id === id);
            return image ? image.url : null;
        }

        // Check if we already have a blob URL for this full image
        const existingUrl = this.blobUrls.get(`${id}-full`);
        if (existingUrl) {
            return existingUrl;
        }

        try {
            const blob = await this.storage.getFullImageBlob(id);
            if (!blob) return null;

            const url = createBlobUrl(blob);
            this.blobUrls.set(`${id}-full`, url);
            return url;
        } catch (error) {
            console.error('Failed to get full image:', error);
            return null;
        }
    }

    /**
     * Revoke full-resolution blob URL to free memory (call when lightbox closes)
     * @param {string} id - Image ID
     */
    revokeFullImageUrl(id) {
        const fullUrl = this.blobUrls.get(`${id}-full`);
        if (fullUrl) {
            revokeBlobUrl(fullUrl);
            this.blobUrls.delete(`${id}-full`);
        }
    }

    /**
     * Revoke all cached full-resolution blob URLs (memory cleanup)
     */
    revokeAllFullImageUrls() {
        for (const [key, url] of this.blobUrls.entries()) {
            if (key.endsWith('-full')) {
                revokeBlobUrl(url);
                this.blobUrls.delete(key);
            }
        }
    }

    /**
     * Remove an image by ID
     * @param {string} id
     */
    async removeImage(id) {
        await this.ready;

        const index = this.images.findIndex(img => img.id === id);
        if (index === -1) return;

        const removed = this.images.splice(index, 1)[0];

        // Revoke blob URLs
        const thumbUrl = this.blobUrls.get(`${id}-thumb`);
        const fullUrl = this.blobUrls.get(`${id}-full`);
        if (thumbUrl) {
            revokeBlobUrl(thumbUrl);
            this.blobUrls.delete(`${id}-thumb`);
        }
        if (fullUrl) {
            revokeBlobUrl(fullUrl);
            this.blobUrls.delete(`${id}-full`);
        }

        if (this.useFallback) {
            this.saveToLocalStorage();
        } else {
            try {
                await this.storage.deleteImage(id);
            } catch (error) {
                console.error('Failed to delete from IndexedDB:', error);
            }
        }

        this.notifyListeners('remove', removed);
    }

    /**
     * Get image by ID
     * @param {string} id
     * @returns {ImageData|undefined}
     */
    getImage(id) {
        return this.images.find(img => img.id === id);
    }

    /**
     * Clear all images
     */
    async clearAll() {
        await this.ready;

        // Revoke all blob URLs
        this.blobUrls.forEach((url) => revokeBlobUrl(url));
        this.blobUrls.clear();

        this.images = [];

        if (this.useFallback) {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        } else {
            try {
                await this.storage.clear();
            } catch (error) {
                console.error('Failed to clear IndexedDB:', error);
            }
        }

        this.notifyListeners('clear', null);
    }

    /**
     * Get storage estimate
     * @returns {Promise<{used: number, quota: number}>}
     */
    async getStorageEstimate() {
        if (this.useFallback || !this.storage) {
            return { used: 0, quota: 0 };
        }
        return this.storage.getStorageEstimate();
    }

    // ========== Folder Management ==========

    /**
     * Get all folders
     * @returns {Folder[]}
     */
    getFolders() {
        return [...this.folders];
    }

    /**
     * Get folder by ID
     * @param {string} id
     * @returns {Folder|undefined}
     */
    getFolder(id) {
        return this.folders.find(f => f.id === id);
    }

    /**
     * Add a new folder
     * @param {string} name - Folder name
     * @returns {Promise<Folder>}
     */
    async addFolder(name) {
        await this.ready;

        const folder = {
            id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            createdAt: Date.now(),
            order: this.folders.length
        };

        if (!this.useFallback && this.storage) {
            await this.storage.saveFolder(folder);
        } else {
            // Fallback: save to localStorage
            const folders = [...this.folders, folder];
            localStorage.setItem('ai-image-generator-folders', JSON.stringify(folders));
        }

        this.folders.push(folder);
        this.notifyListeners('folder-add', folder);
        return folder;
    }

    /**
     * Rename a folder
     * @param {string} id - Folder ID
     * @param {string} newName - New folder name
     */
    async renameFolder(id, newName) {
        await this.ready;

        const folder = this.folders.find(f => f.id === id);
        if (!folder) throw new Error(`Folder ${id} not found`);

        folder.name = newName.trim();

        if (!this.useFallback && this.storage) {
            await this.storage.updateFolder(id, { name: folder.name });
        } else {
            localStorage.setItem('ai-image-generator-folders', JSON.stringify(this.folders));
        }

        this.notifyListeners('folder-rename', folder);
    }

    /**
     * Delete a folder (moves images to uncategorized)
     * @param {string} id - Folder ID
     */
    async deleteFolder(id) {
        await this.ready;

        const index = this.folders.findIndex(f => f.id === id);
        if (index === -1) throw new Error(`Folder ${id} not found`);

        // Move all images in this folder to uncategorized
        const imagesToMove = this.images.filter(img => img.folderId === id);
        if (imagesToMove.length > 0) {
            await this.moveImagesToFolder(imagesToMove.map(img => img.id), null);
        }

        this.folders.splice(index, 1);

        if (!this.useFallback && this.storage) {
            await this.storage.deleteFolder(id);
        } else {
            localStorage.setItem('ai-image-generator-folders', JSON.stringify(this.folders));
        }

        // Reset selected folder if the deleted folder was selected
        if (this.selectedFolderId === id) {
            this.selectedFolderId = null;
        }

        this.notifyListeners('folder-delete', { id });
    }

    /**
     * Get image count for a folder
     * @param {string|null} folderId - Folder ID or null for uncategorized
     * @returns {number}
     */
    getImageCountForFolder(folderId) {
        if (folderId === null) {
            // All photos
            return this.images.length;
        }
        return this.images.filter(img => img.folderId === folderId).length;
    }

    // ========== Image-Folder Assignment ==========

    /**
     * Move images to a folder
     * @param {string[]} imageIds - Image IDs to move
     * @param {string|null} folderId - Destination folder ID or null for uncategorized
     */
    async moveImagesToFolder(imageIds, folderId) {
        await this.ready;

        // Update in-memory images
        for (const id of imageIds) {
            const image = this.images.find(img => img.id === id);
            if (image) {
                image.folderId = folderId;
            }
        }

        // Update in storage
        if (!this.useFallback && this.storage) {
            await this.storage.updateImagesMetadata(imageIds, { folderId });
        } else {
            this.saveToLocalStorage();
        }

        this.notifyListeners('images-moved', { imageIds, folderId });
    }

    // ========== Folder Selection & Filtering ==========

    /**
     * Set the currently selected folder for filtering
     * @param {string|null} folderId - Folder ID or null for "All Photos"
     */
    setSelectedFolder(folderId) {
        this.selectedFolderId = folderId;
        this.notifyListeners('folder-selected', { folderId });
    }

    /**
     * Get the photo visibility mode setting (cached in memory)
     * @returns {'all'|'folder-only'}
     */
    getPhotoVisibilityMode() {
        // Return cached value if available
        if (this._photoVisibilityMode !== null) {
            return this._photoVisibilityMode;
        }
        // Load from localStorage once and cache
        this._photoVisibilityMode = localStorage.getItem(PHOTO_VISIBILITY_KEY) || 'all';
        return this._photoVisibilityMode;
    }

    /**
     * Set the photo visibility mode setting
     * @param {'all'|'folder-only'} mode
     */
    setPhotoVisibilityMode(mode) {
        this._photoVisibilityMode = mode;
        localStorage.setItem(PHOTO_VISIBILITY_KEY, mode);
        this.notifyListeners('settings-changed', { photoVisibility: mode });
    }

    /**
     * Get filtered images based on selected folder and visibility settings
     * @returns {ImageData[]}
     */
    getFilteredImages() {
        const visibilityMode = this.getPhotoVisibilityMode();
        const selectedFolder = this.selectedFolderId;

        if (selectedFolder === null) {
            // "All Photos" selected
            if (visibilityMode === 'all') {
                return [...this.images];
            } else {
                // folder-only: show only uncategorized images
                return this.images.filter(img => !img.folderId);
            }
        } else {
            // Specific folder selected
            return this.images.filter(img => img.folderId === selectedFolder);
        }
    }

    // ========== Edit Mode (Multi-Select) ==========

    /**
     * Enable or disable edit mode
     * @param {boolean} enabled
     */
    setEditMode(enabled) {
        this.editMode = enabled;
        if (!enabled) {
            this.selectedImageIds.clear();
        }
        this.notifyListeners('edit-mode-changed', { enabled });
    }

    /**
     * Toggle image selection in edit mode
     * @param {string} imageId
     */
    toggleImageSelection(imageId) {
        if (this.selectedImageIds.has(imageId)) {
            this.selectedImageIds.delete(imageId);
        } else {
            this.selectedImageIds.add(imageId);
        }
        this.notifyListeners('selection-changed', { selectedIds: [...this.selectedImageIds] });
    }

    /**
     * Select all visible images
     */
    selectAllImages() {
        const visibleImages = this.getFilteredImages();
        visibleImages.forEach(img => this.selectedImageIds.add(img.id));
        this.notifyListeners('selection-changed', { selectedIds: [...this.selectedImageIds] });
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedImageIds.clear();
        this.notifyListeners('selection-changed', { selectedIds: [] });
    }

    /**
     * Get selected image IDs
     * @returns {string[]}
     */
    getSelectedImageIds() {
        return [...this.selectedImageIds];
    }

    /**
     * Subscribe to state changes
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of state change
     * @param {string} action - Type of action
     * @param {ImageData|null} data - Related data
     */
    notifyListeners(action, data) {
        this.listeners.forEach(listener => listener(action, data));
    }
}

// Export singleton instance
export const state = new State();
