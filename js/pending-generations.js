// Persist task descriptors only. Provider keys and reference images stay out of the journal.
const KEY = 'pending-generations-v1';

/** Async provider tasks are not retrievable forever; stop resuming after a day. */
export const PENDING_GENERATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Give up on a task after this many resume attempts that never produced a result. */
export const PENDING_GENERATION_MAX_RESUME_FAILURES = 3;

export function pendingTaskKey(request) {
    return `${request.provider}:${request.request_id}`;
}

function writePendingGenerations(entries) {
    localStorage.setItem(KEY, JSON.stringify(entries));
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
    const savedAt = Number.isFinite(entry.savedAt) ? entry.savedAt : Date.now();
    try {
        writePendingGenerations([...entries, { ...entry, settings, savedAt }]);
        return true;
    } catch { return false; }
}

export function removePendingGeneration(request) {
    try {
        writePendingGenerations(readPendingGenerations().filter(entry => pendingTaskKey(entry.request) !== pendingTaskKey(request)));
    } catch { /* Retaining the descriptor is safe: completion is idempotent. */ }
}

/**
 * A journal entry that should no longer be resumed automatically: either the
 * task is older than the provider keeps results, or resuming it has already
 * failed too many times.
 */
export function isStalePendingGeneration(entry, now = Date.now()) {
    const stamp = Number.isFinite(entry?.createdAt) ? entry.createdAt : entry?.savedAt;
    if (Number.isFinite(stamp) && now - stamp > PENDING_GENERATION_MAX_AGE_MS) return true;
    return (entry?.resumeFailures || 0) >= PENDING_GENERATION_MAX_RESUME_FAILURES;
}

/**
 * Drop stale entries from the journal and return what is left to resume.
 * @returns {{ kept: Array<Object>, discarded: number }}
 */
export function prunePendingGenerations(now = Date.now()) {
    const entries = readPendingGenerations();
    const kept = entries.filter(entry => !isStalePendingGeneration(entry, now));
    if (kept.length !== entries.length) {
        try { writePendingGenerations(kept); } catch { /* Pruning again on the next load is harmless. */ }
    }
    return { kept, discarded: entries.length - kept.length };
}

/**
 * Record that resuming a task did not produce a result.
 * @returns {number} the updated failure count for that task
 */
export function markPendingGenerationResumeFailure(request) {
    const key = pendingTaskKey(request);
    const entries = readPendingGenerations();
    let failures = 0;
    const updated = entries.map(entry => {
        if (pendingTaskKey(entry.request) !== key) return entry;
        failures = (entry.resumeFailures || 0) + 1;
        return { ...entry, resumeFailures: failures };
    });
    try { writePendingGenerations(updated); } catch { /* Best effort; the age limit still bounds retries. */ }
    return failures;
}
