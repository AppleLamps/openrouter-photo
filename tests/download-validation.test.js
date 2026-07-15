const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const modulePromise = import(pathToFileURL(path.join(__dirname, '..', 'js', 'utils.js')).href);

describe('download response validation', () => {
    it('rejects non-2xx and error-document responses', async () => {
        const { responseToMediaBlob } = await modulePromise;
        await assert.rejects(responseToMediaBlob(new Response('no', { status: 404 })), /HTTP 404/);
        await assert.rejects(responseToMediaBlob(new Response('{"error":true}', { headers: { 'content-type': 'application/json' } })), /error document/);
        await assert.rejects(responseToMediaBlob(new Response('gateway error', { headers: { 'content-type': 'text/plain' } })), /error document/);
    });

    it('accepts successful binary media', async () => {
        const { responseToMediaBlob } = await modulePromise;
        const blob = await responseToMediaBlob(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }));
        assert.equal(blob.size, 3);
        assert.equal(blob.type, 'image/png');
    });
});
