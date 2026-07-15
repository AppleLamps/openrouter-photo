/**
 * Utility functions for DOM manipulation and helpers
 */

const BOOLEAN_PROPERTIES = new Set([
    'autofocus',
    'checked',
    'disabled',
    'hidden',
    'multiple',
    'readOnly',
    'required',
    'selected',
]);

/**
 * Create a DOM element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - Element attributes
 * @param {Array|string} children - Child elements or text content
 * @returns {HTMLElement}
 */
export function createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.slice(2).toLowerCase();
            element.addEventListener(eventName, value);
        } else if (BOOLEAN_PROPERTIES.has(key)) {
            element[key] = Boolean(value);
        } else {
            element.setAttribute(key, value);
        }
    });

    // Add children
    if (typeof children === 'string') {
        element.textContent = children;
    } else if (Array.isArray(children)) {
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof HTMLElement) {
                element.appendChild(child);
            }
        });
    }

    return element;
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function}
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Generate a unique ID
 * @returns {string}
 */
export function generateId() {
    // Use crypto.randomUUID if available (modern browsers), fallback to timestamp + random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
}

/**
 * Format date to readable string
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Download an image from URL
 * @param {string} url - Image URL
 * @param {string} filename - Download filename
 */
export async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await responseToMediaBlob(response);
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'generated-image.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(blobUrl);
        return true;
    } catch (error) {
        console.error('Failed to download image:', error);
        // Fallback: open in new tab
        window.open(url, '_blank');
        return false;
    }
}

export async function responseToMediaBlob(response) {
    if (!response?.ok) throw new Error(`Download failed with HTTP ${response?.status || 'unknown'}.`);
    const contentType = (response.headers?.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json') || contentType.startsWith('text/')) {
        throw new Error('The source returned an error document instead of media.');
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('The downloaded media was empty.');
    return blob;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
export function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string}
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
