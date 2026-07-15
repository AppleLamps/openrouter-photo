/**
 * Reusable API key / secret field wiring for the settings panel.
 */

import {
    testOpenRouterKey,
    testXaiKey,
    testEvolinkKey,
} from './api.js';

/** @type {((inputId?: string) => void) | null} */
let openSettingsPanel = null;

const API_KEY_FIELDS = [
    {
        id: 'openrouter',
        storageKey: 'openrouter_api_key',
        inputId: 'setting-openrouter-key',
        showId: 'setting-openrouter-key-show',
        saveId: 'setting-openrouter-save',
        testId: 'setting-openrouter-test',
        statusId: 'setting-openrouter-test-status',
        savedMessage: 'API key saved.',
        successMessage: 'OpenRouter API key is valid.',
        saveStatusSaved: 'Saved',
        test: testOpenRouterKey,
        requiredErrorCode: 'OPENROUTER_API_KEY_REQUIRED',
        popup: {
            modalId: 'openrouter-key-modal',
            title: 'OpenRouter API key required',
            defaultUrl: 'https://openrouter.ai/keys',
            defaultMessage:
                'You need an OpenRouter API key to use this app. Create one at openrouter.ai/keys, then paste it into Settings.',
        },
    },
    {
        id: 'xai',
        storageKey: 'xai_api_key',
        inputId: 'setting-xai-key',
        showId: 'setting-xai-key-show',
        saveId: 'setting-xai-save',
        testId: 'setting-xai-test',
        statusId: 'setting-xai-save-status',
        savedMessage: 'xAI API key saved.',
        successMessage: 'xAI API key is valid.',
        saveStatusSaved: 'Saved',
        test: testXaiKey,
        requiredErrorCode: 'XAI_API_KEY_REQUIRED',
        popup: {
            modalId: 'xai-key-modal',
            title: 'xAI API key required',
            defaultUrl: 'https://console.x.ai',
            defaultMessage:
                'You need an xAI API key to use xAI models. Create one at console.x.ai, then paste it into Settings.',
        },
    },
    {
        id: 'evolink',
        storageKey: 'evolink_api_key',
        inputId: 'setting-evolink-key',
        showId: 'setting-evolink-key-show',
        saveId: 'setting-evolink-save',
        testId: 'setting-evolink-test',
        statusId: 'setting-evolink-save-status',
        savedMessage: 'Evolink API key saved.',
        successMessage: 'Evolink API key is valid.',
        saveStatusSaved: 'Saved',
        test: testEvolinkKey,
        requiredErrorCode: 'EVOLINK_API_KEY_REQUIRED',
        popup: {
            modalId: 'evolink-key-modal',
            title: 'Evolink API key required',
            defaultUrl: 'https://evolink.ai/dashboard/keys',
            defaultMessage:
                'You need an Evolink API key to use Evolink models (Seedream, Z Image Turbo). Create one at evolink.ai/dashboard/keys, then paste it into Settings.',
        },
    },
];

const SECRET_FIELDS = [
    {
        storageKey: 'app_access_token',
        inputId: 'setting-app-access-token',
        showId: 'setting-app-access-token-show',
        saveId: 'setting-app-access-token-save',
        statusId: 'setting-app-access-token-status',
        savedMessage: 'App access token saved.',
        saveStatusSaved: 'Saved',
    },
];

/**
 * @param {{ openSettingsPanel: (inputId?: string) => void }} context
 */
export function initApiKeyPopupContext(context) {
    openSettingsPanel = context.openSettingsPanel;
}

/**
 * @param {object} config
 * @param {string} config.modalId
 * @param {string} config.inputId
 * @param {string} config.title
 * @param {string} config.defaultUrl
 * @param {string} config.defaultMessage
 * @param {{ message?: string, url?: string } | undefined} help
 */
