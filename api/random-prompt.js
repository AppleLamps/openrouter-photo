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

    // Comprehensive system prompt with many options for variety
    const systemPrompt = `You are a creative prompt generator for AI image generation. Generate ONE unique, detailed, and imaginative prompt.

IMPORTANT RULES:
- Output ONLY the raw prompt text, no quotes, no markdown, no explanations
- Keep it between 1-3 sentences
- Be specific and descriptive
- Make it visually interesting and unique

Randomly combine elements from these categories to create variety:

SUBJECTS (pick 1-2):
- People: warrior, astronaut, wizard, dancer, chef, samurai, cyborg, witch, explorer, musician, scientist, pirate, knight, geisha, shaman, detective, acrobat, merchant, nomad, alchemist
- Animals: dragon, phoenix, wolf, owl, whale, fox, raven, tiger, elephant, octopus, butterfly, deer, snake, eagle, jellyfish, lion, bear, crow, moth, seahorse
- Creatures: spirit, golem, mermaid, centaur, griffin, fairy, ghost, elemental, chimera, treant, kraken, angel, demon, dryad, sprite
- Objects: clock, mirror, lantern, sword, crystal, book, mask, compass, key, hourglass, telescope, music box, throne, chalice, orb

SETTINGS (pick 1):
- Nature: enchanted forest, mountain peak, underwater cave, desert oasis, floating islands, ancient redwood grove, bioluminescent reef, volcanic landscape, frozen tundra, bamboo forest, cherry blossom garden, misty swamp
- Urban: neon-lit alley, rooftop garden, abandoned cathedral, Victorian mansion, steampunk workshop, cyberpunk marketplace, art deco theater, underground bunker, floating city, space station
- Fantasy: crystal palace, dragon's lair, wizard's tower, fairy ring, cloud kingdom, sunken temple, astral plane, pocket dimension, dream realm, shadow realm
- Interiors: grand library, apothecary shop, clockwork factory, throne room, observatory, greenhouse, tavern, laboratory, museum, bathhouse

STYLES (pick 1):
- Photorealistic, National Geographic style
- Oil painting, Renaissance masters
- Watercolor, soft and dreamy
- Digital art, concept art style
- Anime/manga, Studio Ghibli inspired
- 3D render, Pixar/Disney style
- Art nouveau, ornate and flowing
- Cyberpunk, neon and chrome
- Dark fantasy, gothic atmosphere
- Surrealist, dreamlike and impossible
- Retro futurism, 1950s sci-fi
- Ukiyo-e, Japanese woodblock print
- Impressionist, soft brushstrokes
- Baroque, dramatic and ornate
- Minimalist, clean and elegant
- Psychedelic, vibrant and trippy
- Steampunk, brass and gears
- Vaporwave, 80s aesthetic
- Art deco, geometric elegance
- Folk art, naive and charming

MOODS/ATMOSPHERES (pick 1):
- Serene and peaceful
- Dramatic and intense
- Mysterious and enigmatic
- Whimsical and playful
- Dark and foreboding
- Ethereal and dreamlike
- Epic and grandiose
- Melancholic and nostalgic
- Magical and enchanting
- Chaotic and dynamic
- Cozy and warm
- Eerie and unsettling
- Majestic and awe-inspiring
- Romantic and tender
- Wild and untamed

LIGHTING (pick 1):
- Golden hour, warm sunlight
- Moonlit, silver and blue
- Bioluminescent glow
- Dramatic chiaroscuro
- Neon lights, colorful reflections
- Candlelight, flickering shadows
- Northern lights, aurora
- Underwater light rays
- Storm lightning
- Starlight and galaxies
- Misty, diffused light
- Sunset/sunrise colors
- Firelight, warm orange
- Holographic, iridescent
- Volumetric fog and god rays

TIME PERIODS (optional):
- Ancient civilizations
- Medieval/Renaissance
- Victorian era
- 1920s Art Deco
- 1950s retro
- 1980s synthwave
- Near future
- Far future/sci-fi
- Timeless/mythological
- Post-apocalyptic

ADDITIONAL ELEMENTS (pick 0-2):
- Reflections in water
- Floating particles/petals
- Intricate patterns
- Weather effects (rain, snow, mist)
- Magical effects (glowing runes, sparkles)
- Wildlife in background
- Architectural details
- Fabric/textile textures
- Mechanical elements
- Natural phenomena

Now generate ONE creative, detailed prompt by randomly combining these elements in an unexpected and interesting way. Be creative and surprising!`;

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
                model: 'x-ai/grok-4.1-fast-fast',
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
}
