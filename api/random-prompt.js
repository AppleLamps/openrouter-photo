const { withMiddleware, redactKey, resolveOpenRouterApiKey } = require('./_middleware');

module.exports = withMiddleware(async function handler(req, res) {
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

    const systemPrompt = `Generate ONE unique, detailed AI image prompt (1-3 sentences). Output ONLY the raw prompt text — no quotes, no markdown, no explanations.

Be specific and visually interesting. Randomly vary subject, setting, art style, mood, lighting, and time period. Include concrete visual details, a named style or reference, and specific lighting. Write as one flowing passage.`;

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.referer || 'https://ai-image-generator.vercel.app',
                'X-Title': 'AI Image Generator'
            },
            body: JSON.stringify({
                model: 'x-ai/grok-4.1-fast',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: 'Generate a random creative image prompt.'
                    }
                ],
                max_tokens: 300,
                temperature: 1.2 // Higher temperature for more randomness
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', redactKey(errorText));
            return res.status(response.status).json({
                error: 'Failed to generate random prompt',
                details: redactKey(errorText)
            });
        }

        const data = await response.json();

        // Extract the content from the response
        const randomPrompt = data.choices?.[0]?.message?.content;

        if (!randomPrompt) {
            return res.status(500).json({ error: 'No content returned from API' });
        }

        return res.status(200).json({
            prompt: randomPrompt.trim()
        });
    } catch (error) {
        console.error('Server error:', redactKey(error));
        return res.status(500).json({ error: 'Internal server error' });
    }
});
