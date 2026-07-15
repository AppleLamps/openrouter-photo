function buildEvolinkProxyUrl(url) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function extractEvolinkResultUrls(data) {
    const candidates = [
        data?.results,
        data?.data?.results,
        data?.output,
        data?.data?.output,
        data?.images,
        data?.data?.images,
    ];

    for (const value of candidates) {
        if (!Array.isArray(value)) continue;
        const urls = value
            .map((item) => {
                if (typeof item === 'string') return item;
                return item?.url || item?.image_url || item?.video_url || item?.file_url || null;
            })
            .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
        if (urls.length > 0) return urls;
    }

    const single = data?.video?.url || data?.image?.url || data?.url || data?.data?.url;
    return typeof single === 'string' && /^https?:\/\//i.test(single) ? [single] : [];
}

function toEvolinkImage(url, model, cost) {
    return {
        url: buildEvolinkProxyUrl(url),
        source_url: url,
        sourceUrl: url,
        model,
        cost,
        provider: 'evolink',
        media_type: 'image',
    };
}

module.exports = {
    buildEvolinkProxyUrl,
    extractEvolinkResultUrls,
    toEvolinkImage,
};
