const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadPollingModule() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'video-polling.js'), 'utf8');
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

describe('video polling resilience', () => {
    it('retries transient network and server failures', async () => {
        const { isRetryablePollError } = await loadPollingModule();

        assert.equal(isRetryablePollError(new TypeError('Failed to fetch')), true);
        assert.equal(isRetryablePollError(Object.assign(new Error('Unavailable'), { status: 503 })), true);
        assert.equal(isRetryablePollError(Object.assign(new Error('Rate limited'), { status: 429 })), true);
    });

    it('does not hide permanent authentication failures', async () => {
        const { isRetryablePollError } = await loadPollingModule();

        assert.equal(isRetryablePollError(Object.assign(new Error('Unauthorized'), { status: 401 })), false);
    });
});
