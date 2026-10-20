/**
 * Evolink credit balance pill shown next to the spend tracker
 */

import { getEvolinkCredits, hasEvolinkApiKey } from './api.js';

// Roughly $1 at the published credit rate.
const LOW_BALANCE_CREDITS = 70;
const MIN_REFRESH_INTERVAL_MS = 5000;
const STALE_AFTER_MS = 60000;
// Evolink settles the final charge shortly after a task completes.
const POST_SPEND_REFRESH_DELAY_MS = 3000;

let pill = null;
let inFlight = null;
let lastFetchedAt = 0;
let spendRefreshTimer = null;

function formatCredits(credits) {
    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: credits >= 100 ? 0 : 1,
    }).format(credits);
}

function formatUsd(amount) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
}

function render(text, { title = '', low = false, error = false } = {}) {
    pill.hidden = false;
    pill.classList.toggle('spend-tracker--low', low);
    pill.classList.toggle('spend-tracker--error', error);
    pill.title = title;
    // One wrapper so the pill's flex gap does not space out the inline parts.
    const label = document.createElement('span');
    label.append(...text);
    pill.replaceChildren(label);
}

function renderCredits(credits) {
    const remaining = credits.remaining_credits;
    const usd = Number.isFinite(credits.remaining_usd) ? formatUsd(credits.remaining_usd) : null;
    const amount = document.createElement('span');
    amount.textContent = `${formatCredits(remaining)} cr`;
    const parts = ['Evolink: ', amount];
    if (usd) {
        const usdLabel = document.createElement('span');
        usdLabel.className = 'spend-tracker__secondary';
        usdLabel.textContent = ` (${usd})`;
        parts.push(usdLabel);
    }

    const titleParts = [`${formatCredits(remaining)} Evolink credits left${usd ? ` (about ${usd})` : ''}.`];
    if (credits.limited_by_key) {
        titleParts.push(`This API key is capped below your account balance of ${formatCredits(credits.account_remaining_credits)} credits.`);
    }
    titleParts.push('Click to refresh.');

    render(parts, { title: titleParts.join(' '), low: remaining < LOW_BALANCE_CREDITS });
    pill.setAttribute('aria-label', `Evolink balance: ${formatCredits(remaining)} credits${usd ? `, about ${usd}` : ''}`);
}

/**
 * Fetch and display the balance. Concurrent calls share one request.
 * @param {{ force?: boolean }} [options]
 */
export function refreshEvolinkBalance({ force = false } = {}) {
    if (!pill) return Promise.resolve();
    if (!hasEvolinkApiKey()) {
        pill.hidden = true;
        return Promise.resolve();
    }
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastFetchedAt < MIN_REFRESH_INTERVAL_MS) return Promise.resolve();

    if (pill.hidden) render(['Evolink: …'], { title: 'Loading Evolink balance' });
    pill.dataset.loading = 'true';
    inFlight = getEvolinkCredits()
        .then((credits) => {
            if (credits && Number.isFinite(credits.remaining_credits)) {
                renderCredits(credits);
            } else {
                render(['Evolink: n/a'], { title: 'Evolink did not report a balance. Click to retry.' });
            }
        })
        .catch((error) => {
            const keyProblem = error?.code === 'EVOLINK_KEY_INVALID';
            render([keyProblem ? 'Evolink: key error' : 'Evolink: unavailable'], {
                title: `${(error?.message || 'Could not load the Evolink balance').replace(/\.?$/, '.')} Click to retry.`,
                error: true,
            });
        })
        .finally(() => {
            lastFetchedAt = Date.now();
            inFlight = null;
            delete pill.dataset.loading;
        });
    return inFlight;
}

function isEvolinkSpend(requests) {
    return Array.isArray(requests) && requests.some((request) => (
        request?.provider_name === 'evolink'
        || (typeof request?.model === 'string' && request.model.startsWith('evolink/'))
    ));
}

export function initEvolinkBalance() {
    pill = document.getElementById('evolink-balance');
    if (!pill) return;

    pill.addEventListener('click', () => refreshEvolinkBalance({ force: true }));

    window.addEventListener('api-key-saved', (event) => {
        if (event.detail?.id === 'evolink') refreshEvolinkBalance({ force: true });
    });

    window.addEventListener('spend-recorded', (event) => {
        if (!isEvolinkSpend(event.detail?.requests)) return;
        clearTimeout(spendRefreshTimer);
        spendRefreshTimer = setTimeout(() => refreshEvolinkBalance({ force: true }), POST_SPEND_REFRESH_DELAY_MS);
    });

    // Another tab may have saved or removed the key.
    window.addEventListener('storage', (event) => {
        if (event.key === 'evolink_api_key') refreshEvolinkBalance({ force: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastFetchedAt > STALE_AFTER_MS) {
            refreshEvolinkBalance();
        }
    });

    refreshEvolinkBalance({ force: true });
}