export function showApiKeyPopup(config, help) {
    openSettingsPanel?.(config.inputId);

    const keyInput = document.getElementById(config.inputId);
    if (keyInput) {
        keyInput.focus();
        keyInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const url = help?.url || config.defaultUrl;
    const message = help?.message || config.defaultMessage;

    const existing = document.getElementById(config.modalId);
    if (existing) {
        existing.querySelector('.openrouter-key-modal__message').textContent = message;
        existing.querySelector('.openrouter-key-modal__link').href = url;
        existing.classList.add('openrouter-key-modal--active');
        keyInput?.focus();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = config.modalId;
    overlay.className = 'openrouter-key-modal openrouter-key-modal--active';
    overlay.innerHTML = `
        <div class="openrouter-key-modal__backdrop" role="presentation"></div>
        <div class="openrouter-key-modal__card" role="dialog" aria-modal="true" aria-label="${config.title}">
            <div class="openrouter-key-modal__header">
                <div class="openrouter-key-modal__title">${config.title}</div>
                <button type="button" class="openrouter-key-modal__close" aria-label="Close">✕</button>
            </div>
            <div class="openrouter-key-modal__body">
                <p class="openrouter-key-modal__message"></p>
                <div class="openrouter-key-modal__actions">
                    <a class="openrouter-key-modal__link" target="_blank" rel="noopener noreferrer">Get API key</a>
                    <button type="button" class="openrouter-key-modal__ok">I pasted it</button>
                </div>
                <p class="openrouter-key-modal__hint">Your key is stored locally in your browser and sent with each request.</p>
            </div>
        </div>
    `;

    overlay.querySelector('.openrouter-key-modal__message').textContent = message;
    overlay.querySelector('.openrouter-key-modal__link').href = url;

    const close = () => {
        overlay.classList.remove('openrouter-key-modal--active');
        keyInput?.focus();
    };
    overlay.querySelector('.openrouter-key-modal__close').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__backdrop').addEventListener('click', close);
    overlay.querySelector('.openrouter-key-modal__ok').addEventListener('click', close);

    document.body.appendChild(overlay);
    keyInput?.focus();
}

/** @param {{ message?: string, url?: string } | undefined} help */
export function showOpenRouterApiKeyPopup(help) {
    const field = API_KEY_FIELDS.find((f) => f.id === 'openrouter');
    if (field?.popup) showApiKeyPopup({ ...field.popup, inputId: field.inputId }, help);
}

/** @param {{ message?: string, url?: string } | undefined} help */
export function showXaiApiKeyPopup(help) {
    const field = API_KEY_FIELDS.find((f) => f.id === 'xai');
    if (field?.popup) showApiKeyPopup({ ...field.popup, inputId: field.inputId }, help);
}

/** @param {{ message?: string, url?: string } | undefined} help */
export function showEvolinkApiKeyPopup(help) {
    const field = API_KEY_FIELDS.find((f) => f.id === 'evolink');
    if (field?.popup) showApiKeyPopup({ ...field.popup, inputId: field.inputId }, help);
}

function readStorage(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function writeStorage(key, value) {
    localStorage.setItem(key, value.trim());
}

function wireShowToggle(showEl, inputEl) {
    if (!showEl || !inputEl) return;
    showEl.addEventListener('change', () => {
        inputEl.type = showEl.checked ? 'text' : 'password';
    });
}

function wireSecretField(field, { showSuccess, showError }) {
    const input = document.getElementById(field.inputId);
    const show = document.getElementById(field.showId);
    const saveBtn = document.getElementById(field.saveId);
    const status = document.getElementById(field.statusId);

    if (input) {
        input.value = readStorage(field.storageKey);
        input.addEventListener('input', () => {
            if (status) status.textContent = 'Unsaved';
        });
    }

    wireShowToggle(show, input);

    if (saveBtn && input) {
        saveBtn.addEventListener('click', () => {
            try {
                writeStorage(field.storageKey, input.value);
                if (status) status.textContent = field.saveStatusSaved;
                showSuccess(field.savedMessage);
            } catch {
                showError(`Failed to save ${field.label || 'value'} (storage unavailable).`);
            }
        });
    }
}

function wireApiKeyField(field, { showSuccess, showError }) {
    const input = document.getElementById(field.inputId);
    const show = document.getElementById(field.showId);
    const saveBtn = document.getElementById(field.saveId);
    const testBtn = document.getElementById(field.testId);
    const status = document.getElementById(field.statusId);

    if (input) {
        input.value = readStorage(field.storageKey);
        input.addEventListener('input', () => {
            if (status) status.textContent = 'Unsaved';
        });
    }

    wireShowToggle(show, input);

    if (saveBtn && input) {
        saveBtn.addEventListener('click', () => {
            try {
                writeStorage(field.storageKey, input.value);
                if (status) status.textContent = field.saveStatusSaved;
                showSuccess(field.savedMessage);
            } catch {
                showError('Failed to save API key (storage unavailable).');
            }
        });
    }

    if (testBtn && field.test) {
        testBtn.addEventListener('click', async () => {
            if (testBtn.disabled) return;

            if (status) status.textContent = 'Testing...';
            testBtn.disabled = true;

            try {
                if (input) writeStorage(field.storageKey, input.value);
                await field.test();
                if (status) status.textContent = 'Key works';
                showSuccess(field.successMessage);
            } catch (error) {
                if (status) status.textContent = '';
                if (field.requiredErrorCode && error?.code === field.requiredErrorCode && field.popup) {
                    showApiKeyPopup(field.popup, error?.help);
                    return;
                }
                showError(error?.message || 'API key test failed.');
            } finally {
                testBtn.disabled = false;
            }
        });
    }
}

/**
 * Wire all API key and secret fields in the settings panel.
 * @param {{ showSuccess: (msg: string) => void, showError: (msg: string) => void }} deps
 */
export function initApiKeySettings(deps) {
    for (const field of API_KEY_FIELDS) {
        wireApiKeyField(field, deps);
    }
    for (const field of SECRET_FIELDS) {
        wireSecretField(field, deps);
    }
}

/** Map provider error codes to popup helpers (for generate/enhance handlers). */
export const API_KEY_POPUP_BY_CODE = {
    OPENROUTER_API_KEY_REQUIRED: showOpenRouterApiKeyPopup,
    XAI_API_KEY_REQUIRED: showXaiApiKeyPopup,
    EVOLINK_API_KEY_REQUIRED: showEvolinkApiKeyPopup,
};

/**
 * Show the settings popup for a provider error code, if known.
 * @param {string | undefined} code
 * @param {{ message?: string, url?: string } | undefined} help
 * @returns {boolean} Whether a popup was shown
 */
export function showApiKeyPopupForCode(code, help) {
    const handler = code ? API_KEY_POPUP_BY_CODE[code] : null;
    if (!handler) return false;
    handler(help);
    return true;
}
