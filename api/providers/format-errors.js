const { redactKey } = require('../_middleware');

function formatFalError(errorText, fallbackMessage) {
    if (/content_policy_violation|content checker/i.test(String(errorText || ''))) {
        return {
            code: 'FAL_CONTENT_POLICY_VIOLATION',
            error: 'Fal content policy rejected this request',
            details: 'Fal rejected the prompt or attached image before generation. Try a different prompt or source image.',
        };
    }

    return {
        error: fallbackMessage,
        details: redactKey(errorText),
    };
}

function formatEvolinkError(errorText, fallbackMessage) {
    const parsed = (() => {
        try {
            return JSON.parse(String(errorText || ''));
        } catch {
            return null;
        }
    })();
    const message = parsed?.error?.message || parsed?.message || String(errorText || '');
    const code = parsed?.error?.code || parsed?.code || null;

    if (/content_policy_violation|safety filters/i.test(message) || code === 'content_policy_violation') {
        return {
            code: 'EVOLINK_CONTENT_POLICY_VIOLATION',
            error: 'Evolink content policy rejected this request',
            details: 'Evolink rejected the prompt or attached image before generation. Try a different prompt or source image.',
        };
    }

    return {
        ...(code ? { code: String(code) } : {}),
        error: fallbackMessage,
        details: redactKey(message || errorText),
    };
}

module.exports = {
    formatFalError,
    formatEvolinkError,
};
