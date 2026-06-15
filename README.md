# AI Image & Video Generator

A modern, lightweight AI image and video generator. Built with vanilla JavaScript (ES Modules) and deployable to Vercel with zero build configuration. Supports **17 models** across OpenRouter, xAI, and Evolink.

![No Build Tools](https://img.shields.io/badge/Build-None%20Required-green)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)

---

## Features

### Image & Video Generation

- **Multi-Model Support** — 17 catalog-driven models (13 image, 1 edit, 3 video)
- **Batch Generation** — Create 1–4 images per request (video models produce 1)
- **Configurable Output** — Aspect ratio, resolution, video length/quality, and model-specific options from the catalog
- **Video Generation** — Text-to-video via xAI Grok and Evolink Seedance 2.0; image-to-video via Evolink Seedance 2.0
- **Audio in Videos** — Evolink Seedance 2.0 supports generated audio

### Image Editing

- **Reference Images** — Attach up to 4 images for editing, variations, or video start/end frames
- **Auto Compression** — Large uploads automatically compressed (1024px max, JPEG 85%)
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

- **Keyboard Shortcuts** — Quick actions without mouse
- **Touch Gestures** — Swipe-to-close lightbox on mobile
- **PWA Support** — Install as standalone app on any device
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
| **ByteDance** | Seedream 4.5 (OpenRouter + Evolink), Seedream 4.5 Edit, Seedream 5 Lite, Seedance 2.0 (T2V + I2V) | Image, Edit, Video | OpenRouter / Evolink |
| **Tongyi** | Z Image Turbo | Image | Evolink |
| **xAI** | Grok Image, Grok Image Quality, Grok Video | Image, Video | xAI |

**Totals:** 17 models — 8 OpenRouter, 6 Evolink (4 image + 2 video), 3 xAI. By type: 13 image, 1 edit, 3 video (2 text-to-video, 1 image-to-video).

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
│   ├── video-status.js       # Async video job polling (xAI + Evolink)
│   ├── test-key.js           # API key validation endpoints
│   └── providers/            # Provider-specific handlers
│       ├── openrouter.js
│       ├── xai.js
│       ├── evolink.js        # Evolink image (Seedream, Z Image Turbo)
│       ├── evolink-video.js  # Evolink Seedance 2.0 video (T2V + I2V)
│       └── format-errors.js
├── shared/
│   └── model-catalog.json    # Single source of truth for all models
├── js/
│   ├── app.js                # Main entry — orchestration & wiring
│   ├── generation-controller.js
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
  - [Evolink](https://evolink.ai/dashboard/keys) — Seedream 4.5/5 Lite, Z Image Turbo, and Seedance 2.0 video

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

Tests cover catalog integrity, provider routing, Evolink payload shapes, and UI capability flags. CI runs on every push via GitHub Actions.

### Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Deploy (no environment variables required — users provide their own API keys)

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
6. Click any thumbnail to view full-size with download option; videos play inline

### Image Attachments

1. Click the attachment button or drag-and-drop images onto the input
2. Attach up to 4 reference images (8 MB max each)
3. Images are automatically compressed if too large
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

| Setting | Description | Options |
| --- | --- | --- |
| **OpenRouter API Key** | Key for OpenRouter-backed models | Text input with show/hide toggle |
| **xAI API Key** | Key for Grok image/video models | Text input with show/hide toggle |
| **Evolink API Key** | Key for Evolink-hosted models (Seedream, Z Image Turbo, Seedance 2.0 video) | Text input with show/hide toggle |
| **Aspect Ratio** | Output dimensions (where supported) | 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9, 9:21 |
| **Resolution** | Output resolution (Gemini, Evolink Seedream, xAI) | 1K, 2K, 3K, 4K (model-dependent) |
| **Video Length** | Duration for video models | Model-dependent (e.g. 4–15 s Seedance, 1–15 s xAI) |
| **Video Quality** | Resolution for video models | 480p, 720p, 1080p |
| **Photo Visibility** | Controls "All Photos" gallery behavior | Show all photos / Folder-only view |

Available settings depend on the selected model — the UI reads capability flags from the catalog.

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
| **Request/Response Body** | 4.5 MB (Vercel limit) |
| **Image Attachments** | 4 images max per generation |
| **Attachment Size** | 8 MB max per image |
| **Upload Compression** | Attachments over limits compressed to 1024px, JPEG 85% |
| **Storage Compression** | Full-res images re-encoded to WebP/JPEG (92% quality) before IndexedDB storage |
| **Batch Size** | 1–4 images per generation |

---

## Troubleshooting

### "API key is required"

- Open Settings and enter the key for your selected model's provider
- OpenRouter — FLUX, Gemini, GPT-5, Seedream (OR)
- xAI — Grok image and video models
- Evolink — Seedream 4.5/5 Lite, Z Image Turbo, and Seedance 2.0 video
- Ensure the key is saved (click Save)

### Images not generating

- Check your account has sufficient credits with the relevant provider
- Verify the selected model supports your request type
- Edit models require at least one attached image
- Image-to-video models require at least one image attachment

### Video generation stuck on pending

- Video generation typically takes 30–180 seconds; polling runs every 3 s up to a 6-minute timeout
- If it times out, try again — async video jobs can occasionally stall
- Verify your Evolink/xAI API key has credits

### Storage full warning

- Open Settings and check the storage indicator
- Click **Clear All Images** to free space
- Images are stored locally in your browser

### Attachments not working

- Ensure images are under 8 MB each
- Maximum 4 images per generation
- Try a different image format (PNG, JPEG, WebP supported)

### PWA not installing

- Access via HTTPS (localhost works for testing)
- Check browser supports PWA installation
- Clear browser cache and reload

---

## For Contributors

Models are defined in [`shared/model-catalog.json`](shared/model-catalog.json) — one catalog entry drives the picker, settings UI, backend routing, and pricing hints. No hardcoded model lists elsewhere.

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
