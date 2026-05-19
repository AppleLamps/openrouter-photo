/**
 * IndexedDB storage module for efficient image persistence
 */

const DB_NAME = 'ai-image-generator';
const DB_VERSION = 2;
const IMAGES_STORE = 'images';
const BLOBS_STORE = 'blobs';
const FOLDERS_STORE = 'folders';

/**
 * @typedef {Object} StoredImageMetadata
 * @property {string} id - Unique identifier
 * @property {string} prompt - Generation prompt
 * @property {number} createdAt - Timestamp
 * @property {Object} [settings] - Generation settings
 * @property {string|null} [folderId] - Folder ID or null for uncategorized
 * @property {Object} [generation] - Generation metadata (model, cost, provider)
 * @property {string} [mediaType] - Media type (image or video)
 * @property {string} [sourceUrl] - Original media URL (used for videos)
 * @property {string} thumbnailBlobId - Reference to thumbnail in blobs store
 * @property {string} fullImageBlobId - Reference to full image in blobs store
 */

/**
 * @typedef {Object} Folder
 * @property {string} id - Unique folder identifier
 * @property {string} name - Display name
 * @property {number} createdAt - Timestamp
 * @property {number} order - Sort order in sidebar
 */

/**
 * ImageStorage class - IndexedDB wrapper for image persistence
 */
export class ImageStorage {
    constructor() {
        /** @type {IDBDatabase|null} */
        this.db = null;
        this.ready = this.initDB();
    }

