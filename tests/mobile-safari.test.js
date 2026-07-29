const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const html = read('index.html');
const mobileCss = read('css/mobile.css');

describe('iOS Safari viewport contract', () => {
    it('opts into the safe-area insets without disabling pinch zoom', () => {
        const viewport = html.match(/<meta name="viewport" content="([^"]+)">/);
        assert.ok(viewport, 'viewport meta tag is missing');
        assert.match(viewport[1], /viewport-fit=cover/);
        // Blocking zoom is an accessibility failure and Safari ignores it anyway.
        assert.doesNotMatch(viewport[1], /maximum-scale|user-scalable/);
    });

    it('loads the mobile overrides after every other stylesheet', () => {
        const sheets = Array.from(html.matchAll(/href="(css\/[a-z-]+\.css)"/g), (m) => m[1]);
        assert.ok(sheets.includes('css/mobile.css'), 'css/mobile.css is not linked');
        // Both the async block and the <noscript> fallback must end with it.
        assert.equal(sheets.lastIndexOf('css/mobile.css'), sheets.length - 1);
        assert.match(read('sw.js'), /'\/css\/mobile\.css'/);
    });

    it('pins the rendered text size so landscape does not inflate it', () => {
        assert.match(read('css/base.css'), /-webkit-text-size-adjust:\s*100%/);
        // The inlined critical CSS has to agree with base.css.
        assert.match(html, /-webkit-text-size-adjust:100%/);
    });
});

describe('iOS Safari input handling', () => {
    it('keeps every text control at 16px on touch so focus does not zoom', () => {
        const block = mobileCss.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/);
        assert.ok(block, 'no coarse-pointer block found');
        for (const selector of [
            '.settings-input',
            '.settings-select',
            '.settings-textarea',
            '.custom-enhance-modal__textarea',
            '.model-picker__search',
            '.input-bar__input',
        ]) {
            assert.ok(block[1].includes(selector), `${selector} is not bumped to 16px on touch`);
        }
        assert.match(block[1], /font-size:\s*16px/);
    });

    it('offsets the fixed composer by the measured keyboard inset', () => {
        assert.match(mobileCss, /\.input-bar \{\s*bottom: var\(--keyboard-inset, 0px\);/);
        const viewport = read('js/viewport.js');
        assert.match(viewport, /--keyboard-inset/);
        assert.match(viewport, /window\.visualViewport/);
    });
});

describe('overlay scroll locking', () => {
    it('pins the body rather than relying on overflow: hidden', () => {
        const lock = read('js/scroll-lock.js');
        assert.match(lock, /position\s*=\s*'fixed'/);
        assert.match(lock, /window\.scrollTo\(0, y\)/);
        // Every class that hides the page behind an overlay has to be covered.
        for (const className of [
            'is-modal-open',
            'is-sidebar-overlay-open',
            'is-settings-open',
            'model-picker-open',
        ]) {
            assert.ok(lock.includes(`'${className}'`), `${className} does not lock scrolling`);
        }
    });

    it('is wired up at startup', () => {
        const app = read('js/app.js');
        assert.match(app, /import \{ initScrollLock \} from '\.\/scroll-lock\.js'/);
        assert.match(app, /initScrollLock\(\)/);
        assert.match(app, /initViewportTracking\(\)/);
    });
});

describe('touch affordances', () => {
    it('gates pointer-only hover effects behind (hover: hover)', () => {
        for (const [file, selectors] of [
            ['css/components.css', [
                '.input-bar__button:hover:not(:disabled)',
                '.input-bar__icon-btn:hover:not(:disabled)',
                '.modal__close:hover',
                '.modal__nav-btn:hover',
                '.spend-tracker:hover',
            ]],
            ['css/layout.css', ['.empty-state__chip:hover', '.empty-state__button:hover']],
        ]) {
            const source = read(file);
            const hoverBlocks = Array.from(
                source.matchAll(/@media \(hover: hover\)[^{]*\{([\s\S]*?)\n\}/g),
                (m) => m[1]
            ).join('\n');
            for (const selector of selectors) {
                assert.ok(
                    hoverBlocks.includes(selector),
                    `${selector} in ${file} would stick after a tap on iOS`
                );
            }
        }
    });
});
