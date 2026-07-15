export const POLL_INITIAL_DELAY_MS = 3000;
export const POLL_MULTIPLIER = 1.5;
export const POLL_MAX_INTERVAL_MS = 15000;
export const POLL_MAX_ELAPSED_MS = 360000;

export function isRetryablePollError(error) {
    if (error?.name === 'AbortError') return false;
    if (error instanceof TypeError) return true;
    const status = Number(error?.status);
    return status === 408 || status === 429 || status >= 500;
}

export function normalizePendingRequests(response) {
    const shared = {
        provider: response?.provider || 'xai',
        model: response?.model || null,
        media_type: response?.media_type === 'image' ? 'image' : 'video',
    };
    const requests = Array.isArray(response?.requests) && response.requests.length > 0
        ? response.requests
        : (response?.request_id ? [{
            index: 0,
            request_id: response.request_id,
            estimated_cost: response.estimated_cost || 0,
            usage_estimated: true,
        }] : []);

    return requests
        .filter((request) => request && typeof request.request_id === 'string' && request.request_id)
        .map((request, fallbackIndex) => ({
            ...shared,
            ...request,
            index: Number.isInteger(request.index) ? request.index : fallbackIndex,
            estimated_cost: Number.isFinite(request.estimated_cost) ? request.estimated_cost : 0,
        }));
}

export function waitForPollDelay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            const error = new Error('Generation cancelled');
            error.name = 'AbortError';
            reject(error);
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            const error = new Error('Generation cancelled');
            error.name = 'AbortError';
            reject(error);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export async function pollGenerationRequest(request, pollStatus, signal, options = {}) {
    const maxElapsed = options.maxElapsed ?? POLL_MAX_ELAPSED_MS;
    let delay = options.initialDelay ?? POLL_INITIAL_DELAY_MS;
    const multiplier = options.multiplier ?? POLL_MULTIPLIER;
    const maxInterval = options.maxInterval ?? POLL_MAX_INTERVAL_MS;
    let elapsed = 0;

    while (elapsed < maxElapsed) {
        await waitForPollDelay(delay, signal);
        elapsed += delay;
        delay = Math.min(delay * multiplier, maxInterval);

        try {
            const result = await pollStatus(request.request_id, signal, request);
            if (result?.status === 'completed' && result.url) {
                return { status: 'completed', request, result };
            }
            if (result?.status === 'failed') {
                return {
                    status: 'failed',
                    request,
                    error: result.error || 'Generation failed. Please try again.',
                };
            }
        } catch (error) {
            if (!isRetryablePollError(error)) throw error;
            console.warn('Transient generation status error; polling will continue:', error.message);
        }
    }

    return { status: 'failed', request, error: 'Generation timed out. Please try again.' };
}

export function buildAsyncSpendMeta(request) {
    const usage = Number.isFinite(request?.estimated_cost) ? request.estimated_cost : 0;
    return {
        total_usage: usage,
        usage_pending: false,
        requests: [{
            model: request?.model || 'unknown',
            provider_name: request?.provider || 'unknown',
            generation_id: request?.request_id || null,
            usage,
            imageCount: 1,
            delivered_count: 1,
            usage_pending: false,
            usage_estimated: request?.usage_estimated === true,
            media_type: request?.media_type === 'image' ? 'image' : 'video',
        }],
    };
}
