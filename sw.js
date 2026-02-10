/**
 * Service Worker for AI Image Generator PWA
 * Caches core assets for offline loading
 */

const CACHE_NAME = 'ai-image-gen-v6';

const CORE_ASSETS = [
    '/',
    '/css/base.css',
    '/css/layout.css',
    '/css/components.css',
    '/css/gallery.css',
    '/js/app.js',
    '/js/api.js',
    '/js/gallery.js',
    '/js/state.js',
    '/js/utils.js',
    '/js/prompts.js',
    '/js/config.js',
    '/js/image-utils.js',
    '/js/sidebar.js',
    '/js/storage.js'
];

/**
 * Cache assets individually to avoid failing on missing resources
 * @param {Cache} cache 
 * @param {string[]} urls 
 */
async function cacheAssets(cache, urls) {
    const results = await Promise.allSettled(
        urls.map(async (url) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    await cache.put(url, response);
                    return { url, success: true };
                }
                return { url, success: false, reason: response.status };
            } catch (err) {
                return { url, success: false, reason: err.message };
            }
        })
    );

    const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success);
    if (failed.length > 0) {
        console.log('[SW] Some assets failed to cache:', failed.map(r => r.value));
    }
}

/**
 * Install event - cache core assets
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                return cacheAssets(cache, CORE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

/**
 * Fetch event - serve from cache, fallback to network
 * Uses "network first" strategy to avoid stale content issues
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip API requests - always go to network
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // Skip external requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Network first strategy - try network, fall back to cache
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                // Cache successful responses for static assets
                if (networkResponse.ok && isStaticAsset(url.pathname)) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(request, responseToCache));
                }
                return networkResponse;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(request);
            })
    );
});

/**
 * Check if a path is a static asset that should be cached
 * @param {string} pathname 
 * @returns {boolean}
 */
function isStaticAsset(pathname) {
    return pathname.endsWith('.html') ||
        pathname.endsWith('.css') ||
        pathname.endsWith('.js') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.ico') ||
        pathname === '/';
}
