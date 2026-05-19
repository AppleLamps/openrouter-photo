const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

function getRouteDest(src) {
    return config.routes.find((route) => route.src === src)?.dest;
}

describe('vercel config', () => {
    it('routes every settings API key test endpoint before the SPA catch-all', () => {
        assert.equal(getRouteDest('/api/test-key'), '/api/test-key.js');
        assert.equal(getRouteDest('/api/test-xai-key'), '/api/test-xai-key.js');
        assert.equal(getRouteDest('/api/test-fal-key'), '/api/test-fal-key.js');
        assert.equal(getRouteDest('/api/test-evolink-key'), '/api/test-evolink-key.js');

        const catchAllIndex = config.routes.findIndex((route) => route.src === '/(.*)');
        for (const src of ['/api/test-key', '/api/test-xai-key', '/api/test-fal-key', '/api/test-evolink-key']) {
            const routeIndex = config.routes.findIndex((route) => route.src === src);
            assert.ok(routeIndex > -1 && routeIndex < catchAllIndex, `${src} must route before catch-all`);
        }
    });

    it('configures generate duration without legacy builds conflict', () => {
        assert.equal(config.builds, undefined);
        assert.equal(config.fluid, true);
        assert.ok(config.functions['api/generate.js'].maxDuration >= 120);
    });

    it('has the social share image referenced by index.html', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        assert.match(html, /\/public\/og-image\.png/);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'og-image.png')));
    });

    it('keeps the root service worker as the only checked-in service worker', () => {
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'sw.js')));
        assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'sw.js')), false);
        assert.equal(getRouteDest('/sw.js'), '/sw.js');
    });
});
