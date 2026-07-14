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

    it('stacks input bar dropdown controls onto a full mobile row', () => {
        const components = read('css/components.css');
        assert.match(components, /\.input-bar__actions-center\s*\{[^}]*flex: 0 0 100%;[^}]*width: 100%;/s);
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

        assert.match(gallery, /classList\.toggle\('is-gallery-edit-mode', state\.editMode\)/);
        assert.match(styles, /body\.is-gallery-edit-mode \.input-bar\s*\{[^}]*visibility: hidden;/s);
        assert.match(styles, /\.edit-mode-action-bar\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
    });

    it('uses a focus-managed full-screen settings sheet on mobile', () => {
        const html = read('index.html');
        const app = read('js/app.js');
        const styles = read('css/components.css');

        assert.match(html, /id="settings-panel"[^>]+role="dialog"[^>]+aria-hidden="true"/);
        assert.match(html, /aria-controls="settings-panel" aria-expanded="false"/);
        assert.match(app, /panel\.setAttribute\('aria-modal', 'true'\)/);
        assert.match(app, /event\.key !== 'Tab' \|\| !SETTINGS_MOBILE_MQ\.matches/);
        assert.match(app, /function prioritizeMobileSettings\(panel\)/);
        assert.match(app, /heading\.textContent = 'Provider Keys'/);
        assert.match(styles, /\.settings-panel\s*\{[^}]*height: 100dvh;[^}]*max-height: none;/s);
    });

    it('renders the model picker from picker-visible catalog models', () => {
        const picker = read('js/model-picker.js');
        assert.match(picker, /PICKER_MODELS\.filter\(matches\)/);
        assert.doesNotMatch(picker, /const filtered = MODELS\.filter\(matches\);/);
    });
});
