const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script id="startup-sidebar-state">([\s\S]*?)<\/script>/)[1];

function restore({ desktop = true, preference = null, storageBlocked = false } = {}) {
    const classes = new Map();
    function element(key) {
        if (!classes.has(key)) classes.set(key, new Set());
        return { classList: { add: value => classes.get(key).add(value) } };
    }
    vm.runInNewContext(script, {
        window: { matchMedia: query => { assert.equal(query, '(min-width: 901px)'); return { matches: desktop }; } },
        localStorage: { getItem: key => { assert.equal(key, 'sidebar_open'); if (storageBlocked) throw new Error('Blocked'); return preference; } },
        document: { getElementById: element, querySelector: element, body: element('body') },
    });
    return classes;
}

describe('stable startup layout', () => {
    it('loads every stylesheet in the head before first paint without async media switching', () => {
        const head = html.slice(0, html.indexOf('</head>'));
        const sheets = [...head.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(match => match[0]);
        assert.equal(sheets.length, 5);
        assert.ok(sheets.at(-1).includes('css/mobile.css'));
        assert.ok(sheets.every(sheet => !/media=|onload=/.test(sheet)));
        assert.ok(head.includes('rel="modulepreload" href="js/app.js"'));
        assert.doesNotMatch(head, /\.empty-state__title\{|\.input-bar__container\{/);
    });
    it('sets the default desktop sidebar geometry before parsing main content', () => {
        assert.ok(html.indexOf('id="startup-sidebar-state"') < html.indexOf('<main'));
        const classes = restore();
        assert.ok(classes.get('sidebar').has('sidebar--open'));
        assert.ok(classes.get('.app-container').has('app-container--sidebar-open'));
        assert.ok(classes.get('sidebar-expand').has('sidebar__expand-btn--hidden'));
    });
    it('respects a saved closed desktop sidebar', () => {
        assert.equal(restore({ preference: 'closed' }).get('sidebar'), undefined);
    });
    it('keeps the sidebar closed on phone and tablet widths even with a saved open preference', () => {
        assert.equal(restore({ desktop: false, preference: 'open' }).get('sidebar'), undefined);
    });
    it('keeps desktop defaults if browser storage is unavailable', () => {
        assert.ok(restore({ storageBlocked: true }).get('sidebar').has('sidebar--open'));
    });
});
