const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(require('node:path').join(__dirname, '..', 'js/app.js'), 'utf8');
function harness(overrides = {}) {
    const button = { disabled: false };
    const input = { value: 'existing prompt', disabled: false, focus() {} };
    const errors = [];
    const context = {
        console: { warn() {}, error() {} },
        document: { getElementById: () => button },
        setEnhanceLoading: (btn, busy) => { btn.disabled = busy; },
        setSurpriseLoading: (btn, busy) => { btn.disabled = busy; },
        setComposerStatus() {}, flashInput() {}, autoResizeTextarea() {},
        showInfo() {}, showError: error => errors.push(error),
        showApiKeyPopupForCode: () => false,
        getAttachedImageUrls: () => ['data:image/png;base64,test'],
        enhancePrompt: async () => 'photo recreation',
        getRandomPromptFromAI: async () => 'AI prompt',
        getRandomPrompt: () => 'built-in prompt',
        setTimeout: callback => callback(),
        ...overrides,
    };
    vm.createContext(context);
    const recreate = app.slice(app.indexOf('async function handleRecreatePhoto'), app.indexOf('async function handleEnhance'));
    const surprise = app.slice(app.indexOf('async function handleSurpriseMe'), app.indexOf('function setSurpriseLoading'));
    // Run the production click handlers with minimal DOM and network dependencies.
    vm.runInContext('let _surpriseTypingToken = 0;\n' + recreate + '\n' + surprise, context);
    return { context, input, button, errors };
}
it('fills the prompt from a photo even when the composer is empty', async () => {
    let args;
    const h = harness({ enhancePrompt: async (...values) => { args = values; return 'photo recreation'; } });
    h.input.value = '';
    await h.context.handleRecreatePhoto(h.input, h.button);
    assert.equal(h.input.value, 'photo recreation');
    assert.equal(args[3], 'recreate');
    assert.equal(args[1].length, 1);
    assert.equal(h.input.disabled, false);
    assert.equal(h.button.disabled, false);
});
it('preserves the current prompt when no photo is attached', async () => {
    const h = harness({ getAttachedImageUrls: () => [] });
    await h.context.handleRecreatePhoto(h.input, h.button);
    assert.equal(h.input.value, 'existing prompt');
    assert.match(h.errors[0], /Attach a photo/);
});
it('restores controls and preserves the current prompt on a failed photo analysis', async () => {
    const h = harness({ enhancePrompt: async () => { throw new Error('Provider unavailable'); } });
    await h.context.handleRecreatePhoto(h.input, h.button);
    assert.equal(h.input.value, 'existing prompt');
    assert.equal(h.input.disabled, false);
    assert.equal(h.button.disabled, false);
    assert.equal(h.errors[0], 'Provider unavailable');
});
it('uses a built-in random prompt and restores controls when the AI request fails', async () => {
    const h = harness({ getRandomPromptFromAI: async () => { throw new Error('No API key'); } });
    await h.context.handleSurpriseMe(h.input);
    assert.equal(h.input.value, 'built-in prompt');
    assert.equal(h.input.disabled, false);
    assert.equal(h.button.disabled, false);
    assert.equal(h.errors.length, 0);
});
