// Persist task descriptors only. Provider keys and reference images stay out of the journal.
const KEY = 'pending-generations-v1';

export function pendingTaskKey(request) {
    return `${request.provider}:${request.request_id}`;
}

export function readPendingGenerations() {
    try {
        const entries = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(entries) ? entries.filter(entry =>
            entry?.request && typeof entry.request.request_id === 'string' &&
            typeof entry.id === 'string' && typeof entry.prompt === 'string') : [];
    } catch { return []; }
}

export function savePendingGeneration(entry) {
    const entries = readPendingGenerations().filter(item => pendingTaskKey(item.request) !== pendingTaskKey(entry.request));
    const { image_url, image_urls, ...settings } = entry.settings || {};
    try {
        localStorage.setItem(KEY, JSON.stringify([...entries, { ...entry, settings }]));
        return true;
    } catch { return false; }
}

export function removePendingGeneration(request) {
    try {
        localStorage.setItem(KEY, JSON.stringify(readPendingGenerations().filter(entry => pendingTaskKey(entry.request) !== pendingTaskKey(request))));
    } catch { /* Retaining the descriptor is safe: completion is idempotent. */ }
}
