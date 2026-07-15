/** Backward-compatible helper retained for callers that only need retry classification. */
export function isRetryablePollError(error) {
    if (error instanceof TypeError) return true;
    return error?.status === 408 || error?.status === 425 || error?.status === 429 || error?.status >= 500;
}
