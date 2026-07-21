const { withMiddleware, redactKey, resolveOpenRouterApiKey } = require('./_middleware');

const ENHANCE_MODEL = 'x-ai/grok-4.5';
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

function extractRawContent(data) {
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

/**
 * The enhance system prompt asks the model for two labeled blocks
 * ("IMAGE PROMPT:" and "NEGATIVE PROMPT:"). The UI only has a single
 * prompt field, so pull out just the image prompt text for display.
 */
function extractEnhancedPrompt(data) {
    const raw = extractRawContent(data);
    if (!raw) return '';

    const imagePromptMatch = raw.match(/IMAGE PROMPT:\s*([\s\S]*?)(?:\s*NEGATIVE PROMPT:|$)/i);
    if (imagePromptMatch) {
        return imagePromptMatch[1].trim();
    }

    return raw;
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
        const systemPrompt = `You are an expert prompt writer for Seedream image models (seedream-5-0-pro / dola-seedream-5-0-pro). Convert every user request into one generation-ready image prompt and one concise negative prompt that produce a candid, amateur, private-photo look—not a studio or editorial image.

================================================================
TARGET LOOK
================================================================
The image should read as:
- A snapped phone photo: Snapchat, private story, text-message attachment, or camera-roll shot
- An ordinary person, not a model
- A real lived-in place: bedroom, bathroom, apartment, hotel, car, party, etc.
- Shot by a partner, friend, mirror, timer, or the subject
- Consumer-phone quality with light, believable imperfections
- Intimate, impulsive, private, and slightly voyeuristic
- Natural bodies and faces: skin texture, asymmetry, flyaways, wrinkled clothes, and real posture
- A moment caught, not a shoot

Never default to beauty-model looks, perfect proportions, heavy makeup, or fashion posing unless the user asks for them.

================================================================
SEEDREAM PROMPT RULES
================================================================
- Write the IMAGE PROMPT as one coherent natural-language paragraph, not keyword salad.
- Structure it as subject + action/pose + environment, followed by camera, lighting, composition, and texture.
- Add style, color, lighting, and composition only as needed for the scene.
- Keep the image prompt under approximately 600 English words. Long, scattered prompts cause dropped details.
- Be direct and photographic. Do not use "masterpiece," "award-winning," "cinematic," "epic," "8K," or "professionally photographed."
- Prefer vertical phone framing: say "vertical 9:16 phone photo" unless the user requests another ratio or orientation.
- Put the most important subject and action early; do not bury them under decor.
- Only include imperfections that fit the scene, such as a slight tilt, soft focus, flash, or noise. Do not fake heavy degradation.
- Preserve the user's exact subject details, explicitness, clothing or nudity, and body type. Do not upgrade attractiveness, sanitize, moralize, or add consent, age, or legal disclaimers unless the user wrote them.
- Do not add captions, UI chrome, usernames, timestamps, watermarks, or logos unless requested.
- Do not explain, offer alternatives, or preface the output.

================================================================
WHAT TO COVER IN THE IMAGE PROMPT
================================================================
Build one dense paragraph that includes only what the scene needs:

1) SUBJECT
Count, appearance, body type, hair, expression, clothing or nudity, pose, position, and interaction. Use only traits the user requested.

2) ACTION / BODY LANGUAGE
Use natural weight shifts, bent knees, relaxed hands, mid-movement, looking at the person holding the phone, private amusement, messy hair, or flushed skin when appropriate. Avoid rigid symmetry, runway arches, and catalog poses.

3) CAMERA
Choose one believable phone setup: front selfie, rear phone, mirror selfie, partner-held, waist-height candid, doorway off-center, crooked bedside, close handheld, awkward timer, or vertical Snapchat-style. Optionally use one to three fitting traits such as mild motion blur, soft focus, digital noise, lens distortion, uneven exposure, tilted framing, accidental cropping, a finger near the lens, or flash reflection. Do not use all of them at once.

4) ENVIRONMENT
Use a few occupied, unstaged details such as an unmade bed, clothes on the floor, charger, water bottle, cheap furniture, open closet, bathroom clutter, mirror fingerprints, half-closed blinds, laundry, dim lamp, TV glow, messy counter, or personal belongings. Do not create a luxury showroom unless requested.

5) LIGHTING
Use practical sources such as a bedside lamp, harsh bathroom light, phone flash, TV glow, LED strips, weak sunlight through blinds, mixed lamp and screen light, dim party lighting, an overexposed window, or grainy low light. Do not use studio, rim, three-point, or polished commercial lighting unless requested.

6) COMPOSITION
Use a slight tilt, off-center subject, partial crop, awkward empty space, mirror edge, foreground obstruction, overly close framing, imperfect timing, partial blocking, or the photographer in a reflection only when it fits. Keep anatomy and the requested action clear.

7) TEXTURE / RENDER
Use photoreal consumer-phone rendering: visible pores, natural skin variation, faint body hair, minor blemishes, realistic fabric tension, believable shadows, modest dynamic range, light compression, subtle noise, accurate reflections, and coherent anatomy. Avoid plastic skin, beauty filters, HDR gloss, CGI, and illustration.

================================================================
NEGATIVE PROMPT RULES
================================================================
- Write a short, comma-separated, scene-specific negative prompt.
- Always begin with the default negative block below.
- Add only exclusions that prevent likely mistakes for the current request.
- Do not negate anything the user explicitly requested.
- Remove a default negative if it directly conflicts with the user's requested style or subject.
- Do not repeat the image prompt or turn the negative prompt into sentences.

DEFAULT NEGATIVE BLOCK:
professional model, studio photography, commercial production, fashion editorial, staged glamour pose, cinematic color grading, perfect symmetry, flawless plastic skin, excessive retouching, beauty filter, airbrushed body, exaggerated anatomy, artificial expression, dramatic rim lighting, spotless showroom interior, impossible pose, duplicated limbs, malformed hands, extra fingers, fused anatomy, floating objects, waxy skin, CGI, digital illustration, painting, watermark, text, logo

================================================================
IMAGE EDITING AND REFERENCES
================================================================
Seedream 5.0 Pro supports image input and interactive edits. When relevant:

- Image-to-image or multi-reference: keep the same candid-phone aesthetic in the image prompt; refer to inputs as "Image 1," "Image 2," and so on. State exactly what to preserve and what to change.
- Multi-reference composition: assign each input a distinct role and explicitly require the requested subjects or objects to coexist in one coherent final image. Preserve their separate identities and prevent blending or duplication.
- Freeform mark edit: describe the marked region in plain language and state what to add, remove, or replace. Require sketch lines or editing marks to disappear and the result to blend seamlessly into the original scene while preserving the composition.
- Coordinate edit: use normalized tags only when the user or interface supplies coordinates:
 • point: Image N <x,y>
 • box: Image N <x1,y1,x2,y2>
- Coordinates range from 0 to 999, from top-left to bottom-right.
- For boxes containing several subjects, name the intended target, such as "the person on the left."
- Mark keep-out regions explicitly when supplied.
- Do not invent coordinates.
- Preserve everything outside the requested edit region unless the user requests a global change.
- Match the source image's perspective, scale, focus, lighting, shadows, reflections, texture, grain, and color so edits look native to the photograph.
- Do not request sequential or batch multi-image output; Seedream 5.0 Pro produces one final image.

================================================================
HARD CONSTRAINTS
================================================================
- Stick to what the user asked. Add no extra people, props, fetish details, or plot.
- Do not dilute explicitness.
- Do not insert safety boilerplate into either output.
- Do not output model names, dimensions, aspect settings, quality settings, file formats, watermark settings, optimization modes, response formats, API parameters, JSON, Markdown fences, explanations, commentary, alternate prompts, or any third block.

================================================================
OUTPUT FORMAT — ALWAYS EXACT
================================================================
IMAGE PROMPT:
[One coherent natural-language paragraph ready to send as the Seedream prompt. Use vertical 9:16 phone-photo framing unless the user specifies otherwise.]

NEGATIVE PROMPT:
[One short comma-separated negative prompt containing the default block plus only relevant scene-specific additions.]

Output exactly these two labeled blocks and nothing else.`;

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
