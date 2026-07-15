/**
 * API module for communicating with the serverless function
 */

import { VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES } from './config.js';

const API_ENDPOINT = '/api/generate';
const ENHANCE_ENDPOINT = '/api/enhance';
const TEST_KEY_ENDPOINT = '/api/test-key';
const TEST_XAI_KEY_ENDPOINT = '/api/test-xai-key';
const TEST_EVOLINK_KEY_ENDPOINT = '/api/test-evolink-key';
const RANDOM_PROMPT_ENDPOINT = '/api/random-prompt';
const GENERATION_STATUS_ENDPOINT = '/api/generation-status';
const OPENROUTER_API_KEY_STORAGE_KEY = 'openrouter_api_key';
const XAI_API_KEY_STORAGE_KEY = 'xai_api_key';
const EVOLINK_API_KEY_STORAGE_KEY = 'evolink_api_key';
const APP_ACCESS_TOKEN_STORAGE_KEY = 'app_access_token';

const encoder = new TextEncoder();

/**
 * Build a useful API-key validation error from the redacted provider details
 * returned by the server.
 * @param {Record<string, unknown>} errorData
 * @param {string} fallback
 * @returns {string}
 */
export function formatApiTestErrorMessage(errorData, fallback) {
    const summary = typeof errorData?.error === 'string' && errorData.error.trim()
        ? errorData.error.trim()
        : fallback;
    let details = errorData?.details;

    if (typeof details === 'string') {
        const trimmed = details.trim();
        try {
            details = JSON.parse(trimmed);
        } catch {
            details = trimmed.startsWith('<') ? '' : trimmed;
        }
    }

    const detail = typeof details === 'string'
        ? details
        : typeof details?.error?.message === 'string'
            ? details.error.message
            : typeof details?.error === 'string'
                ? details.error
                : typeof details?.message === 'string'
                    ? details.message
                    : '';
    const normalizedDetail = detail.replace(/\s+/g, ' ').trim().slice(0, 240);

    if (!normalizedDetail || normalizedDetail.toLowerCase() === summary.toLowerCase()) {
        return summary;
    }
    return `${summary}: ${normalizedDetail}`;
}

function getUtf8ByteLength(value) {
    return encoder.encode(value).length;
}

function assertPayloadWithinLimit(serializedBody) {
    if (getUtf8ByteLength(serializedBody) <= VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES) return;
    const err = new Error('Attached images are too large for deployment. Use fewer or smaller reference images.');
    err.code = 'REQUEST_PAYLOAD_TOO_LARGE';
    throw err;
}

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
 * Read the user's xAI API key from localStorage (if set).
 * @returns {string | null}
 */
function getXaiApiKey() {
    try {
        const raw = localStorage.getItem(XAI_API_KEY_STORAGE_KEY);
        if (!raw) return null;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    } catch {
        return null;
    }
}

/**
 * Read the user's Evolink API key from localStorage (if set).
 * @returns {string | null}
 */
function getEvolinkApiKey() {
    try {
        const raw = localStorage.getItem(EVOLINK_API_KEY_STORAGE_KEY);
        if (!raw) return null;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    } catch {
        return null;
    }
}

/**
 * Read the optional app access token used by protected deployments.
 * Provider keys stored in localStorage still take precedence when present.
 * @returns {string | null}
 */
function getAppAccessToken() {
    try {
        const raw = localStorage.getItem(APP_ACCESS_TOKEN_STORAGE_KEY);
        if (!raw) return null;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    } catch {
        return null;
    }
}

function getAppAccessHeaders() {
    const appAccessToken = getAppAccessToken();
    return appAccessToken ? { 'X-App-Access-Token': appAccessToken } : {};
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
 * @property {string} [aspect_ratio] - Aspect ratio for supported image/video models
 * @property {string} [safety_tolerance] - Safety tolerance level 1-6 (FLUX Kontext only)
 * @property {boolean} [enhance_prompt] - Enhance prompt (FLUX Kontext, Wan image-to-image)
 * @property {string} [resolution] - Resolution/image size (options vary by model)
 * @property {boolean} [limit_generations] - Limit generations per prompt to 1 (Nano Banana Pro)
 * @property {boolean} [enable_web_search] - Enable web search for image generation (Nano Banana Pro)
 * @property {number} [xai_video_length] - xAI video duration (seconds)
 * @property {string} [xai_video_quality] - xAI video resolution (720p, 480p)
 * @property {boolean} [generate_audio_switch] - Enable audio generation for supported video models
 * @property {string} [flashhead_voice] - FlashHead ElevenLabs voice name
 * @property {number} [flashhead_stability] - FlashHead voice stability (0-1)
 */

/**
 * @typedef {Object} GeneratedImage
 * @property {string} url - Image data URL
 * @property {string} model - Model used for generation
 * @property {number} cost - Cost in USD for this image
 * @property {string|null} provider - Provider name
 * @property {string} [media_type] - Media type (image or video)
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
        const xaiApiKey = getXaiApiKey();
        const evolinkApiKey = getEvolinkApiKey();
        const serializedBody = JSON.stringify(requestBody);
        assertPayloadWithinLimit(serializedBody);

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(openRouterApiKey ? { 'X-OpenRouter-Api-Key': openRouterApiKey } : {}),
                ...(xaiApiKey ? { 'X-XAI-Api-Key': xaiApiKey } : {}),
                ...(evolinkApiKey ? { 'X-Evolink-Api-Key': evolinkApiKey } : {}),
                ...getAppAccessHeaders(),
            },
            body: serializedBody,
            ...(signal ? { signal } : {})
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            let message = errorData.error || `HTTP error! status: ${response.status}`;
            if (errorData.details) {
                // Parse details if it's a JSON string to extract meaningful error info
                let detailMsg = errorData.details;
                if (typeof detailMsg === 'string') {
                    try {
                        const parsed = JSON.parse(detailMsg);
                        detailMsg = parsed.error?.message || parsed.message || parsed.error || detailMsg;
                    } catch { /* use raw string */ }
                }
                if (typeof detailMsg === 'object') {
                    detailMsg = detailMsg.error?.message || detailMsg.message || JSON.stringify(detailMsg);
                }
                message += ` — ${detailMsg}`;
            }
            const err = new Error(message);
            if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
                err.code = errorData.code;
                err.help = errorData.help;
            }
            throw err;
        }

        const data = await response.json();

        // Async image/video generation returns task descriptors for client-side polling.
        if (response.status === 202 && data.status === 'pending'
            && (data.request_id || (Array.isArray(data.requests) && data.requests.length > 0))) {
            return data;
        }

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
 * @param {string[]} [imageUrls] - Optional array of image data URLs to include for context
 * @param {string} [customInstructions] - Optional user instructions for how to enhance the prompt
 * @returns {Promise<string>} The enhanced prompt
 * @throws {Error} If enhancement fails
 */
