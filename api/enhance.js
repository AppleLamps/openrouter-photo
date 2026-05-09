const { withMiddleware, redactKey, resolveXaiApiKey } = require('./_middleware');

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

    const XAI_API_KEY = resolveXaiApiKey(req);

    if (!XAI_API_KEY) {
        return res.status(401).json({
            code: 'XAI_API_KEY_REQUIRED',
            error: 'xAI API key required',
            help: {
                message: 'Open Settings → paste your xAI API key. Create one at console.x.ai.',
                url: 'https://console.x.ai/team/default/api-keys'
            }
        });
    }

    try {
        const model = 'grok-4.20-beta-latest-reasoning';

        // Build user message content - xAI Responses API format
        let userContent;
        if (hasImages) {
            // Multimodal: input_image + input_text
            userContent = [
                ...image_urls.slice(0, 4).map(url => ({
                    type: 'input_image',
                    image_url: url,
                    detail: 'high'
                })),
                { type: 'input_text', text: enhancementRequest }
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

        // xAI Responses API
        const response = await fetch('https://api.x.ai/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${XAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userContent
                    }
                ],
                store: false,
                safe_mode: false
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('xAI API error:', redactKey(errorText));
            return res.status(response.status).json({
                error: 'Failed to enhance prompt',
                details: redactKey(errorText)
            });
        }

        const data = await response.json();

        // Extract text from xAI Responses API format
        // Response output contains items; find the message with output_text
        let enhancedPrompt = null;
        if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
                if (item.type === 'message' && item.content && Array.isArray(item.content)) {
                    for (const block of item.content) {
                        if (block.type === 'output_text' && block.text) {
                            enhancedPrompt = block.text;
                            break;
                        }
                    }
                    if (enhancedPrompt) break;
                }
            }
        }

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
