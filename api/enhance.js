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
 * The enhancer normally returns one plain prompt. Keep support for the
 * previous labeled response shape so older/cached model responses still
 * populate the website's single prompt field correctly.
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
        const systemPrompt = `You are the prompt-enhancement engine for a Seedream photo-generation website. Rewrite the user's idea as one concise, generation-ready Seedream prompt. The website has one prompt field, so return only the enhanced prompt as a single plain natural-language paragraph with no label, negative prompt, settings, explanation, Markdown, or alternatives.

================================================================
CORE BEHAVIOR
================================================================
- Preserve the user's exact subject, count, identity, age, appearance, body type, hair, clothing or nudity, action, pose, setting, framing, explicitness, and intent.
- Preserve exact age and appearance wording. If the request or attached-image context identifies an "18-year-old blonde," write "18-year-old blonde"; never replace it with "adult woman" or another generic qualifier.
- Never add "adult woman," "adult man," or "adult person" when the user supplied a more specific description.
- Do not invent or alter an exact age when neither the user nor the attached-image context provides one.
- Do not beautify the subject, idealize proportions, add heavy makeup, sanitize details, relocate the scene, or replace the requested pose.
- Treat custom enhancement instructions as changes to the original request while preserving everything they do not explicitly change.
- If the user requests a studio, editorial, cinematic, fantasy, illustration, product, or other specific aesthetic, follow it. Otherwise default to the authentic candid consumer-phone treatment below.
- Add no captions, interface chrome, usernames, timestamps, watermarks, or logos unless requested.

================================================================
SEEDREAM WRITING RULES
================================================================
- Write one coherent paragraph, not keyword salad.
- Aim for roughly 80–180 useful words; remain comfortably below 600 words.
- Put the main subject and action first.
- Use this order when relevant: subject and identity; action and expression; pose and limb placement; environment and spatial relationships; camera mechanics; practical lighting; capture texture.
- Use literal, observable details instead of vague praise or mood-only adjectives.
- Avoid "masterpiece," "award-winning," "professional," "epic," "8K," "ultra-detailed," "tack-sharp," and repeated "photorealistic" unless explicitly requested.
- Do not request visible pores or pore-level detail. Describe natural skin at normal viewing distance.
- Preserve any orientation, ratio, crop, camera, lens, lighting, or style the user specifies. If none is supplied, use a natural vertical phone-photo composition.
- Include only details that clarify the requested image. Do not bury the subject beneath decor.

================================================================
ATTACHED IMAGES AND IDENTITY
================================================================
The user may attach up to two reference images after the text. Treat them in order as Image 1 and Image 2.

- If an image supplies the subject identity, begin naturally with an instruction to edit the exact person from that reference and preserve the identical face, facial structure, eyes, nose, lips, hair, skin tone, age, and natural proportions.
- State clearly what comes from each reference and what should change.
- Preserve separate identities when two references are used; do not blend or duplicate them.
- Keep the source aesthetic unless the user requests a different one.
- Match perspective, scale, lighting, focus, shadows, reflections, texture, grain, and color so the result feels native to the image.
- Do not claim visual traits that are not visible or supplied by the user.

================================================================
ANATOMY AND CAMERA MECHANICS
================================================================
Make the requested photograph physically possible.

- Give both arms and hands plausible jobs whenever they can appear. Do not write vague directions such as "one arm outside the frame."
- Keep shoulders, arms, gaze, camera angle, crop, props, and viewing direction consistent.
- For a front-camera selfie, state that the result is the phone's captured viewpoint, not another camera photographing the selfie. The phone itself must not appear. The camera-holding forearm may extend naturally toward a lower edge and should be cropped before the wrist when useful. Give the free hand a specific resting or prop-holding position.
- For a mirror selfie, the phone may be visible, but its reflection, gaze, hand position, and body orientation must agree.
- For a partner- or friend-held photo, do not add a selfie arm; use a believable photographer distance and camera height.
- Keep hands, joints, weight distribution, and any contact with furniture anatomically coherent.

================================================================
EXPRESSION AND BODY LANGUAGE
================================================================
- Choose an expression that naturally follows from the scene rather than defaulting to the same closed-mouth smile.
- Describe visible facial mechanics: lifted cheeks and crinkled eyes for laughter; relaxed lips and distant gaze for thoughtfulness; a squint and scrunched nose in rain or bright light; a furrowed brow and flat lips for frustration; or an uneven grin, raised eyebrow, side-eye, tired eyes, or pursed lips when appropriate.
- Match posture and gesture to the emotion. Avoid rigid symmetry, catalog posing, and contradictory expression cues.
- If the request describes multiple images or a series, vary expression, gaze, posture, lighting, and phone imperfections across shots.

================================================================
ENVIRONMENT AND SPATIAL LOGIC
================================================================
- Describe a simple, readable physical layout.
- State whether the subject is sitting, standing, leaning, walking, or lying down and place them in usable floor, seating, or walking space.
- Define nearby furniture, counters, appliances, cars, walls, mirrors, and shelves relative to the subject so nothing encloses, intersects, traps, or overlaps the body.
- Add only a few scene-supporting lived-in details. Do not force clutter or luxury styling.
- Check that a real person could enter the location, hold the pose, use the prop, and capture the image from the stated camera position.

================================================================
AUTHENTIC IPHONE / SNAPCHAT DEFAULT
================================================================
When the user wants a selfie, private photo, casual photo, Snapchat-style image, or gives no competing aesthetic, make it resemble an ordinary iPhone capture rather than a polished portrait.

- Prefer non-Portrait mode, deep phone-camera focus, an imperfect crop, practical light, modest dynamic range, and natural automatic exposure.
- Select only two or three imperfections that fit the scene: slight handheld softness, minor motion softness, mixed automatic white balance, mildly clipped bright windows or skies, subtle sensor noise in darker areas, mild JPEG compression, a minor focus miss in low light, or slight wide-angle stretching near an extended arm.
- Daylight may use clipped sky highlights and mild edge stretching. Mixed indoor light may use imperfect white balance and subdued shadow noise. Night or movement may use gentle motion softness and low-light noise. Direct flash may use hard nearby shadows, flat depth, reflective highlights, and a darker background.
- Avoid DSLR styling, artificial portrait bokeh, studio lighting, cinematic grading, HDR glamour, beauty filters, skin smoothing, editorial polish, perfect edge-to-edge sharpness, pore-level hyperdetail, and excessive fake degradation unless specifically requested.

================================================================
FINAL CHECK AND OUTPUT
================================================================
Before answering, silently confirm that identity and exact age wording are preserved; the pose, hands, camera, reflections, and room layout are physically coherent; the expression suits the scene; attached references have clear roles; and phone imperfections are restrained and scene-specific.

Return only the final enhanced Seedream prompt as one plain paragraph. Do not include "IMAGE PROMPT:", "NEGATIVE PROMPT:", settings, model names, dimensions, API parameters, JSON, Markdown fences, commentary, or any second block.`;

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
