const { redactKey } = require('../_middleware');
const { formatEvolinkError } = require('./format-errors');

const EVOLINK_ASPECT_RATIOS = new Set(['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);

async function handleEvolink(ctx) {
    const {
        res,
        model,
        prompt,
        parsedNumImages,
        normalizedAspectRatio,
        resolution,
        normalizedInputImages,
        evolinkKey,
    } = ctx;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const evolinkHeaders = {
        Authorization: `Bearer ${evolinkKey}`,
        'Content-Type': 'application/json',
    };

    const extractEvolinkResults = (data) => {
        const candidates = [
            data?.results,
            data?.data?.results,
            data?.output,
            data?.data?.output,
            data?.images,
            data?.data?.images,
        ];
        for (const value of candidates) {
            if (Array.isArray(value)) {
                return value
                    .map((item) => {
                        if (typeof item === 'string') return item;
                        return item?.url || item?.image_url || item?.file_url || null;
                    })
                    .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
            }
        }
        return [];
    };

    const uploadEvolinkReferenceImage = async (dataUrl, index) => {
        const uploadResponse = await fetch('https://files-api.evolink.ai/api/v1/files/upload/base64', {
            method: 'POST',
            headers: evolinkHeaders,
            body: JSON.stringify({
                base64_data: dataUrl,
                file_name: `seedream-reference-${Date.now()}-${index + 1}.jpg`,
            }),
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            const formatted = formatEvolinkError(errorText, 'Failed to upload reference image to Evolink');
            const error = new Error(formatted.details || formatted.error);
            error.status = uploadResponse.status;
            error.payload = formatted;
            throw error;
        }

        const uploadData = await uploadResponse.json();
        const fileUrl = uploadData?.data?.file_url || uploadData?.data?.download_url || uploadData?.file_url;
        if (!fileUrl || typeof fileUrl !== 'string') {
            const error = new Error('Evolink file upload did not return a usable image URL');
            error.status = 502;
            error.payload = { error: error.message };
            throw error;
        }
        return fileUrl;
    };

    try {
        const uploadedImageUrls = normalizedInputImages.length > 0
            ? await Promise.all(normalizedInputImages.map(uploadEvolinkReferenceImage))
            : [];

        const quality = resolution === '4K' ? '4K' : '2K';
        const normalizedSize = EVOLINK_ASPECT_RATIOS.has(normalizedAspectRatio)
            ? normalizedAspectRatio
            : 'auto';

        const evolinkPayload = {
            model: 'doubao-seedream-4.5',
            prompt: prompt.trim(),
            n: parsedNumImages,
            size: normalizedSize,
            quality,
            prompt_priority: 'standard',
            ...(uploadedImageUrls.length > 0 ? { image_urls: uploadedImageUrls } : {}),
        };

        const createResponse = await fetch('https://api.evolink.ai/v1/images/generations', {
            method: 'POST',
            headers: evolinkHeaders,
            body: JSON.stringify(evolinkPayload),
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            return res.status(createResponse.status).json({
                ...formatEvolinkError(errorText, 'Failed to start image generation via Evolink'),
            });
        }

        const createData = await createResponse.json();
        const taskId = createData?.id || createData?.task_id || createData?.data?.id;
        if (!taskId) {
            return res.status(502).json({ error: 'Evolink request did not return a task ID' });
        }

        for (let attempt = 0; attempt < 45; attempt++) {
            if (attempt > 0) await delay(2000);

            const taskResponse = await fetch(`https://api.evolink.ai/v1/tasks/${encodeURIComponent(taskId)}`, {
                headers: { Authorization: `Bearer ${evolinkKey}` },
            });

            if (!taskResponse.ok) {
                const errorText = await taskResponse.text();
                return res.status(taskResponse.status).json({
                    ...formatEvolinkError(errorText, 'Failed to retrieve Evolink task status'),
                });
            }

            const taskData = await taskResponse.json();
            const status = String(taskData?.status || taskData?.data?.status || '').toLowerCase();

            if (status === 'completed') {
                const results = extractEvolinkResults(taskData).slice(0, parsedNumImages);
                if (results.length === 0) {
                    return res.status(502).json({ error: 'Evolink completed without returning image URLs' });
                }

                const requestMeta = {
                    model: 'doubao-seedream-4.5',
                    provider_name: 'evolink',
                    generation_id: taskId,
                    created_at: taskData?.created || createData?.created || null,
                    usage: 0,
                    credits_reserved: createData?.usage?.credits_reserved || null,
                    imageCount: results.length,
                    usage_pending: false,
                };

                return res.status(200).json({
                    images: results.map((url) => ({
                        url,
                        model,
                        cost: 0,
                        provider: 'evolink',
                    })),
                    meta: {
                        total_usage: 0,
                        requests: [requestMeta],
                        usage_pending: false,
                    },
                });
            }

            if (status === 'failed') {
                const taskError = taskData?.error || taskData?.data?.error;
                return res.status(502).json({
                    ...formatEvolinkError(JSON.stringify(taskError || taskData), 'Evolink image generation failed'),
                });
            }
        }

        return res.status(504).json({ error: 'Evolink image generation timed out. Please try again.' });
    } catch (error) {
        if (error?.payload) {
            return res.status(error.status || 502).json(error.payload);
        }
        console.error('Evolink API error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { handleEvolink };
