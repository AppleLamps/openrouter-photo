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
