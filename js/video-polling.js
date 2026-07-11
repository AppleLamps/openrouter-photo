export function isRetryablePollError(error) {
    if (error?.name === 'AbortError') return false;
    if (error instanceof TypeError) return true;

    const status = Number(error?.status);
    return status === 408 || status === 429 || status >= 500;
}
