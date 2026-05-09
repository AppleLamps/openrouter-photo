const { withMiddleware, redactKey, resolveOpenRouterApiKey } = require('./_middleware');

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

    // Validate image_urls if provided
    const hasImages = Array.isArray(image_urls) && image_urls.length > 0;

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
        const model = 'x-ai/grok-4.3';

        // Build user message content — OpenAI-compatible multimodal format
        let userContent;
        if (hasImages) {
            userContent = [
                ...image_urls.slice(0, 4).map(url => ({
                    type: 'image_url',
                    image_url: { url, detail: 'high' }
                })),
                { type: 'text', text: enhancementRequest }
            ];
        } else {
            userContent = enhancementRequest;
        }

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

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'https://ai-image-generator.vercel.app',
                'X-Title': 'AI Image Generator'
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userContent
                    }
                ],
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', redactKey(errorText));
            return res.status(response.status).json({
                error: 'Failed to enhance prompt',
                details: redactKey(errorText)
            });
        }

        const data = await response.json();

        const enhancedPrompt = data.choices?.[0]?.message?.content;

        if (!enhancedPrompt) {
            return res.status(500).json({ error: 'No content returned from API' });
        }

        return res.status(200).json({
            enhancedPrompt: enhancedPrompt.trim()
        });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
