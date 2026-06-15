const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_MODEL_ID, getApiKey } = require('../api/model-catalog');

const PROVIDER_NAMES = {
    openrouter: 'OpenRouter',
    xai: 'xAI',
    evolink: 'Evolink',
};

describe('empty state API key prompt', () => {
    it('matches the default model provider', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const defaultProvider = getApiKey(DEFAULT_MODEL_ID);
        assert.match(html, new RegExp(`You need (?:an? )?${PROVIDER_NAMES[defaultProvider]} API key`));
    });
});
