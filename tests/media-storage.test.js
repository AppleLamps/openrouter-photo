const { it } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');

it('loads metadata without thumbnail bytes and preserves full video blobs', async () => {
    const { ImageStorage } = await import('../js/storage.js');
    const storage = new ImageStorage();
    await storage.ready;
    const video = new Blob(['saved-video'], { type: 'video/mp4' });
    const poster = new Blob(['poster'], { type: 'image/webp' });
    await storage.saveImage({ id: 'video', createdAt: 20, mediaType: 'video' }, video, poster);
    await storage.saveImage({ id: 'old', createdAt: 10 }, new Blob(['image']), poster);
    const entries = await storage.getAllImages();
    assert.deepEqual(entries.map(entry => entry.id), ['video', 'old']);
    assert.equal(entries[0].thumbnailBlob, undefined);
    assert.equal(await (await storage.getFullImageBlob('video')).text(), 'saved-video');
    assert.equal(await (await storage.getThumbnailBlob('video')).text(), 'poster');
    await storage.deleteImage('video');
    assert.equal(await storage.getFullImageBlob('video'), null);
    assert.equal(await storage.getThumbnailBlob('video'), null);
    await storage.clear();
    storage.db.close();
});
