const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

it('README model tables are up to date with the catalog', async () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const start = readme.indexOf('<!-- models:start -->');
    const end = readme.indexOf('<!-- models:end -->');
    assert.ok(start !== -1 && end > start, 'README.md is missing the models:start / models:end markers');
    const block = readme.slice(start + '<!-- models:start -->'.length, end).trim();

    const { buildModelTables } = await import('../scripts/model-table.mjs');
    assert.equal(block, buildModelTables().trim(),
        'README model tables are stale: run `node scripts/model-table.mjs --write`');
});
