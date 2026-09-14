/**
 * Image processing utilities for storage optimization
 */

/**
 * Convert a data URI to a Blob (saves ~33% space vs base64)
 * @param {string} dataUri - Base64 data URI (e.g., "data:image/png;base64,...")
 * @returns {Blob}
 */
export function dataUriToBlob(dataUri) {
    const [header, base64] = dataUri.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

/**
 * Create a blob URL for display
 * @param {Blob} blob
 * @returns {string}
 */
export function createBlobUrl(blob) {
    return URL.createObjectURL(blob);
}

/**
 * Revoke a blob URL to free memory
 * @param {string} url
 */
export function revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

/** Capture a small local poster; unsupported codecs do not prevent video storage. */
export function generateVideoPoster(blob) {
    return new Promise(resolve => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(blob);
        let settled = false;
        const finish = poster => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.onloadeddata = video.onerror = null;
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
            resolve(poster);
        };
        const timer = setTimeout(() => finish(null), 8000);
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = () => {
            try {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
                canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
                canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(finish, 'image/webp', 0.85);
            } catch { finish(null); }
        };
        video.onerror = () => finish(null);
        video.src = url;
    });
}

/**
 * Generate a thumbnail from an image blob
 * @param {Blob} imageBlob - Original image
 * @param {number} maxSize - Max dimension (default 512 for good gallery quality)
 * @returns {Promise<Blob>}
 */
export async function generateThumbnail(imageBlob, maxSize = 512) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(imageBlob);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate scaled dimensions maintaining aspect ratio
            let { width, height } = img;
            if (width > height) {
                if (width > maxSize) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Use WebP for better compression, fallback to JPEG
            const tryWebP = () => {
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            // Fallback to JPEG if WebP not supported
                            canvas.toBlob(
                                (jpegBlob) => resolve(jpegBlob || imageBlob),
                                'image/jpeg',
                                0.92
                            );
                        }
                    },
                    'image/webp',
                    0.92
                );
            };

            tryWebP();
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for thumbnail generation'));
        };

        img.src = url;
    });
}

/**
 * Compress a full-resolution image blob by re-encoding as WebP/JPEG.
 * Keeps original dimensions — only changes format from PNG to a lossy codec.
 * @param {Blob} imageBlob - Original image (typically PNG from API)
 * @param {number} quality - Compression quality 0-1 (default 0.92)
 * @returns {Promise<Blob>} Compressed blob (WebP preferred, JPEG fallback)
 */
export async function compressFullImage(imageBlob, quality = 0.92) {
    // Skip if already a lossy format and small (< 500KB)
    if (imageBlob.size < 500 * 1024 && imageBlob.type !== 'image/png') {
        return imageBlob;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(imageBlob);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Try WebP first, fallback to JPEG
            canvas.toBlob(
                (webpBlob) => {
                    if (webpBlob && webpBlob.size < imageBlob.size) {
                        resolve(webpBlob);
                    } else {
                        canvas.toBlob(
                            (jpegBlob) => {
                                if (jpegBlob && jpegBlob.size < imageBlob.size) {
                                    resolve(jpegBlob);
                                } else {
                                    // Original was already smaller, keep it
                                    resolve(imageBlob);
                                }
                            },
                            'image/jpeg',
                            quality
                        );
                    }
                },
                'image/webp',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            // On error, return original uncompressed
            resolve(imageBlob);
        };

        img.src = url;
    });
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
