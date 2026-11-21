# AI Image & Video Generator

A modern, lightweight AI image and video generator. Built with vanilla JavaScript (ES Modules) and deployable to Vercel with zero build configuration. Supports **47 models** across OpenRouter, xAI, and Evolink.

![No Build Tools](https://img.shields.io/badge/Build-None%20Required-green)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)

---

## Features

### Image & Video Generation

- **Seedance 2.0 Mini I2V** — In the model picker's Video tab, select Seedance 2.0 Mini labeled Image → Video and attach one start frame or two start/end frames. Supports 4–15 seconds, 480p/720p, and audio. Relaxed filtering is on by default for all Seedance models (+10%); check Standard content filter in Settings for the normal price. Seedance 2.0 cannot use web search while relaxed, so its web search starts off.

- **Multi-Model Support** — 47 catalog-driven models (31 image, 1 edit, 15 video)
- **Batch Generation** — Create 1–4 images per request (video models produce 1)
- **Configurable Output** — Aspect ratio, resolution, quality, output format, background, exact pixels, video length/quality, and model-specific options from the catalog (seed, planning depth, thinking level, fast mode, image/web search), shown only for models that support them
- **Video Generation** — Text-to-video via xAI Grok and Evolink Seedance 2.0, Gemini Omni 1.2 Flash, and MiniMax H3 Max Turbo; image-to-video via Evolink Seedance 2.0, HappyHorse 1.0, Gemini Omni 1.2 Flash, and MiniMax H3 Max Turbo
- **Audio in Videos** — Evolink Seedance 2.0 supports generated audio
- **Resilient Async Tasks** — Evolink images and all videos poll independently, preserve partial successes, and allow per-task retry

### Image Editing

- **Reference Images** — Attach up to 10 images, subject to the selected model's catalog limit
- **Auto Compression** — Accepted uploads are processed sequentially and re-encoded at up to 768px, JPEG 75%
- **Model Interpretation** — Describe changes and let compatible edit models apply them
- **Image-to-Video** — Use attached images as start frame (and optional end frame) for I2V models
- **Video-to-Video** — Attach an MP4 (or click **Edit video** on a gallery video) to edit, extend or upscale it with Gemini Omni 1.2 Flash. The browser uploads the video straight to Evolink's file store with your saved Evolink key, so it never passes through the serverless request limit

### Prompt Tools

- **AI Enhancement** — Improve prompts with one click using Grok (xAI Responses API)
- **Surprise Me** — AI-generated random prompts combining subjects, styles, moods, settings, and lighting

### Gallery & Organization

- **Responsive Grid** — Thumbnail gallery with shimmer loading animations; video cards show inline playback
- **Lightbox Viewer** — Full-screen preview with metadata, download, and remix options
- **Folder System** — Organize images and videos into custom folders with drag-and-drop
- **Bulk Selection** — Multi-select mode for batch operations
- **Visibility Modes** — Show all media or folder-only view

### Cost Management

- **Real-Time Tracking** — Cost displayed per image/video as it generates
- **Spend Dashboard** — Breakdown by model with generation counts
- **Total Spend** — Running total accessible from the UI

### User Experience

- **Adaptive Settings** — Focus-managed side drawer on desktop and bottom sheet on mobile, with Generation, Storage, and Keys tabs
- **Consistent Dialogs** — Shared visual treatment and keyboard focus behavior for confirmations, API-key prompts, folders, and prompt enhancement
- **Keyboard Shortcuts** — Quick actions without mouse
- **Touch Gestures** — Swipe-to-close lightbox on mobile
- **PWA Support** — Install as a standalone app and reload the cached application shell offline
- **Persistent Storage** — IndexedDB with localStorage fallback
- **Generation Recovery** — Pending tasks resume after reload; status-check retries reuse the existing task and avoid duplicate spend entries.
- **Storage Quality** — Choose optimized or original-quality storage for new images in Settings → Storage. New videos and preview posters are saved in IndexedDB when space allows; a warning appears when the media file cannot be saved.
- **Lazy Media Loading** — Thumbnail bytes load near the viewport; video previews pause and release their source when offscreen.
- **Zero Build** — No bundlers, transpilers, or build steps required

---

## Supported Models

All models are defined in `shared/model-catalog.json`, the single source of truth for routing, settings and pricing. The tables below are generated from it: run `node scripts/model-table.mjs --write` after changing the catalog (`npm test` fails if a model is missing here).

<!-- models:start -->
### Evolink (25)

Evolink API key. Images and videos run as async tasks.

| Model | Provider | Type | Settings | Price | ID |
| --- | --- | --- | --- | --- | --- |
| Seedream 4.5 | Bytedance | Image | aspect ratio, resolution 2K/4K, exact pixels, up to 14 images | ~$0.03/output | `evolink/doubao-seedream-4.5` |
| Seedream 4.5 Edit | Bytedance | Edit | aspect ratio, resolution 2K/4K, exact pixels, needs 1–14 images | ~$0.03/output | `evolink/doubao-seedream-4.5/edit` |
| Seedream 5 Lite | Bytedance | Image | aspect ratio, resolution 2K/3K/4K, exact pixels, format png/jpeg, web search, up to 14 images | ~$0.028/output | `evolink/doubao-seedream-5.0-lite` |
| Seedream 5.0 Pro | Bytedance | Image + Edit | aspect ratio, resolution 1K/1.5K/2K, exact pixels, format png/jpeg, fast mode, up to 10 images | from $0.034/output | `evolink/doubao-seedream-5.0-pro` |
| Seedream 5.0 Flash | Bytedance | Image + Edit | aspect ratio, resolution 1K/1.5K/2K, exact pixels, format png/jpeg, up to 10 images | ~$0.014/output | `evolink/doubao-seedream-5.0-flash` |
| Seedream 5.5 | Bytedance | Image + Edit | aspect ratio, resolution 1K/1.5K/2K, exact pixels, format png/jpeg, background auto/transparent/opaque, up to 10 images | from $0.016/output | `evolink/doubao-seedream-5.5` |
| MiniMax H3 Image | MiniMax | Image + Edit | aspect ratio, resolution 1K/2K/4K, format jpeg/png/webp, up to 16 images | from $0.026/output | `evolink/minimax-h3-image` |
| Nano Banana 2.1 | Google | Image + Edit | aspect ratio, resolution 1K/2K/4K, web search, thinking level, image search, up to 14 images | from $0.031/output | `evolink/gemini-nano-banana-2.1` |
| Z Image Turbo | Tongyi | Image | aspect ratio, seed | ~$0.0038/output | `evolink/z-image-turbo` |
| GPT Image 2.5 Sunburst | OpenAI | Image + Edit | aspect ratio, resolution 1K/2K/4K, quality low/medium/high/xhigh/max, exact pixels, format png/jpeg/webp, background opaque/transparent, up to 16 images | from $0.0053/output | `evolink/gpt-image-2.5-sunburst` |
| GPT Image 2.5 Flare | OpenAI | Image + Edit | aspect ratio, resolution 1K/2K/4K, quality low/medium/high/xhigh/max, exact pixels, format png/jpeg/webp, background opaque/transparent, up to 16 images | from $0.0053/output | `evolink/gpt-image-2.5-flare` |
| GPT Image 2.6 Sunburst | OpenAI | Image + Edit | aspect ratio, resolution 1K/2K/4K, quality low/medium/high/xhigh/max, exact pixels, format png/jpeg/webp, background opaque/transparent, planning depth, up to 16 images | from $0.025/output | `evolink/gpt-image-2.6-sunburst` |
| GPT Image 2.6 Flare | OpenAI | Image + Edit | aspect ratio, resolution 1K/2K/4K, quality low/medium/high/xhigh/max, exact pixels, format png/jpeg/webp, background opaque/transparent, planning depth, up to 16 images | from $0.025/output | `evolink/gpt-image-2.6-flare` |
| Seedance 2.0 | Bytedance | Image → Video | aspect ratio, 4–15s, 480p/720p/1080p, audio, content filter, needs 1–2 images | from $0.092/sec | `evolink/seedance-2.0/image-to-video` |
| Seedance 2.0 | Bytedance | Text → Video | aspect ratio, 4–15s, 480p/720p/1080p, audio, content filter, web search | from $0.092/sec | `evolink/seedance-2.0/text-to-video` |
| Seedance 2.0 Mini | Bytedance | Text → Video | aspect ratio, 4–15s, 480p/720p, audio, content filter | from $0.046/sec | `evolink/seedance-2.0-mini/text-to-video` |
| Seedance 2.0 Mini | Bytedance | Image → Video | aspect ratio, 4–15s, 480p/720p, audio, content filter, needs 1–2 images | from $0.046/sec | `evolink/seedance-2.0-mini/image-to-video` |
| HappyHorse 1.0 | HappyHorse | Image → Video | 3–15s, 720p/1080p, seed, needs 1 image | from $0.14/sec | `evolink/happyhorse-1.0/image-to-video` |
| Gemini Omni 1.2 Flash | Google | Text → Video | aspect ratio, 3–15s, 360p/720p/1080p/4k, seed | from $0.022/sec | `evolink/gemini-omni-1.2-flash/text-to-video` |
| Gemini Omni 1.2 Flash | Google | Image → Video | aspect ratio, 3–15s, 360p/720p/1080p/4k, seed, needs 1–2 images | from $0.022/sec | `evolink/gemini-omni-1.2-flash/image-to-video` |
| Gemini Omni 1.2 Flash Edit | Google | Video → Video | auto/360p/720p/1080p/4k, seed, MP4 input ≤15s, up to 10 images | from $0.032/sec | `evolink/gemini-omni-1.2-flash/video-edit` |
| Gemini Omni 1.2 Flash Extend | Google | Video → Video | 3–10s, auto/360p/720p/1080p/4k, seed, MP4 input ≤30s, up to 10 images | from $0.032/sec | `evolink/gemini-omni-1.2-flash/video-extend` |
| Gemini Omni 1.2 Flash Upscale | Google | Video → Video | 720p/1080p/4k, seed, MP4 input ≤15s | from $0.032/sec | `evolink/gemini-omni-1.2-flash/video-upscale` |
| MiniMax H3 Max Turbo | MiniMax | Text → Video | aspect ratio, 5–15s, 480p/768p | ~$0.038/sec | `evolink/minimax-h3-max-turbo/text-to-video` |
| MiniMax H3 Max Turbo | MiniMax | Image → Video | 5–15s, 480p/768p, needs 1–2 images | ~$0.038/sec | `evolink/minimax-h3-max-turbo/image-to-video` |

### OpenRouter (19)

OpenRouter API key. Image models use the OpenRouter Image API, falling back to chat completions.

| Model | Provider | Type | Settings | Price | ID |
| --- | --- | --- | --- | --- | --- |
| Seedream 4.5 | Bytedance | Image | aspect ratio, resolution 1K/2K/4K, seed, up to 14 images | Usage-priced | `bytedance-seed/seedream-4.5` |
| Flux 2 Pro | Black Forest Labs | Image | aspect ratio, format png/jpeg, seed, up to 8 images | Usage-priced | `black-forest-labs/flux.2-pro` |
| Flux 2 Max | Black Forest Labs | Image | aspect ratio, format png/jpeg, seed, up to 8 images | Usage-priced | `black-forest-labs/flux.2-max` |
| Flux 2 Flex | Black Forest Labs | Image | aspect ratio, format png/jpeg, seed, up to 8 images | Usage-priced | `black-forest-labs/flux.2-flex` |
| Flux 2 Klein 4B | Black Forest Labs | Image | aspect ratio, format png/jpeg, seed, up to 4 images | Usage-priced | `black-forest-labs/flux.2-klein-4b` |
| Gemini 3 Pro Image (Stable) | Google | Image | aspect ratio, resolution 1K/2K/4K, up to 14 images | Usage-priced | `google/gemini-3-pro-image` |
| Gemini 3 Pro Image | Google | Image | aspect ratio, resolution 1K/2K/4K, up to 14 images | Usage-priced | `google/gemini-3-pro-image-preview` |
| Gemini 3.1 Flash Image | Google | Image | aspect ratio, resolution 512/1K/2K/4K, up to 14 images | Usage-priced | `google/gemini-3.1-flash-image` |
| Gemini 3.1 Flash Lite Image | Google | Image | aspect ratio, up to 14 images | Usage-priced | `google/gemini-3.1-flash-lite-image` |
| Gemini 2.5 Flash Image | Google | Image | aspect ratio, up to 3 images | Usage-priced | `google/gemini-2.5-flash-image` |
| MAI Image 2.5 Pro | Microsoft | Image | aspect ratio, up to 1 image | Usage-priced | `microsoft/mai-image-2.5-pro` |
| Recraft V4.1 Pro | Recraft | Image | aspect ratio, up to 1 image | Usage-priced | `recraft/recraft-v4.1-pro` |
| Riverflow V2.5 Pro | Sourceful | Image | aspect ratio, resolution 1K/2K/4K, format png/jpeg/webp, background auto/transparent/opaque, up to 10 images | Usage-priced | `sourceful/riverflow-v2.5-pro` |
| GPT-5 Image | OpenAI | Image | aspect ratio, quality auto/low/medium/high, background auto/transparent/opaque, up to 16 images | Usage-priced | `openai/gpt-5-image` |
| GPT-5 Image Mini | OpenAI | Image | aspect ratio, quality auto/low/medium/high, format png/jpeg/webp, background auto/transparent/opaque, up to 16 images | Usage-priced | `openai/gpt-5-image-mini` |
| GPT-5.4 Image 2 | OpenAI | Image | aspect ratio, quality auto/low/medium/high, format png/jpeg/webp, background auto/opaque, up to 16 images | Usage-priced | `openai/gpt-5.4-image-2` |
| Grok Imagine Image 2.0 | xAI | Image | aspect ratio, resolution 1K/2K, quality low/medium, up to 3 images | Usage-priced | `x-ai/grok-imagine-image-2.0` |
| Grok Imagine Video | xAI | Text → Video + Image → Video | aspect ratio, 1–15s, 480p/720p, up to 1 image | from $0.05/sec | `x-ai/grok-imagine-video` |
| Grok Imagine Video 1.5 | xAI | Image → Video | 1–15s, 480p/720p/1080p, needs 1 image | from $0.08/sec | `x-ai/grok-imagine-video-1.5` |

### xAI (direct) (3)

xAI API key.

| Model | Provider | Type | Settings | Price | ID |
| --- | --- | --- | --- | --- | --- |
| Grok Image 2.0 | xAI | Image | aspect ratio, resolution 1K/1.5K/2K, quality auto/low/medium, up to 5 images | ~$0.04/image | `grok-imagine-image-2.0` |
| Grok Image | xAI | Image | aspect ratio, resolution 1K/2K, up to 5 images | ~$0.02/image | `grok-imagine-image` |
| Grok Video | xAI | Text → Video | aspect ratio, 1–15s, 480p/720p, up to 3 images | ~$0.05/sec | `grok-imagine-video` |

**Totals:** 47 models (31 Image, 1 Edit, 6 Image → Video, 6 Text → Video, 3 Video → Video). Prices are the app's estimates; Evolink and OpenRouter report the exact charge after each run.
<!-- models:end -->

---

## Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Properties + Flexbox/Grid), Vanilla JavaScript (ES6 Modules)
- **Backend:** Vercel Serverless Functions (Node.js) / Express for local development
- **Storage:** IndexedDB (primary), localStorage (fallback)
- **APIs:** OpenRouter, xAI, Evolink
- **Testing:** Node.js built-in test runner (`npm test`), GitHub Actions CI

---

## Project Structure

```text
├── api/
│   ├── generate.js           # Generation endpoint — routes to provider modules
│   ├── generation-routing.js # Shared validation & provider resolution
│   ├── extra-options.js      # Catalog-driven model options (seed, planning depth, ...)
│   ├── model-catalog.js      # Backend catalog mirror (CJS)
│   ├── enhance.js            # Prompt enhancement (xAI)
│   ├── random-prompt.js      # AI random prompt generation
│   ├── generation-status.js  # Generic async image/video task status
│   ├── video-status.js       # Backward-compatible status alias
│   ├── validate-*-key.js     # API key validation handlers
│   └── providers/            # Provider-specific handlers
│       ├── openrouter.js     # OpenRouter Image API, with chat-completions fallback
│       ├── xai.js
│       ├── evolink.js        # Evolink image (Seedream, GPT Image, MiniMax, Nano Banana, Z Image Turbo)
│       ├── evolink-video.js  # Evolink video: Seedance, HappyHorse, Gemini Omni, MiniMax
│       ├── evolink-task.js   # Shared Evolink task-result helpers
│       └── format-errors.js
├── scripts/
│   └── model-table.mjs       # Generates the README model tables
├── shared/
│   └── model-catalog.json    # Single source of truth for all models
├── js/
│   ├── app.js                # Main entry — orchestration & wiring
│   ├── generation-controller.js
│   ├── generation-polling.js # Adaptive multi-task polling and accounting metadata
│   ├── model-picker.js
│   ├── spend-tracker.js
│   ├── model-capabilities.js # Frontend catalog resolver
│   ├── models.js             # Model picker exports
│   ├── settings-keys.js      # Multi-provider API key UI
│   ├── api.js                # Client-side API wrapper (incl. browser video upload)
│   ├── video-input.js        # Video attachments for video-to-video models
│   ├── gallery.js            # Gallery rendering & lightbox
│   ├── state.js              # State management & persistence
│   └── ...
├── tests/
│   ├── catalog-integrity.test.js
│   ├── model-catalog.test.js
│   ├── generate-routing.test.js
│   ├── evolink-payload.test.js
│   ├── extra-options.test.js
│   ├── evolink-video-input.test.js
│   ├── readme-models.test.js
│   ├── generation-status.test.js
│   ├── generation-polling.test.js
│   ├── pwa-assets.test.js
│   └── ui-capabilities.test.js
├── css/                      # base, layout, components, gallery
├── index.html
├── server.js                 # Express server for local development
└── vercel.json
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- API key for at least one provider:
  - [OpenRouter](https://openrouter.ai/keys) — FLUX, Gemini, GPT-5, Seedream (OR)
  - [xAI](https://console.x.ai) — Grok image and video models
  - [Evolink](https://evolink.ai/dashboard/keys) — Seedream, GPT Image, Nano Banana, MiniMax, Z Image Turbo, Seedance, Gemini Omni, and HappyHorse models

### Local Development

1. **Clone and install**

   ```bash
   git clone https://github.com/AppleLamps/openrouter-photo.git
   cd openrouter-photo
   npm install
   ```

2. **Run the server**

   ```bash
   npm start
   ```

   For full serverless emulation (recommended when testing API routes):

   ```bash
   npx vercel dev
   ```

3. **Open in browser**

   ```text
   http://localhost:3000
   ```

4. **Add your API key**

   Click the settings icon and paste your API key(s). Keys are stored locally in your browser — the server never logs them.

### Run Tests

```bash
npm test
```

Tests cover catalog integrity, provider routing and payloads, API-key validation, async status/polling, download validation, PWA startup assets, accounting, and UI capabilities. CI runs on every push via GitHub Actions.

### Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Deploy (no environment variables required — users provide their own API keys)

For deployment-wide abuse protection, connect an Upstash Redis database and set
`UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN`. The API uses an atomic
shared limit when those variables are present; otherwise it falls back to a
per-process limiter suitable for local development. Set
`API_RATE_LIMIT_FAIL_CLOSED=true` if requests must be rejected whenever the
shared limiter is unavailable.

Or use the CLI:

```bash
npx vercel --prod
```

---

## Usage Guide

### Basic Workflow

1. Enter your API key(s) in Settings (stored locally in your browser)
2. Type a description of the image or video you want to generate
3. Select a model from the dropdown (search and filter by Image / Edit / Video tabs)
4. Choose the number of images (1–4; video models always produce 1)
5. Click the send button or press **Enter** to generate
6. Async cards update independently; completed media is kept if another task fails or is cancelled
7. Click any thumbnail to view full-size with download option; videos play inline

### Image Attachments

1. Click the attachment button or drag-and-drop images onto the input
2. Attach up to 10 reference images (8 MB max each); the selected model may allow fewer
3. Accepted images are compressed sequentially before upload; progress is announced in the composer
4. Describe the changes you want applied
5. Generate with a compatible edit model (Seedream 4.5 Edit, GPT-5, Gemini, etc.)

### Image-to-Video

1. Select the image-to-video model (Evolink Seedance 2.0 I2V) — or click **Animate** on any generated image
2. Attach **1 image** as the start frame (required)
3. Optionally attach a **second image** as the end frame
4. Enter a motion/scene prompt
5. Adjust video length and quality in Settings if the model supports them
6. Generate — the card shows progress while rendering, then displays an inline video player

### Folder Organization

1. Click **New Folder** in the sidebar to create a folder
2. Select a folder from the dropdown before generating to auto-organize
3. Use the three-dot menu on folders to rename or delete
4. Toggle **Edit Folders** to enter bulk selection mode
5. Set **Photo Visibility** in settings to control the "All Photos" view

### Cost Tracking

1. View per-image cost in the lightbox metadata
2. Click the spend pill (top of screen) to open the breakdown modal
3. See total spend, per-model costs, and generation counts

---

## Settings Reference

Settings use a modal side drawer on desktop and a bottom sheet on mobile. They are organized into keyboard-accessible **Generation**, **Storage**, and **Keys** tabs; API-key prompts open Keys, focus their visible action, then return focus to the relevant provider field when dismissed.

| Tab | Setting | Description |
| --- | --- | --- |
| **Generation** | Aspect ratio, resolution, exact size, output format | Catalog-driven image controls shown only for compatible models |
| **Generation** | Video length and quality | Model-specific duration and resolution controls |
| **Generation** | Web Search and Generate Audio | Remembered independently for each compatible model during the session |
| **Generation** | Photo Visibility | Show all media in the main gallery or only within its folder |
| **Storage** | Storage usage, download all, clear all | Keeps storage actions separate from provider credentials |
| **Keys** | OpenRouter, xAI, and Evolink API keys | Local browser storage with show/hide, save, and test actions |

Output counts are also catalog-driven: image models currently allow up to four outputs, while video models force one and hide the count selector.

---

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Generate images |
| `Shift + Enter` | New line in prompt |
| `Escape` | Close lightbox or modal |
| `Ctrl/Cmd + V` | Paste image from clipboard |

---

## Technical Limits

| Constraint | Limit |
| --- | --- |
| **Request/Response Body** | 4 MB application cap (below Vercel's platform limit) |
| **Image Attachments** | 10 images max in the composer; lower per-model limits are enforced from the catalog |
| **Attachment Size** | 8 MB max per image |
| **Upload Compression** | Accepted attachments re-encoded to at most 768px, JPEG 75% |
| **Storage Compression** | Full-res images re-encoded to WebP/JPEG (92% quality) before IndexedDB storage |
| **Batch Size** | Catalog-driven; currently 1–4 images or exactly 1 video |
| **Async Polling** | Adaptive 3–15 second delay, 6-minute ceiling, transient retries, shared cancellation |

---

## Troubleshooting

### "API key is required"

- Open Settings and enter the key for your selected model's provider
- OpenRouter — FLUX, Gemini, GPT-5, Seedream (OR)
- xAI — Grok image and video models
- Evolink — Seedream, GPT Image, Nano Banana, MiniMax, Z Image Turbo, Seedance, Gemini Omni, and HappyHorse models
- Ensure the key is saved (click Save)

### Images not generating

- Check your account has sufficient credits with the relevant provider
- Verify the selected model supports your request type
- Edit models require at least one attached image
- Image-to-video models require at least one image attachment

### Generation stuck on pending

- Evolink images and all videos use async tasks; polling backs off from 3 to 15 seconds with a 6-minute ceiling
- If one task fails, completed results are retained and only failed cards need retrying
- If it times out, retry the failed card — async provider jobs can occasionally stall
- Verify your Evolink/xAI API key has credits

### Storage full warning

- Open Settings and check the storage indicator
- Click **Clear All Images** to free space
- Images are stored locally in your browser

### Attachments not working

- Ensure images are under 8 MB each
- Maximum 10 attachments in the composer; the selected model may enforce a lower limit
- Try a different image format (PNG, JPEG, WebP supported)

### PWA not installing

- Access via HTTPS (localhost works for testing)
- Check browser supports PWA installation
- Clear browser cache and reload

---

## For Contributors

Models are defined in [`shared/model-catalog.json`](shared/model-catalog.json) — one catalog entry drives the picker, settings UI, backend routing, and pricing hints. No hardcoded model lists elsewhere.

Capability profiles also define `output.maxImages` and `output.defaultImages`; keep frontend controls and API validation catalog-driven rather than adding model-ID checks.

**→ [Adding a model](docs/adding-a-model.md)** — decision tree, profile reference, JSON examples, and test checklist.

Architecture notes for agents: [`AGENTS.md`](AGENTS.md).

---

## License

MIT License

---

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for unified AI model access
- [Evolink](https://evolink.ai/) for hosted Seedream image and Seedance video models
- [xAI](https://x.ai/) for Grok image and video models
- [Vercel](https://vercel.com/) for serverless hosting