export async function enhancePrompt(currentPrompt, imageUrls = [], customInstructions = '') {
    if (!currentPrompt || typeof currentPrompt !== 'string') {
        throw new Error('Prompt is required');
    }

    const trimmedPrompt = currentPrompt.trim();
    if (trimmedPrompt.length === 0) {
        throw new Error('Prompt cannot be empty');
    }

    try {
        const openRouterApiKey = getOpenRouterApiKey();
        const requestBody = { prompt: trimmedPrompt };

        // Include image URLs if provided
        if (Array.isArray(imageUrls) && imageUrls.length > 0) {
            requestBody.image_urls = imageUrls;
        }

        if (typeof customInstructions === 'string' && customInstructions.trim().length > 0) {
            requestBody.custom_instructions = customInstructions.trim();
        }

        const serializedBody = JSON.stringify(requestBody);
        assertPayloadWithinLimit(serializedBody);

        const response = await fetch(ENHANCE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(openRouterApiKey ? { 'X-OpenRouter-Api-Key': openRouterApiKey } : {}),
                ...getAppAccessHeaders(),
            },
            body: serializedBody,
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
        const err = new Error(formatApiTestErrorMessage(
            errorData,
            `OpenRouter key test returned HTTP ${response.status}`
        ));
        if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
            err.code = errorData.code;
            err.help = errorData.help;
        }
        throw err;
    }
}

/**
 * Test the user's xAI API key.
 * @returns {Promise<void>}
 */
export async function testXaiKey() {
    const xaiApiKey = getXaiApiKey();
    if (!xaiApiKey) {
        const err = new Error('xAI API key required');
        err.code = 'XAI_API_KEY_REQUIRED';
        err.help = { url: 'https://console.x.ai' };
        throw err;
    }

    const response = await fetch(TEST_XAI_KEY_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-XAI-Api-Key': xaiApiKey,
        },
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(formatApiTestErrorMessage(
            errorData,
            `xAI key test returned HTTP ${response.status}`
        ));
        if (errorData && typeof errorData === 'object' && typeof errorData.code === 'string') {
            err.code = errorData.code;
            err.help = errorData.help;
        }
        throw err;
    }
}

/**
 * Test the user's Evolink API key.
 * @returns {Promise<void>}
 */
export async function testEvolinkKey() {
    const evolinkApiKey = getEvolinkApiKey();
    if (!evolinkApiKey) {
        const err = new Error('Evolink API key required');
        err.code = 'EVOLINK_API_KEY_REQUIRED';
        err.help = { url: 'https://evolink.ai/dashboard/keys' };
        throw err;
    }

    const response = await fetch(TEST_EVOLINK_KEY_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Evolink-Api-Key': evolinkApiKey,
        },
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(formatApiTestErrorMessage(
            errorData,
            `Evolink key test returned HTTP ${response.status}`
        ));
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
                ...getAppAccessHeaders(),
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

/**
 * Poll for video generation status (client-side polling).
 * @param {string} requestId - The video request ID from the initial generate call
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @param {{ provider?: string, model?: string }} [meta] - Optional provider and model info
 * @returns {Promise<{status: string, url?: string}>}
 * @throws {Error} If polling fails
 */
export async function pollGenerationStatus(requestId, signal = null, meta = {}) {
    const xaiApiKey = getXaiApiKey();
    const evolinkApiKey = getEvolinkApiKey();
    const response = await fetch(GENERATION_STATUS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(xaiApiKey ? { 'X-XAI-Api-Key': xaiApiKey } : {}),
            ...(evolinkApiKey ? { 'X-Evolink-Api-Key': evolinkApiKey } : {}),
            ...getAppAccessHeaders(),
        },
        body: JSON.stringify({
            request_id: requestId,
            ...(meta.provider ? { provider: meta.provider } : {}),
            ...(meta.model ? { model: meta.model } : {}),
            ...(meta.media_type ? { media_type: meta.media_type } : {}),
        }),
        ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

// Backward-compatible client export.
export const pollVideoStatus = pollGenerationStatus;
