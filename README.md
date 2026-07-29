# AI Image & Video Generator

A modern, lightweight AI image and video generator. Built with vanilla JavaScript (ES Modules) and deployable to Vercel with zero build configuration. Supports **19 models** across OpenRouter, xAI, and Evolink.

![No Build Tools](https://img.shields.io/badge/Build-None%20Required-green)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)

---

## Features

### Image & Video Generation

- **Multi-Model Support** — 19 catalog-driven models (14 image, 1 edit, 4 video)
- **Batch Generation** — Create 1–4 images per request (video models produce 1)
- **Configurable Output** — Aspect ratio, resolution, video length/quality, and model-specific options from the catalog
- **Video Generation** — Text-to-video via xAI Grok and Evolink Seedance 2.0; image-to-video via Evolink Seedance 2.0 and HappyHorse 1.0
- **Audio in Videos** — Evolink Seedance 2.0 supports generated audio
- **Resilient Async Tasks** — Evolink images and all videos poll independently, preserve partial successes, and allow per-task retry

### Image Editing

- **Reference Images** — Attach up to 10 images, subject to the selected model's catalog limit
- **Auto Compression** — Accepted uploads are processed sequentially and re-encoded at up to 768px, JPEG 75%
- **Model Interpretation** — Describe changes and let compatible edit models apply them
- **Image-to-Video** — Use attached images as start frame (and optional end frame) for I2V models

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
- **Zero Build** — No bundlers, transpilers, or build steps required

---

## Supported Models

All models are defined in `shared/model-catalog.json` — the single source of truth for routing, UI capabilities, and pricing.

| Provider | Models | Types | API Key |
| --- | --- | --- | --- |
| **Black Forest Labs** | Flux 2 Pro / Max / Flex | Image | OpenRouter |
| **Google** | Gemini 3 Pro Image, Gemini 2.5 Flash Image | Image | OpenRouter |
| **OpenAI** | GPT-5 Image, GPT-5 Image Mini | Image | OpenRouter |
| **ByteDance** | Seedream 4.5 (OpenRouter + Evolink), Seedream 4.5 Edit, Seedream 5 Lite, Seedream 5.0 Pro, Seedance 2.0 (T2V + I2V) | Image, Edit, Video | OpenRouter / Evolink |
| **Tongyi** | Z Image Turbo | Image | Evolink |
| **HappyHorse** | HappyHorse 1.0 | Image-to-Video | Evolink |
| **xAI** | Grok Image, Grok Image Quality, Grok Video | Image, Video | xAI |

**Totals:** 19 models — 8 OpenRouter, 8 Evolink (5 image + 3 video), 3 xAI. By type: 14 image, 1 edit, 4 video (2 text-to-video, 2 image-to-video).

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
│   ├── model-catalog.js      # Backend catalog mirror (CJS)
│   ├── enhance.js            # Prompt enhancement (xAI)
│   ├── random-prompt.js      # AI random prompt generation
│   ├── generation-status.js  # Generic async image/video task status
│   ├── video-status.js       # Backward-compatible status alias
│   ├── validate-*-key.js     # API key validation handlers
│   └── providers/            # Provider-specific handlers
│       ├── openrouter.js
│       ├── xai.js
│       ├── evolink.js        # Evolink image (Seedream, Z Image Turbo)
│       ├── evolink-video.js  # Evolink Seedance 2.0 video (T2V + I2V)
│       ├── evolink-task.js   # Shared Evolink task-result helpers
│       └── format-errors.js
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
│   ├── api.js                # Client-side API wrapper
│   ├── gallery.js            # Gallery rendering & lightbox
│   ├── state.js              # State management & persistence
│   └── ...
├── tests/
│   ├── catalog-integrity.test.js
│   ├── model-catalog.test.js
│   ├── generate-routing.test.js
│   ├── evolink-payload.test.js
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
  - [Evolink](https://evolink.ai/dashboard/keys) — Seedream, Z Image Turbo, Seedance 2.0, and HappyHorse models

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
- Evolink — Seedream, Z Image Turbo, Seedance 2.0, and HappyHorse models
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
