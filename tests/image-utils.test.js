const { it } = require('node:test');
const assert = require('node:assert/strict');

it('decodes base64 data URIs to the original bytes', async () => {
    const { dataUriToBlob } = await import('../js/image-utils.js');
    const blob = dataUriToBlob(`data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`);
    assert.equal(blob.type, 'image/png');
    assert.equal(await blob.text(), 'png-bytes');
});

it('decodes non-base64 data URIs instead of throwing', async () => {
    const { dataUriToBlob } = await import('../js/image-utils.js');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#89a"/></svg>';
    const encoded = dataUriToBlob(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    assert.equal(encoded.type, 'image/svg+xml');
    assert.equal(await encoded.text(), svg);

    const plain = dataUriToBlob('data:image/svg+xml,<svg/>');
    assert.equal(plain.type, 'image/svg+xml');
    assert.equal(await plain.text(), '<svg/>');
});