    /**
     * Initialize IndexedDB
     * @returns {Promise<void>}
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // Images store - metadata only
                if (!db.objectStoreNames.contains(IMAGES_STORE)) {
                    const imagesStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
                    imagesStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Blobs store - binary data
                if (!db.objectStoreNames.contains(BLOBS_STORE)) {
                    db.createObjectStore(BLOBS_STORE, { keyPath: 'id' });
                }

                // v2: Add folders store
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
                        const foldersStore = db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
                        foldersStore.createIndex('order', 'order', { unique: false });
                    }
                }
            };
        });
    }

    /**
     * Save an image with its blobs
     * @param {Object} metadata - Image metadata (id, prompt, createdAt, settings)
     * @param {Blob} fullBlob - Full resolution image
     * @param {Blob} thumbnailBlob - Thumbnail image
     * @returns {Promise<void>}
     */
    async saveImage(metadata, fullBlob = null, thumbnailBlob = null) {
        const thumbnailBlobId = thumbnailBlob ? `${metadata.id}-thumb` : null;
        const fullImageBlobId = fullBlob ? `${metadata.id}-full` : null;

        const tx = this.db.transaction([IMAGES_STORE, BLOBS_STORE], 'readwrite');
        const imagesStore = tx.objectStore(IMAGES_STORE);
        const blobsStore = tx.objectStore(BLOBS_STORE);

        // Store metadata
        imagesStore.put({
            ...metadata,
            thumbnailBlobId,
            fullImageBlobId
        });

        // Store blobs when available
        if (thumbnailBlob && thumbnailBlobId) {
            blobsStore.put({ id: thumbnailBlobId, blob: thumbnailBlob, size: thumbnailBlob.size });
        }
        if (fullBlob && fullImageBlobId) {
            blobsStore.put({ id: fullImageBlobId, blob: fullBlob, size: fullBlob.size });
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get image metadata by ID
     * @param {string} id
     * @returns {Promise<StoredImageMetadata|null>}
     */
    async getImage(id) {
        const tx = this.db.transaction(IMAGES_STORE, 'readonly');
        const store = tx.objectStore(IMAGES_STORE);
        const request = store.get(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get full image blob by image ID
     * @param {string} id - Image ID
     * @returns {Promise<Blob|null>}
     */
    async getFullImageBlob(id) {
        const blobId = `${id}-full`;
        return this._getBlob(blobId);
    }

    /**
     * Get thumbnail blob by image ID
     * @param {string} id - Image ID
     * @returns {Promise<Blob|null>}
     */
    async getThumbnailBlob(id) {
        const blobId = `${id}-thumb`;
        return this._getBlob(blobId);
    }

    /**
     * Get blob by blob ID
     * @param {string} blobId
     * @returns {Promise<Blob|null>}
     */
    async _getBlob(blobId) {
        const tx = this.db.transaction(BLOBS_STORE, 'readonly');
        const store = tx.objectStore(BLOBS_STORE);
        const request = store.get(blobId);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.blob : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete an image and its blobs
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteImage(id) {
        const tx = this.db.transaction([IMAGES_STORE, BLOBS_STORE], 'readwrite');
        const imagesStore = tx.objectStore(IMAGES_STORE);
        const blobsStore = tx.objectStore(BLOBS_STORE);

        imagesStore.delete(id);
        blobsStore.delete(`${id}-thumb`);
        blobsStore.delete(`${id}-full`);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get all images with their thumbnail blobs
     * @returns {Promise<Array>} Array of metadata with thumbnailBlob attached
     */
    async getAllImages() {
        const tx = this.db.transaction([IMAGES_STORE, BLOBS_STORE], 'readonly');
        const imagesStore = tx.objectStore(IMAGES_STORE);

        const images = await new Promise((resolve, reject) => {
            const request = imagesStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const thumbTx = this.db.transaction(BLOBS_STORE, 'readonly');
        const thumbStore = thumbTx.objectStore(BLOBS_STORE);
        const thumbnailPromises = images.map((img) => new Promise((resolve) => {
            if (!img.thumbnailBlobId) {
                resolve(null);
                return;
            }

            const thumbRequest = thumbStore.get(img.thumbnailBlobId);
            thumbRequest.onsuccess = () => resolve(thumbRequest.result?.blob || null);
            thumbRequest.onerror = (event) => {
                event.preventDefault();
                resolve(null);
            };
        }));

        const thumbnailBlobs = await Promise.all(thumbnailPromises);
        const results = images.map((img, index) => ({
            ...img,
            thumbnailBlob: thumbnailBlobs[index] || null,
        }));

        // Sort by createdAt descending (newest first)
        return results.sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * Clear all images and blobs
     * @returns {Promise<void>}
     */
    async clear() {
        const tx = this.db.transaction([IMAGES_STORE, BLOBS_STORE], 'readwrite');
        tx.objectStore(IMAGES_STORE).clear();
        tx.objectStore(BLOBS_STORE).clear();

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ========== Folder Methods ==========

    /**
     * Save a folder
     * @param {Folder} folder
     * @returns {Promise<void>}
     */
    async saveFolder(folder) {
        const tx = this.db.transaction(FOLDERS_STORE, 'readwrite');
        const store = tx.objectStore(FOLDERS_STORE);
        store.put(folder);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get folder by ID
     * @param {string} id
     * @returns {Promise<Folder|null>}
     */
    async getFolder(id) {
        const tx = this.db.transaction(FOLDERS_STORE, 'readonly');
        const store = tx.objectStore(FOLDERS_STORE);
        const request = store.get(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all folders sorted by order
     * @returns {Promise<Folder[]>}
     */
    async getAllFolders() {
        const tx = this.db.transaction(FOLDERS_STORE, 'readonly');
        const store = tx.objectStore(FOLDERS_STORE);
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const folders = request.result || [];
                resolve(folders.sort((a, b) => a.order - b.order));
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update a folder
     * @param {string} id
     * @param {Partial<Folder>} updates
     * @returns {Promise<void>}
     */
    async updateFolder(id, updates) {
        const folder = await this.getFolder(id);
        if (!folder) throw new Error(`Folder ${id} not found`);

        const updated = { ...folder, ...updates };
        return this.saveFolder(updated);
    }

    /**
     * Delete a folder
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteFolder(id) {
        const tx = this.db.transaction(FOLDERS_STORE, 'readwrite');
        const store = tx.objectStore(FOLDERS_STORE);
        store.delete(id);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ========== Image Metadata Update ==========

    /**
     * Update image metadata (e.g., folderId)
     * @param {string} id - Image ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateImageMetadata(id, updates) {
        const image = await this.getImage(id);
        if (!image) throw new Error(`Image ${id} not found`);

        const tx = this.db.transaction(IMAGES_STORE, 'readwrite');
        const store = tx.objectStore(IMAGES_STORE);
        store.put({ ...image, ...updates });

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Update multiple images' metadata (batch operation)
     * @param {string[]} ids - Image IDs
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateImagesMetadata(ids, updates) {
        const tx = this.db.transaction(IMAGES_STORE, 'readwrite');
        const store = tx.objectStore(IMAGES_STORE);

        for (const id of ids) {
            const request = store.get(id);
            await new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const image = request.result;
                    if (image) {
                        store.put({ ...image, ...updates });
                    }
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get storage estimate
     * @returns {Promise<{used: number, quota: number}>}
     */
    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                used: estimate.usage || 0,
                quota: estimate.quota || 0
            };
        }
        return { used: 0, quota: 0 };
    }

    /**
     * Check if IndexedDB is supported
     * @returns {boolean}
     */
    static isSupported() {
        try {
            return typeof indexedDB !== 'undefined' && indexedDB !== null;
        } catch {
            return false;
        }
    }
}
