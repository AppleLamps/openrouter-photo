async page => {
    const saved = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        for (const image of state.getImages()) if (image.id === 'local-video-check' || image.id.startsWith('lazy-')) await state.removeImage(image.id);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 32, 32);
        const stream = canvas.captureStream(0);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];
        const blob = await new Promise(resolve => {
            recorder.ondataavailable = event => chunks.push(event.data);
            recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
            recorder.start();
            stream.getVideoTracks()[0].requestFrame();
            setTimeout(() => { ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 32, 32); stream.getVideoTracks()[0].requestFrame(); }, 200);
            setTimeout(() => recorder.stop(), 1000);
        });
        stream.getTracks().forEach(track => track.stop());
        const source = URL.createObjectURL(blob);
        const result = await state.addImage({ id: 'local-video-check', prompt: 'Local video', createdAt: Date.now(), mediaType: 'video', url: source });
        const full = await state.storage.getFullImageBlob(result.image.id);
        const poster = await state.storage.getThumbnailBlob(result.image.id);
        const estimate = state.storage.getStorageEstimate;
        state.storage.getStorageEstimate = async () => ({ quota: 1, used: 1 });
        const limited = await state.addImage({ id: 'quota-video-check', prompt: 'Quota', createdAt: 0, mediaType: 'video', url: source });
        state.storage.getStorageEstimate = estimate;
        await state.removeImage('quota-video-check');
        URL.revokeObjectURL(source);
        const thumbnail = new Blob(['thumb'], { type: 'image/webp' });
        for (let i = 0; i < 80; i++) await state.storage.saveImage({ id: `lazy-${i}`, prompt: 'Lazy fixture', createdAt: i, mediaType: 'image' }, thumbnail, thumbnail);
        return { persisted: result.persisted, bytes: full?.size, originalBytes: blob.size, poster: poster?.size, quotaReported: limited.persisted === false };
    });
    if (!saved.persisted || saved.bytes !== saved.originalBytes || !saved.poster || !saved.quotaReported) throw new Error(JSON.stringify(saved));
    await page.reload();
    await page.waitForFunction(async () => (await import('/js/state.js')).state.getImageCount() === 82);
    const loaded = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        const url = await state.getFullImageUrl('local-video-check');
        const result = { thumbnailsLoaded: state.thumbnailBlobs.size, total: state.getImageCount(), videoLocal: url.startsWith('blob:'), videoBytes: (await (await fetch(url)).blob()).size };
        // Remove synthetic fixtures after verification.
        for (let i = 0; i < 80; i++) await state.removeImage(`lazy-${i}`);
        return result;
    });
    if (loaded.thumbnailsLoaded >= 48 || !loaded.videoLocal || loaded.videoBytes !== saved.bytes) throw new Error(JSON.stringify(loaded));
    console.log(JSON.stringify({ saved, loaded }));
}
