// Shared configuration for prompt attachments and compression behavior.

export const PROMPT_ATTACHMENTS_MAX = 9;
export const PROMPT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024; // 8MB
export const PROMPT_ATTACHMENT_MAX_DIMENSION = 768; // Max width/height in px
export const PROMPT_ATTACHMENT_JPEG_QUALITY = 0.75;
export const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
