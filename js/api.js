/**
 * API module for communicating with the serverless function
 */

const API_ENDPOINT = '/api/generate';
const ENHANCE_ENDPOINT = '/api/enhance';
const TEST_KEY_ENDPOINT = '/api/test-key';
const RANDOM_PROMPT_ENDPOINT = '/api/random-prompt';
const OPENROUTER_API_KEY_STORAGE_KEY = 'openrouter_api_key';

/**
 * Read the user's OpenRouter API key from localStorage (if set).
 * We keep this optional so deployments can still use server-side env var fallback.
 * @returns {string | null}
 */
function getOpenRouterApiKey() {
    try {
        const raw = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY);
        if (!raw) return null;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    } catch {
        return null;
    }
}

/**
 * @typedef {Object} GenerateOptions
 * @property {string} [model] - Model to use (z-image-turbo, wan-26-text-to-image, wan-26-image-to-image, nano-banana-pro-edit, fibo, etc.)
 * @property {string} [image_size] - Image size preset or custom dimensions
 * @property {number} [num_inference_steps] - Number of inference steps
 * @property {number} [seed] - Seed for reproducibility
 * @property {boolean} [sync_mode] - Whether to use sync mode
 * @property {number} [num_images] - Number of images to generate
 * @property {number} [max_images] - Optional max images per generation (Seedream, Wan)
 * @property {boolean} [enable_safety_checker] - Enable safety checker
 * @property {string} [output_format] - Output format (png, jpeg, webp)
 * @property {string} [acceleration] - Acceleration level (none, regular, high)
 * @property {number} [guidance_scale] - CFG scale (Qwen, FLUX Kontext, Fibo)
 * @property {string} [negative_prompt] - Negative prompt (Qwen, HiDream, Wan, Fibo)
 * @property {boolean} [use_turbo] - Turbo mode (Qwen only)
 * @property {string} [image_url] - Input image URL or data URI for editing (Qwen, FLUX Kontext, Wan text-to-image, Fibo)
 * @property {string[]} [image_urls] - Input image URLs/data URIs list (Seedream 4.5 Edit, Wan image-to-image, Nano Banana Pro)
 * @property {string} [aspect_ratio] - Aspect ratio (FLUX Kontext, Nano Banana Pro, Fibo)
 * @property {string} [safety_tolerance] - Safety tolerance level 1-6 (FLUX Kontext only)
 * @property {boolean} [enhance_prompt] - Enhance prompt (FLUX Kontext, Wan image-to-image)
 * @property {string} [resolution] - Resolution (1K, 2K, 4K) for Nano Banana Pro
 * @property {boolean} [limit_generations] - Limit generations per prompt to 1 (Nano Banana Pro)
 * @property {boolean} [enable_web_search] - Enable web search for image generation (Nano Banana Pro)
 */

/**
 * @typedef {Object} GeneratedImage
 * @property {string} url - Image data URL
 * @property {string} model - Model used for generation
 * @property {number} cost - Cost in USD for this image
 * @property {string|null} provider - Provider name
 */

/**
 * @typedef {Object} GenerateResponse
 * @property {GeneratedImage[]} images - Generated images with metadata
 * @property {Object} meta - Generation metadata
 * @property {number} meta.total_usage - Total cost in USD
 * @property {Array} meta.requests - Per-request usage data
 * @property {boolean} [meta.usage_pending] - True when some usage data is pending
 */

/**
 * Generate an image from a prompt
 * @param {string} prompt - Image description prompt
 * @param {GenerateOptions} [options] - Optional generation parameters
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<GenerateResponse>}
 * @throws {Error} If generation fails
 */
export async function generateImage(prompt, options = {}, signal = null) {
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Prompt is required');
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
        throw new Error('Prompt cannot be empty');
    }

    // Build request body with prompt and options
    const requestBody = {
        prompt: trimmedPrompt,
        ...options
    };

    try {
        const openRouterApiKey = getOpenRouterApiKey();
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(openRouterApiKey ? { 'X-OpenRouter-Api-Key': openRouterApiKey } : {}),
            },
            body: JSON.stringify(requestBody),
            ...(signal ? { signal } : {})
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const err = new Error(errorData.error || `HTTP error! status: ${response.status}`);
            if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
                err.code = errorData.code;
                err.help = errorData.help;
            }
            throw err;
        }

        const data = await response.json();

        // Validate response structure
        if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
            throw new Error('Invalid response: no images returned');
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error; // Re-throw abort errors
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error: please check your connection');
        }
        throw error;
    }
}

/**
 * Enhance a prompt using AI
 * @param {string} currentPrompt - The current prompt to enhance
 * @returns {Promise<string>} The enhanced prompt
 * @throws {Error} If enhancement fails
 */
export async function enhancePrompt(currentPrompt) {
    if (!currentPrompt || typeof currentPrompt !== 'string') {
        throw new Error('Prompt is required');
    }

    const trimmedPrompt = currentPrompt.trim();
    if (trimmedPrompt.length === 0) {
        throw new Error('Prompt cannot be empty');
    }

    try {
        const openRouterApiKey = getOpenRouterApiKey();
        const response = await fetch(ENHANCE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(openRouterApiKey ? { 'X-OpenRouter-Api-Key': openRouterApiKey } : {}),
            },
            body: JSON.stringify({ prompt: trimmedPrompt }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const err = new Error(errorData.error || `HTTP error! status: ${response.status}`);
            if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
                err.code = errorData.code;
                err.help = errorData.help;
            }
            throw err;
        }

        const data = await response.json();

        if (!data.enhancedPrompt) {
            throw new Error('Invalid response: no enhanced prompt returned');
        }

        return data.enhancedPrompt;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error: please check your connection');
        }
        throw error;
    }
}

/**
 * Test the user's OpenRouter API key.
 * @returns {Promise<void>}
 */
export async function testOpenRouterKey() {
    const openRouterApiKey = getOpenRouterApiKey();
    if (!openRouterApiKey) {
        const err = new Error('OpenRouter API key required');
        err.code = 'OPENROUTER_API_KEY_REQUIRED';
        err.help = { url: 'https://openrouter.ai/keys' };
        throw err;
    }

    const response = await fetch(TEST_KEY_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-OpenRouter-Api-Key': openRouterApiKey,
        },
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
            err.code = errorData.code;
            err.help = errorData.help;
        }
        throw err;
    }
}

/**
 * Get a random creative prompt generated by AI
 * @returns {Promise<string>} A random creative prompt
 * @throws {Error} If generation fails
 */
export async function getRandomPromptFromAI() {
    try {
        const openRouterApiKey = getOpenRouterApiKey();
        const response = await fetch(RANDOM_PROMPT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(openRouterApiKey ? { 'X-OpenRouter-Api-Key': openRouterApiKey } : {}),
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const err = new Error(errorData.error || `HTTP error! status: ${response.status}`);
            if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
                err.code = errorData.code;
                err.help = errorData.help;
            }
            throw err;
        }

        const data = await response.json();

        if (!data.prompt) {
            throw new Error('Invalid response: no prompt returned');
        }

        return data.prompt;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error: please check your connection');
        }
        throw error;
    }
}
