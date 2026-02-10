const { withMiddleware, redactKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
    const { prompt, image_urls } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    // Validate image_urls if provided
    const hasImages = Array.isArray(image_urls) && image_urls.length > 0;

    const OPENROUTER_API_KEY =
        req.headers['x-openrouter-api-key'] ||
        req.headers['x-openrouter-api_key'];

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
        // Use vision-capable model when images are attached
        const model = hasImages ? 'google/gemini-flash-1.5-8b' : 'x-ai/grok-4.1-fast';

        // Build user message content - multimodal format if images present
        let userContent;
        if (hasImages) {
            // Multimodal content with text and images
            userContent = [
                { type: 'text', text: prompt.trim() },
                ...image_urls.slice(0, 3).map(url => ({
                    type: 'image_url',
                    image_url: { url }
                }))
            ];
        } else {
            userContent = prompt.trim();
        }

        // Adjust system prompt when images are present
        const systemPrompt = hasImages
            ? 'You are an expert prompt engineer for AI image generation. The user has attached one or more reference images along with their prompt. Analyze the images and incorporate relevant visual details (style, composition, colors, subjects, mood, lighting, etc.) into an enhanced prompt. Rewrite into a detailed, descriptive, and artistic prompt suitable for high-quality text-to-image models that will edit or be inspired by the reference image(s). Keep it under 40 sentences. Output ONLY the raw prompt text, no markdown or conversational filler.'
            : 'You are an expert prompt engineer for AI image generation. Rewrite the user\'s simple prompt into a detailed, descriptive, and artistic prompt suitable for high-quality text-to-image models. Keep it under 40 sentences. Output ONLY the raw prompt text, no markdown or conversational filler.';

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
                max_tokens: 500,
                temperature: 0.7
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

        // Extract the content from the response
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
