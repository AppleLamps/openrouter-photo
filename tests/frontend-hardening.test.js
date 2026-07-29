const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('frontend hardening', () => {
    it('does not hardcode the catalog default model in HTML', () => {
        const html = read('index.html');
        assert.match(html, /<input id="setting-model" type="hidden" value="">/);
        assert.doesNotMatch(html, /id="setting-model"[^>]+fal-ai\/z-image\/turbo\/lora/);
    });

    it('loads JSZip from the checked-in vendor bundle', () => {
        const gallery = read('js/gallery.js');
        assert.match(gallery, /\/public\/vendor\/jszip\.min\.js/);
        assert.doesNotMatch(gallery, /cdnjs\.cloudflare\.com/);
        assert.ok(fs.existsSync(path.join(root, 'public', 'vendor', 'jszip.min.js')));
    });

    it('uses an in-app confirmation modal for Clear All', () => {
        const app = read('js/app.js');
        assert.match(app, /showClearAllConfirm/);
        assert.match(app, /clear-all-confirm-modal/);
        assert.doesNotMatch(app, /confirm\(`Are you sure you want to delete all/);
    });

    it('validates restored settings against available controls', () => {
        const controller = read('js/generation-controller.js');
        assert.match(controller, /const hasSelectOption/);
        assert.match(controller, /const setSelectIfValid/);
        assert.match(controller, /getUiCapabilities\(model\)/);
        assert.match(controller, /resolveCapabilities\(model\)\.evolink\?\.aspectRatios/);
    });

    it('does not render empty video src attributes for missing video URLs', () => {
        const gallery = read('js/gallery.js');
        assert.match(gallery, /const videoUrl = isVideo \? \(image\.sourceUrl \|\| image\.url \|\| ''\) : '';/);
        assert.match(gallery, /if \(videoUrl\) \{\s+videoAttributes\.src = videoUrl;/);
        assert.doesNotMatch(gallery, /src: image\.url,\s+preload: 'metadata'/);
    });

    it('uses the generation attachment helper for prompt enhancement', () => {
        const app = read('js/app.js');
        const controller = read('js/generation-controller.js');

        assert.match(controller, /export function getAttachedImageUrls/);
        assert.match(app, /getAttachedImageUrls,/);
        assert.match(app, /enhancePrompt\(prompt, getAttachedImageUrls\(\)/);
    });

    it('persists same-origin proxied generated images as hosted images', () => {
        const state = read('js/state.js');
        assert.match(state, /const isHostedImageUrl = \(url\) =>/);
        assert.match(state, /url\.startsWith\('\/'\)/);
        assert.match(state, /isHostedImageUrl\(imageData\.url\)/);
    });

    it('uses an adaptive mobile gallery grid', () => {
        const gallery = read('css/gallery.css');
        assert.match(gallery, /repeat\(auto-fit, minmax\(min\(100%, 158px\), 1fr\)\)/);
        assert.match(gallery, /@media \(max-width: 360px\)/);
        assert.match(gallery, /content-visibility: visible;/);
    });

    it('prevents root horizontal panning on mobile', () => {
        const base = read('css/base.css');
        const html = read('index.html');

        assert.match(base, /html\s*\{[^}]*overflow-x: hidden;/s);
        assert.match(html, /html\{[^}]*overflow-x:hidden;/);
    });

    it('uses a compact mobile composer with progressively disclosed secondary tools', () => {
        const html = read('index.html');
        const app = read('js/app.js');
        const components = read('css/components.css');

        assert.match(html, /id="mobile-tools-btn"[^>]+aria-controls="input-bar-tools"[^>]+aria-expanded="false"/);
        assert.match(app, /function initMobileComposerTools\(\)/);
        assert.match(app, /input-bar--tools-open/);
        assert.match(components, /grid-template-columns: 44px minmax\(0, 1fr\) 44px;/);
        assert.match(components, /\.input-bar--tools-open \.input-bar__actions-left\s*\{[^}]*display: flex;/s);
        assert.match(components, /#folder-selector-dropdown\s*\{[^}]*display: none;/s);
    });

    it('sets DOM boolean properties instead of serializing false boolean attributes', () => {
        const utils = read('js/utils.js');
        assert.match(utils, /BOOLEAN_PROPERTIES\.has\(key\)/);
        assert.match(utils, /element\[key\] = Boolean\(value\)/);
    });

    it('uses accessible gallery action buttons and mobile-sized destructive targets', () => {
        const gallery = read('js/gallery.js');
        const styles = read('css/gallery.css');

        assert.match(gallery, /className: 'gallery__open-btn'/);
        assert.match(gallery, /'aria-label': 'Delete image'/);
        assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.gallery__delete-btn\s*\{[^}]*width: 44px;[^}]*height: 44px;/);
    });

    it('replaces the composer with a safe mobile selection toolbar in edit mode', () => {
        const gallery = read('js/gallery.js');
        const styles = read('css/gallery.css');
        const actionBar = gallery.slice(
            gallery.indexOf('function updateEditModeActionBar()'),
            gallery.indexOf('function initGallery'),
        );

        assert.match(gallery, /classList\.toggle\('is-gallery-edit-mode', state\.editMode\)/);
        assert.match(styles, /body\.is-gallery-edit-mode \.input-bar\s*\{[^}]*visibility: hidden;/s);
        assert.match(styles, /\.edit-mode-action-bar\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
        assert.doesNotMatch(actionBar, /\bfailures\b|\bfiles\.length\b/);
    });

    it('preserves model-specific switches during same-model UI refreshes', () => {
        const picker = read('js/model-picker.js');
        assert.match(picker, /if \(activeSettingsModel\) \{\s*modelSettings\.set\(activeSettingsModel,/);
        assert.doesNotMatch(picker, /activeSettingsModel && activeSettingsModel !== model/);
    });

    it('uses a focus-managed settings dialog with a mobile bottom sheet', () => {
        const html = read('index.html');
        const app = read('js/app.js');
        const styles = read('css/components.css');

        assert.match(html, /id="settings-panel"[^>]+role="dialog"[^>]+aria-hidden="true"/);
        assert.match(html, /id="settings-backdrop"[^>]+aria-hidden="true"/);
        assert.match(html, /aria-controls="settings-panel" aria-expanded="false"/);
        assert.match(app, /panel\.setAttribute\('aria-modal', 'true'\)/);
        assert.match(app, /function trapFocusWithin\(event, container\)/);
        assert.match(app, /settingsBackdrop\?\.addEventListener\('click'/);
        assert.match(app, /function initSettingsTabs\(panel\)/);
        assert.match(app, /\['generation', 'Generation'\], \['storage', 'Storage'\], \['keys', 'Keys'\]/);
        assert.match(app, /setAttribute\('role', 'tabpanel'\)/);
        assert.match(styles, /body\.is-settings-open \.settings-backdrop\s*\{[^}]*visibility: visible;/s);
        assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?\.settings-panel\s*\{[^}]*transform: translateY\(100%\);/s);
    });

    it('keeps modal focus visible and restores folder-dialog focus without inline danger styles', () => {
        const app = read('js/app.js');
        const sidebar = read('js/sidebar.js');
        const keySettings = read('js/settings-keys.js');

        assert.match(app, /trapFocusWithin\(event, modal\)/);
        assert.match(app, /button\[data-confirm-cancel\]/);
        assert.match(app, /higherPriorityModal[\s\S]*?openrouter-key-modal--active[\s\S]*?if \(higherPriorityModal\) return;/);
        assert.match(sidebar, /folderModalLastFocused\?\.focus/);
        assert.match(sidebar, /menu\.remove\(\);\s*anchor\.focus\(\{ preventScroll: true \}\);\s*showRenameFolderModal/);
        assert.match(sidebar, /menu\.remove\(\);\s*anchor\.focus\(\{ preventScroll: true \}\);\s*showDeleteFolderConfirm/);
        assert.match(sidebar, /openrouter-key-modal__link--danger/);
        assert.doesNotMatch(sidebar, /style\.backgroundColor = '#ef4444'/);
        assert.match(keySettings, /trapPopupFocus\(event, overlay\)/);
    });

    it('keeps the lightbox media-first while exposing useful context and mobile details', () => {
        const html = read('index.html');
        const gallery = read('js/gallery.js');
        const components = read('css/components.css');

        assert.match(html, /id="modal-position"[^>]*aria-live="polite"/);
        assert.match(html, /id="modal-created"/);
        assert.match(html, /class="modal__info-toggle"[^>]*aria-expanded="true"/);
        assert.match(html, /class="modal__keyboard-hint"/);
        assert.match(gallery, /modalInfo\?\.classList\.toggle\('modal__info--collapsed', shouldCollapseDetails\)/);
        assert.match(gallery, /if \(!modal\.classList\.contains\('modal--active'\)\)[\s\S]*?lastFocusedElement/);
        assert.match(components, /\.modal__info--collapsed \.modal__details-body/);
    });

    it('uses shared toast styling and an ellipsizing model trigger label', () => {
        const app = read('js/app.js');
        const picker = read('js/model-picker.js');
        const styles = read('css/components.css');

        assert.match(app, /function showToast\(message, type, duration\)/);
        assert.doesNotMatch(app, /toast\.style\.cssText/);
        assert.match(picker, /label\.className = 'model-trigger__label'/);
        assert.match(styles, /\.model-trigger__label\s*\{[^}]*text-overflow: ellipsis;/s);
    });

    it('renders the model picker from picker-visible catalog models', () => {
        const picker = read('js/model-picker.js');
        assert.match(picker, /PICKER_MODELS\.filter\(matches\)/);
        assert.doesNotMatch(picker, /const filtered = MODELS\.filter\(matches\);/);
    });

    it('shows catalog-derived cost, input, and key guidance in the model picker', () => {
        const models = read('js/models.js');
        const picker = read('js/model-picker.js');

        assert.match(models, /export function getModelCostLabel\(modelId\)/);
        assert.match(models, /export function getModelInputLabel\(modelId\)/);
        assert.match(picker, /className = 'model-picker__row-guidance'/);
        assert.match(picker, /key ready/);
        assert.match(picker, /key required/);
    });

    it('mounts large galleries in bounded incremental pages', () => {
        const gallery = read('js/gallery.js');

        assert.match(gallery, /const GALLERY_PAGE_SIZE = 48;/);
        assert.match(gallery, /images\.slice\(0, GALLERY_PAGE_SIZE\)/);
        assert.match(gallery, /function appendNextGalleryPage\(\)/);
        assert.match(gallery, /className: 'gallery__sentinel'/);
        assert.match(gallery, /rootMargin: '800px 0px'/);
    });
});
