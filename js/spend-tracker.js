/**
 * Local spend tracking and breakdown modal
 */

import { findModelById } from './models.js';

const SPEND_STORAGE_KEY = 'openrouter_spend_v1';

function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function loadSpendState() {
    const raw = (() => {
        try {
            return localStorage.getItem(SPEND_STORAGE_KEY);
        } catch {
            return null;
        }
    })();

    const parsed = raw ? safeParseJson(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
        return { total: 0, byModel: {} };
    }

    const total = typeof parsed.total === 'number' && Number.isFinite(parsed.total) ? parsed.total : 0;
    const byModel = parsed.byModel && typeof parsed.byModel === 'object' ? parsed.byModel : {};
    const pending = parsed.pending === true;
    return { total, byModel, pending };
}

function saveSpendState(state) {
    try {
        localStorage.setItem(SPEND_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore storage failures
    }
}

function formatUsd(amount) {
    const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(safe);
}

function roundPositiveCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return 0;
    }
    return Math.max(1, Math.round(value));
}

export function getSpendBreakdownMetrics(spend, entries) {
    const safeTotal = typeof spend?.total === 'number' && Number.isFinite(spend.total) ? spend.total : 0;
    const totalGenerations = entries.reduce((sum, entry) => {
        const generations = typeof entry.generations === 'number' && Number.isFinite(entry.generations)
            ? entry.generations
            : 0;
        return sum + generations;
    }, 0);
    const totalImages = entries.reduce((sum, entry) => {
        const images = typeof entry.images === 'number' && Number.isFinite(entry.images) && entry.images > 0
            ? entry.images
            : 0;
        return sum + images;
    }, 0);
    const roundedImages = roundPositiveCount(totalImages);
    const averagePerImage = roundedImages > 0 ? safeTotal / roundedImages : 0;

    return {
        totalGenerations,
        roundedImages,
        averagePerImage,
    };
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function updateSpendTrackerUI() {
    const pill = document.getElementById('spend-tracker');
    if (!pill) return;
    const spend = loadSpendState();
    pill.textContent = spend.pending
        ? `Spent: ~${formatUsd(spend.total)}`
        : `Spent: ${formatUsd(spend.total)}`;
    pill.title = spend.pending ? 'Some costs are pending from OpenRouter.' : '';
}

export function recordSpend(meta, imagesReturned) {
    if (!meta || typeof meta !== 'object') return;
    const requests = Array.isArray(meta.requests) ? meta.requests : [];
    if (requests.length === 0) return;

    const spend = loadSpendState();
    const hasPending =
        meta.usage_pending === true ||
        requests.some((req) => req && req.usage_pending === true);

    const images = typeof imagesReturned === 'number' && Number.isFinite(imagesReturned) ? imagesReturned : 0;
    const imagesPerGeneration = requests.length > 0 ? images / requests.length : 0;

    for (const req of requests) {
        const model = typeof req?.model === 'string' ? req.model : 'unknown';
        const usage = typeof req?.usage === 'number' && Number.isFinite(req.usage) ? req.usage : 0;

        if (!spend.byModel[model]) {
            spend.byModel[model] = { cost: 0, generations: 0, images: 0 };
        }

        spend.byModel[model].cost += usage;
        spend.byModel[model].generations += 1;
        spend.byModel[model].images += imagesPerGeneration;
        spend.total += usage;
    }

    if (hasPending) {
        spend.pending = true;
    }

    saveSpendState(spend);
    updateSpendTrackerUI();
}

function openSpendBreakdownModal() {
    const spend = loadSpendState();
    const entries = Object.entries(spend.byModel)
        .map(([model, v]) => ({
            model,
            cost: typeof v?.cost === 'number' ? v.cost : 0,
            generations: typeof v?.generations === 'number' ? v.generations : 0,
            images: typeof v?.images === 'number' ? v.images : 0,
        }))
        .sort((a, b) => b.cost - a.cost);

    const { totalGenerations, roundedImages, averagePerImage } = getSpendBreakdownMetrics(spend, entries);
    const topEntry = entries[0] || null;
    const hasSpend = entries.length > 0;

    const existing = document.getElementById('spend-breakdown-modal');
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'spend-breakdown-modal';
    overlay.className = 'openrouter-key-modal openrouter-key-modal--active spend-breakdown-modal';

    const formatSmallUsd = (amount) => {
        const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
        if (safe > 0 && safe < 0.01) {
            return `$${safe.toFixed(4)}`;
        }
        return formatUsd(safe);
    };
    const totalValue = spend.pending ? `~${formatSmallUsd(spend.total)}` : formatSmallUsd(spend.total);

    const getModelDisplay = (model) => {
        const catalogModel = findModelById(model);
        const name = catalogModel?.name || model.split('/').slice(-2).join(' / ') || model;
        const provider = catalogModel
            ? `${catalogModel.provider}${catalogModel.via ? ` via ${catalogModel.via}` : ''}`
            : model;
        return { name, provider };
    };

    const rowsHtml = entries.length
        ? entries
            .map((e, index) => {
                const imgCount = roundPositiveCount(e.images);
                const avgCost = imgCount > 0 ? e.cost / imgCount : 0;
                const modelDisplay = getModelDisplay(e.model);
                return `
                    <tr>
                        <td class="spend-breakdown__rank"><span>${index + 1}</span></td>
                        <td class="spend-breakdown__model">
                            <span class="spend-breakdown__model-name">${escapeHtml(modelDisplay.name)}</span>
                            <span class="spend-breakdown__model-provider">${escapeHtml(modelDisplay.provider)}</span>
                        </td>
                        <td class="spend-breakdown__cost">${formatSmallUsd(e.cost)}</td>
                        <td class="spend-breakdown__cost">${formatSmallUsd(avgCost)}</td>
                        <td class="spend-breakdown__stat">${e.generations}</td>
                        <td class="spend-breakdown__stat">${imgCount}</td>
                    </tr>
                `;
            })
            .join('')
        : '';

    const topModelDisplay = topEntry ? getModelDisplay(topEntry.model) : null;
    const hint = spend.pending
        ? 'Some OpenRouter costs are still pending. Fal, xAI, and Evolink estimates are recorded when the app can calculate them.'
        : 'Spend is stored locally in this browser and updates after each completed generation.';

    overlay.innerHTML = `
        <div class="openrouter-key-modal__backdrop" role="presentation"></div>
        <div class="openrouter-key-modal__card spend-breakdown__card" role="dialog" aria-modal="true" aria-label="Spend breakdown">
            <div class="openrouter-key-modal__header">
                <div>
                    <p class="spend-breakdown__eyebrow">Usage ledger</p>
                    <h2 class="openrouter-key-modal__title">Spend breakdown</h2>
                </div>
                <button type="button" class="openrouter-key-modal__close" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
            <div class="openrouter-key-modal__body">
                <div class="spend-breakdown__summary" aria-label="Spend summary">
                    <div class="spend-breakdown__metric spend-breakdown__metric--primary">
                        <span class="spend-breakdown__metric-label">Total spent</span>
                        <span class="spend-breakdown__metric-value">${totalValue}</span>
                        ${spend.pending ? '<span class="spend-breakdown__pending">Pending costs included</span>' : ''}
                    </div>
                    <div class="spend-breakdown__metric">
                        <span class="spend-breakdown__metric-label">Generations</span>
                        <span class="spend-breakdown__metric-value">${totalGenerations}</span>
                    </div>
                    <div class="spend-breakdown__metric">
                        <span class="spend-breakdown__metric-label">Images</span>
                        <span class="spend-breakdown__metric-value">${roundedImages}</span>
                    </div>
                    <div class="spend-breakdown__metric">
                        <span class="spend-breakdown__metric-label">Avg / image</span>
                        <span class="spend-breakdown__metric-value">${formatSmallUsd(averagePerImage)}</span>
                    </div>
                </div>
                ${topEntry ? `
                    <div class="spend-breakdown__top-model">
                        <span class="spend-breakdown__top-label">Top spend</span>
                        <span class="spend-breakdown__top-name">${escapeHtml(topModelDisplay.name)}</span>
                        <span class="spend-breakdown__top-cost">${formatSmallUsd(topEntry.cost)}</span>
                    </div>
                ` : ''}
                ${hasSpend ? `
                    <div class="spend-breakdown__table-container">
                        <table class="spend-breakdown__table">
                            <thead>
                                <tr>
                                    <th class="spend-breakdown__rank-heading">#</th>
                                    <th>Model</th>
                                    <th>Spend</th>
                                    <th>Avg / image</th>
                                    <th>Runs</th>
                                    <th>Images</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    <div class="spend-breakdown__empty">
                        <div class="spend-breakdown__empty-icon">$</div>
                        <h3>No spend recorded yet</h3>
                        <p>Generate an image and this view will break down cost by model.</p>
                    </div>
                `}
                <p class="openrouter-key-modal__hint">${hint}</p>
                <div class="spend-breakdown__actions">
                    ${hasSpend ? '<button type="button" class="spend-breakdown__reset">Reset spend history</button>' : ''}
                    <button type="button" class="spend-breakdown__done">Done</button>
                </div>
            </div>
        </div>
    `;

    const close = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        document.body.classList.remove('is-modal-open');
    };
    overlay.querySelector('.openrouter-key-modal__close').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__backdrop').addEventListener('click', close);
    overlay.querySelector('.spend-breakdown__done')?.addEventListener('click', close);
    overlay.querySelector('.spend-breakdown__reset')?.addEventListener('click', () => {
        if (!window.confirm('Reset local spend history? This only clears the counter in this browser.')) return;
        saveSpendState({ total: 0, byModel: {}, pending: false });
        updateSpendTrackerUI();
        close();
        openSpendBreakdownModal();
    });

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    };
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(overlay);
    document.body.classList.add('is-modal-open');
    overlay.querySelector('.openrouter-key-modal__close')?.focus();
}

export function initSpendTracker() {
    updateSpendTrackerUI();
    const spendTracker = document.getElementById('spend-tracker');
    if (spendTracker) {
        spendTracker.addEventListener('click', () => openSpendBreakdownModal());
    }
}
