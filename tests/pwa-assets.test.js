const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function reachableStartupAssets() {
    const seen = new Set();
    const visit = (relative) => {
        const normalized = relative.replace(/\\/g, '/');
        if (seen.has(normalized)) return;
        seen.add(normalized);
        if (!normalized.endsWith('.js')) return;
        const source = read(normalized);
        for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
            if (!match[1].startsWith('.')) continue;
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(normalized), match[1]));
            visit(resolved);
        }
    };
    visit('js/app.js');
    return seen;
}

describe('PWA startup coverage', () => {
    it('precaches every module and JSON asset reachable from app.js', () => {
        const worker = read('sw.js');
        const manifest = new Set(Array.from(worker.matchAll(/['"](\/[^'"]+)['"]/g), (match) => match[1]));
        for (const asset of reachableStartupAssets()) {
            assert.ok(manifest.has(`/${asset}`), `${asset} is reachable from app.js but missing from CORE_ASSETS`);
        }
        assert.match(worker, /request\.mode === 'navigate'[\s\S]*caches\.match\('\/'\)/);
        assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
    });

    it('serves the root service worker from Express', () => {
        assert.match(read('server.js'), /app\.get\('\/sw\.js'[\s\S]*sendFile\(path\.join\(__dirname, 'sw\.js'\)\)/);
    });

    it('precaches the same checked-in JSZip URL used by the gallery', () => {
        const gallery = read('js/gallery.js');
        const worker = read('sw.js');
        const vendorUrl = gallery.match(/script\.src = ['"]([^'"]*jszip\.min\.js)['"]/)?.[1];
        assert.equal(vendorUrl, '/public/vendor/jszip.min.js');
        assert.match(worker, new RegExp(`['"]${vendorUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
    });
});
