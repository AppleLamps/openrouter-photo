/**
 * Video attachments for video-to-video models (Gemini Omni Edit / Extend / Upscale).
 *
 * An attachment comes from a gallery video or an MP4 the user picked:
 * {
 *   blob: Blob|null,          // local copy (IndexedDB or the picked file)
 *   remoteUrl: string|null,   // provider URL the gallery item was saved from
 *   remoteCreatedAt: number|null,
 *   uploadedUrl: string|null, // Evolink file URL once uploaded (kept 72h)
 *   uploadedAt: number|null,
 *   previewUrl: string,       // what the composer chip plays
 *   name: string,
 *   duration: number, width: number, height: number,
 * }
 */

/** Evolink result links expire after 24h; stay well inside that. */
export const REMOTE_VIDEO_FRESH_MS = 20 * 60 * 60 * 1000;
/** Evolink keeps uploaded files for 72h. */
export const UPLOADED_VIDEO_FRESH_MS = 70 * 60 * 60 * 1000;
/** Largest local video accepted as an attachment. */
export const VIDEO_ATTACHMENT_MAX_BYTES = 200 * 1024 * 1024;

export function isMp4File(file) {
    if (!file) return false;
    if (file.type === 'video/mp4') return true;
    return !file.type && typeof file.name === 'string' && /\.mp4$/i.test(file.name);
}

/**
 * Read duration and frame size from a video URL (object URL or remote).
 * @returns {Promise<{ duration: number, width: number, height: number }>}
 */
export function readVideoMetadata(src, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.removeAttribute('src');
            video.load();
            fn(value);
        };
        const timer = setTimeout(() => finish(reject, new Error('Timed out reading the video.')), timeoutMs);
        video.preload = 'metadata';
        video.muted = true;
        video.onloadedmetadata = () => finish(resolve, {
            duration: Number.isFinite(video.duration) ? video.duration : NaN,
            width: video.videoWidth,
            height: video.videoHeight,
        });
        video.onerror = () => finish(reject, new Error('This video could not be read. Use an MP4 file.'));
        video.src = src;
    });
}

function formatTargets(targets) {
    if (targets.length <= 1) return targets[0] || '';
    return `${targets.slice(0, -1).join(', ')} or ${targets[targets.length - 1]}`;
}

/**
 * Check an attached video against a model's `input.video` limits.
 * @returns {string|null} a message for the user, or null when it fits
 */
export function getVideoInputError(meta, videoConstraints, quality) {
    if (!videoConstraints) return null;
    if (!meta) return 'Attach an MP4 video for this model.';

    const maxSeconds = Number(videoConstraints.maxSeconds);
    // Containers often report a few hundredths over the nominal length.
    if (Number.isFinite(maxSeconds) && Number.isFinite(meta.duration) && meta.duration > maxSeconds + 0.25) {
        return `This model accepts videos up to ${maxSeconds} seconds; the attached one is ${Math.round(meta.duration)} seconds.`;
    }

    const allowedSizes = videoConstraints.allowedSizes;
    if (Array.isArray(allowedSizes) && meta.width && meta.height) {
        const size = `${meta.width}x${meta.height}`;
        if (!allowedSizes.includes(size)) {
            return `Upscaling needs a 640x360, 1280x720 or 1920x1080 video (or the portrait versions); the attached one is ${size}.`;
        }
    }

    const targets = videoConstraints.upscaleTargets;
    if (targets && meta.width && meta.height && typeof quality === 'string') {
        const shortEdge = String(Math.min(meta.width, meta.height));
        const allowed = targets[shortEdge];
        if (Array.isArray(allowed) && !allowed.includes(quality)) {
            return `A ${shortEdge}p video can be upscaled to ${formatTargets(allowed)}. Pick a higher video quality.`;
        }
    }
    return null;
}

/**
 * Pick the URL Evolink should read the video from, uploading the local copy
 * when needed. Caches the uploaded URL on the attachment so retries and
 * follow-up edits do not upload again.
 *
 * @param {object} attachment
 * @param {{ upload: (blob: Blob, signal?: AbortSignal|null) => Promise<string>, canUpload: boolean, signal?: AbortSignal|null, now?: number }} options
 * @returns {Promise<string>}
 */
export async function resolveVideoInputUrl(attachment, { upload, canUpload, signal = null, now = Date.now() }) {
    if (!attachment) throw new Error('Attach an MP4 video for this model.');

    if (attachment.uploadedUrl && Number.isFinite(attachment.uploadedAt)
        && now - attachment.uploadedAt < UPLOADED_VIDEO_FRESH_MS) {
        return attachment.uploadedUrl;
    }

    if (attachment.blob && canUpload) {
        const url = await upload(attachment.blob, signal);
        attachment.uploadedUrl = url;
        attachment.uploadedAt = now;
        return url;
    }

    const remoteFresh = typeof attachment.remoteUrl === 'string'
        && /^https:\/\//i.test(attachment.remoteUrl)
        && Number.isFinite(attachment.remoteCreatedAt)
        && now - attachment.remoteCreatedAt < REMOTE_VIDEO_FRESH_MS;
    if (remoteFresh) return attachment.remoteUrl;

    if (attachment.blob) {
        const err = new Error('Add your Evolink API key in Settings so this video can be uploaded for editing.');
        err.code = 'EVOLINK_API_KEY_REQUIRED';
        err.help = { url: 'https://evolink.ai/dashboard/keys' };
        throw err;
    }
    throw new Error('This video is no longer available from the provider and has no saved copy. Attach the MP4 again.');
}
