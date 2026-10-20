const { withMiddleware, redactKey, resolveEvolinkApiKey } = require('./_middleware');
const { evolinkCreditsToUsd } = require('./model-catalog');

function toCredits(value) {
    const credits = Number(value);
    return Number.isFinite(credits) ? credits : null;
}

/**
 * Summarise the /v1/credits payload. The account ("user") balance is what can
 * be spent, unless this key has its own lower limit ("token").
 * @returns {object|null} null when the payload has no usable balance
 */
function summarizeEvolinkCredits(payload) {
    const user = payload?.data?.user;
    const token = payload?.data?.token;
    const accountRemaining = toCredits(user?.remaining_credits);
    if (accountRemaining === null) return null;

    const keyLimited = token && token.unlimited_credits === false;
    const keyRemaining = keyLimited ? toCredits(token.remaining_credits) : null;
    const remaining = keyRemaining === null ? accountRemaining : Math.min(accountRemaining, keyRemaining);

    return {
        remaining_credits: remaining,
        remaining_usd: evolinkCreditsToUsd(remaining),
        account_remaining_credits: accountRemaining,
        account_used_credits: toCredits(user?.used_credits),
        key_remaining_credits: keyRemaining,
        key_used_credits: toCredits(token?.used_credits),
        limited_by_key: keyRemaining !== null && keyRemaining < accountRemaining,
    };
}

module.exports = withMiddleware(async function handler(req, res) {
    const EVOLINK_API_KEY = resolveEvolinkApiKey(req);

    if (!EVOLINK_API_KEY) {
        return res.status(401).json({
            code: 'EVOLINK_API_KEY_REQUIRED',
            error: 'Evolink API key required',
            help: {
                message: 'Open Settings, paste your Evolink API key, then try again.',
                url: 'https://evolink.ai/dashboard/keys'
            }
        });
    }

    try {
        const response = await fetch('https://api.evolink.ai/v1/credits', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${EVOLINK_API_KEY}`,
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                code: 'EVOLINK_KEY_INVALID',
                error: 'Evolink API key test failed',
                details: redactKey(errorText)
            });
        }

        let credits = null;
        try {
            credits = summarizeEvolinkCredits(JSON.parse(await response.text()));
        } catch {
            // The key works even if the balance payload is unreadable.
        }

        return res.status(200).json(credits ? { ok: true, credits } : { ok: true });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports.summarizeEvolinkCredits = summarizeEvolinkCredits;
