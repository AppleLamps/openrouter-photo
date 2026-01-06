module.exports = async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Api-Key');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
    }

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

    const redactKey = (text) => {
        if (!text) return text;
        const str = String(text);
        return str.replace(/sk-or-v1-[a-zA-Z0-9.\-_]+/g, '[REDACTED_API_KEY]');
    };

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
                model: 'x-ai/grok-4-fast',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert prompt engineer for AI image generation. Rewrite the user\'s simple prompt into a detailed, descriptive, and artistic prompt suitable for high-quality text-to-image models. Keep it under 40 sentences. Output ONLY the raw prompt text, no markdown or conversational filler.'
                    },
                    {
                        role: 'user',
                        content: prompt.trim()
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
}
