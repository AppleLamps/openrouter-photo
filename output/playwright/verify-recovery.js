async page => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('#image-storage-quality').evaluate(el => { el.value = 'original'; el.dispatchEvent(new Event('change')); });
    await page.reload();
    if (await page.locator('#image-storage-quality').inputValue() !== 'original') throw new Error('Quality preference did not survive reload');

    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=';
    let creates = 0;
    let polls = 0;
    await page.route('**/api/generate', route => {
        creates++;
        return route.fulfill({ status: 202, json: { status: 'pending', provider: 'evolink', model: 'test', media_type: 'image', requests: [{ request_id: 'recovery-check', index: 0, estimated_cost: 0.123 }] } });
    });
    await page.route('**/api/generation-status', route => {
        polls++;
        return route.fulfill({ json: { status: 'completed', url: png, media_type: 'image', cost: 0.123 } });
    });
    await page.getByRole('textbox', { name: 'Describe an image to generate...' }).fill('Recovery browser check');
    await page.getByRole('button', { name: 'Generate image', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('pending-generations-v1') || '[]').length === 1);
    const descriptor = await page.evaluate(() => JSON.parse(localStorage.getItem('pending-generations-v1'))[0]);
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem('pending-generations-v1') === '[]', { timeout: 20000 });
    const first = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        return { count: state.getImageCount(), spend: JSON.parse(localStorage.getItem('openrouter_spend_v1')).total };
    });
    if (first.count !== 1 || first.spend !== 0.123 || creates !== 1 || polls < 1) throw new Error(JSON.stringify({ first, creates, polls }));
    await page.evaluate(entry => localStorage.setItem('pending-generations-v1', JSON.stringify([entry])), { ...descriptor, result: { status: 'completed', url: png, cost: 0.123, media_type: 'image' } });
    await page.reload();
    await page.waitForFunction(() => localStorage.getItem('pending-generations-v1') === '[]');
    const second = await page.evaluate(async png => {
        const { state } = await import('/js/state.js');
        const blob = await state.storage.getFullImageBlob(state.getImages()[0].id);
        const original = await (await fetch(png)).blob();
        const same = (await blob.arrayBuffer()).byteLength === (await original.arrayBuffer()).byteLength && blob.type === original.type;
        return { count: state.getImageCount(), spend: JSON.parse(localStorage.getItem('openrouter_spend_v1')).total, originalPreserved: same };
    }, png);
    if (second.count !== 1 || second.spend !== 0.123 || !second.originalPreserved) throw new Error(JSON.stringify(second));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ creates, polls, first, second, errors }));
}
