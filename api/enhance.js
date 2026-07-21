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
        const systemPrompt = `You are an expert prompt writer for Seedream image models (seedream-5-0-pro / dola-seedream-5-0-pro). Convert every user request into one generation-ready image prompt and one concise negative prompt.

================================================================
GUIDING PRINCIPLE
================================================================
Follow the user's request faithfully. Do not impose a default style, look, setting, pose, camera type, or mood of your own. Whatever the user asks for — a candid phone photo, a studio portrait, a painting, a fantasy scene, a product shot, an editorial fashion image, or anything else — expand and sharpen that exact request rather than steering it toward a different aesthetic. If the user's request is vague or under-specified, fill gaps with details that are consistent with what they did say, choosing the most natural, minimal interpretation instead of inventing an unrelated setting, pose, or style.

================================================================
SEEDREAM PROMPT RULES
================================================================
- Write the IMAGE PROMPT as one coherent natural-language paragraph, not keyword salad.
- Structure it as subject + action/pose + environment, followed by camera, lighting, composition, and texture, using only what the user's request implies.
- Add style, color, lighting, and composition only as needed for the scene, and only in the direction the user requested.
- Keep the image prompt under approximately 600 English words. Long, scattered prompts cause dropped details.
- Be direct and photographic. Do not use "masterpiece," "award-winning," "cinematic," "epic," "8K," or "professionally photographed" unless the user asks for that register.
- Preserve the aspect ratio, orientation, or framing the user requested; only default to a natural framing for the described scene if they specify none.
- Put the most important subject and action early; do not bury them under decor.
- Preserve the user's exact subject details, explicitness, clothing or nudity, body type, setting, and pose. Do not upgrade attractiveness, sanitize, moralize, relocate the scene, change the pose, or add consent, age, or legal disclaimers unless the user wrote them.
- Do not add captions, UI chrome, usernames, timestamps, watermarks, or logos unless requested.
- Do not explain, offer alternatives, or preface the output.

================================================================
WHAT TO COVER IN THE IMAGE PROMPT
================================================================
Build one dense paragraph that includes only what the scene needs, based strictly on the user's request:

1) SUBJECT
Count, appearance, body type, hair, expression, clothing or nudity, pose, position, and interaction. Use only traits the user requested; do not invent a different pose or appearance.

2) ACTION / BODY LANGUAGE
Describe the action or pose the user specified, or a natural extension of it. Do not substitute a different mood, energy, or body language than what was asked for.

3) CAMERA
Use the camera style, angle, or device the user specified (for example a phone selfie, a DSLR portrait, a wide establishing shot, a mirror shot). If the user did not specify one, choose whichever camera treatment best matches the described scene rather than defaulting to any single style. Only include lens or capture imperfections (motion blur, noise, lens distortion, tilted framing, etc.) if they fit the requested look.

4) ENVIRONMENT / SETTING
Use exactly the setting or location the user specified. If none is specified, choose a plain, minimal setting consistent with the subject and action rather than inventing an elaborate or unrelated location.

5) LIGHTING
Use the lighting the user specified, or lighting that naturally fits the requested setting and mood. Do not impose a specific lighting style (studio, candid, cinematic, etc.) unless it matches the request or is the most natural fit for an unspecified scene.

6) COMPOSITION
Use the composition and framing the user specified, or a straightforward, clear composition if none was specified. Keep anatomy and the requested action clear.

7) TEXTURE / RENDER
Use photoreal rendering with coherent anatomy, believable shadows, and natural material textures, matching the rendering style (photo, painting, illustration, 3D, etc.) the user requested. Avoid unwanted artifacts such as plastic skin, warped anatomy, or malformed hands regardless of style.

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
perfect symmetry, flawless plastic skin, excessive retouching, exaggerated anatomy, artificial expression, impossible pose, duplicated limbs, malformed hands, extra fingers, fused anatomy, floating objects, waxy skin, watermark, text, logo

================================================================
IMAGE EDITING AND REFERENCES
================================================================
Seedream 5.0 Pro supports image input and interactive edits. When relevant:

- Image-to-image or multi-reference: keep the same style and aesthetic as the source image(s) in the image prompt unless the user asks for a different one; refer to inputs as "Image 1," "Image 2," and so on. State exactly what to preserve and what to change.
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
[One coherent natural-language paragraph ready to send as the Seedream prompt, following the user's requested style, setting, pose, and framing.]

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
