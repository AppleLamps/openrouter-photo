const { withMiddleware, redactKey, resolveOpenRouterApiKey } = require('./_middleware');

const ENHANCE_MODEL = 'x-ai/grok-4.3';
const MAX_ENHANCE_IMAGES = 2;

function normalizeEnhanceImageUrls(imageUrls) {
    if (!Array.isArray(imageUrls)) return [];
    return imageUrls
        .filter((url) => typeof url === 'string' && url.startsWith('data:image/'))
        .slice(0, MAX_ENHANCE_IMAGES);
}

function buildUserContent(enhancementRequest, imageUrls) {
    if (!imageUrls.length) return enhancementRequest;

    return [
        { type: 'text', text: enhancementRequest },
        ...imageUrls.map((url) => ({
            type: 'image_url',
            image_url: { url, detail: 'low' }
        })),
    ];
}

function extractEnhancedPrompt(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                return '';
            })
            .join('')
            .trim();
    }
    return '';
}

async function requestOpenRouterEnhancement(req, apiKey, systemPrompt, enhancementRequest, imageUrls) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': req.headers.referer || 'https://ai-image-generator.vercel.app',
            'X-Title': 'AI Image Generator'
        },
        body: JSON.stringify({
            model: ENHANCE_MODEL,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: buildUserContent(enhancementRequest, imageUrls)
                }
            ],
            max_tokens: 1000,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        return {
            ok: false,
            status: response.status,
            body: {
                error: 'Failed to enhance prompt',
                details: redactKey(errorText)
            },
        };
    }

    const data = await response.json();
    return {
        ok: true,
        enhancedPrompt: extractEnhancedPrompt(data),
        raw: data,
    };
}

module.exports = withMiddleware(async function handler(req, res) {
    const { prompt, image_urls, custom_instructions } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const customInstructions = typeof custom_instructions === 'string'
        ? custom_instructions.trim().slice(0, 2000)
        : '';
    const enhancementRequest = customInstructions
        ? `Original prompt:\n${prompt.trim()}\n\nEnhancement instructions:\n${customInstructions}\n\nRewrite the original prompt according to the enhancement instructions. Preserve the user's core subject and intent unless the instructions explicitly say to change them. Return only the final enhanced prompt.`
        : prompt.trim();

    const normalizedImageUrls = normalizeEnhanceImageUrls(image_urls);

    const OPENROUTER_API_KEY = resolveOpenRouterApiKey(req);

    if (!OPENROUTER_API_KEY) {
        return res.status(401).json({
            code: 'OPENROUTER_API_KEY_REQUIRED',
            error: 'OpenRouter API key required',
            help: {
                message: 'Open Settings → paste your OpenRouter API key. Create one at openrouter.ai/keys.',
                url: 'https://openrouter.ai/keys'
            }
        });
    }

    try {
        const systemPrompt = `You are a prompt engineer for AI image generation. Take the user's idea and output a production-ready image generation prompt.

OUTPUT FORMAT: Respond with ONLY the final prompt text. No labels, no markdown, no explanations, no mode or aspect ratio recommendations. Just the raw prompt.

PROMPT STRUCTURE — address all five layers:
1. Subject specificity: concrete visual details (clothing, materials, posture, expression, objects)
2. Mood/style: use named references (film directors, photography eras, art movements) instead of lone adjectives
3. Lighting: always specify source, direction, and quality
4. Composition/camera: camera position, framing, perspective
5. Finishing detail: at least one of depth of field, film grain, color grade, lens character, or texture

FOR IMAGE EDITS (when reference images are provided):
- Describe only the change, not the original photo
- For style transforms, specify what to preserve alongside what to change
- If only one element changes, only address that element

RULES:
- Write as one flowing passage, not lists
- No filler words — every word does visual work
- No prompt syntax spam (no "4k, ultra HD, masterpiece, best quality")
- Match prompt length to complexity: simple ideas get short prompts, complex ideas get detailed ones`;

        const attempts = [
            normalizedImageUrls,
            ...(normalizedImageUrls.length > 1 ? [normalizedImageUrls.slice(0, 1)] : []),
            ...(normalizedImageUrls.length > 0 ? [[]] : []),
        ];

        let lastEmptyResponse = null;
        for (const attemptImageUrls of attempts) {
            const result = await requestOpenRouterEnhancement(
                req,
                OPENROUTER_API_KEY,
                systemPrompt,
                enhancementRequest,
                attemptImageUrls
            );

            if (!result.ok) {
                console.error('OpenRouter API error:', result.body.details);
                return res.status(result.status).json(result.body);
            }

            if (result.enhancedPrompt) {
                return res.status(200).json({
                    enhancedPrompt: result.enhancedPrompt
                });
            }

            lastEmptyResponse = result.raw;
        }

        console.warn('OpenRouter returned empty enhancement response:', redactKey(JSON.stringify(lastEmptyResponse || {})));
        return res.status(502).json({
            error: 'OpenRouter returned an empty prompt. Try again or use fewer reference images.'
        });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports.__test = {
    buildUserContent,
    extractEnhancedPrompt,
    normalizeEnhanceImageUrls,
};
