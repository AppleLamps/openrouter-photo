# AI Image & Video Generator

A modern, lightweight AI image and video generator. Built with vanilla JavaScript (ES Modules) and deployable to Vercel with zero build configuration. Supports multiple providers — OpenRouter, xAI, and Fal.

![No Build Tools](https://img.shields.io/badge/Build-None%20Required-green)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)

---

## Features

### Image & Video Generation

- **Multi-Model Support** - Generate images and videos using 20+ AI models from leading providers
- **Batch Generation** - Create 1-4 images per request
- **Configurable Output** - Aspect ratio (9 presets) and resolution settings for supported models
- **Video Generation** - Text-to-video and image-to-video via xAI Grok and Fal Seedance 1.5 Pro
- **Audio in Videos** - Seedance 1.5 Pro generates videos with audio by default

### Image Editing

- **Reference Images** - Attach up to 3 images for editing, variations, or video start/end frames
- **Auto Compression** - Large uploads automatically compressed (1024px max, JPEG 85%)
- **Model Interpretation** - Describe changes and let compatible models apply them
- **Image-to-Video** - Use attached images as start frame (and optional end frame) for Seedance I2V

### Prompt Tools

- **AI Enhancement** - Improve prompts with one click using Grok-4
- **Surprise Me** - AI-generated random prompts combining subjects, styles, moods, settings, and lighting

### Gallery & Organization

- **Responsive Grid** - Thumbnail gallery with shimmer loading animations; video cards show inline playback
- **Lightbox Viewer** - Full-screen preview with metadata, download, and remix options
- **Folder System** - Organize images and videos into custom folders with drag-and-drop
- **Bulk Selection** - Multi-select mode for batch operations
- **Visibility Modes** - Show all media or folder-only view

### Cost Management

- **Real-Time Tracking** - Cost displayed per image/video as it generates
- **Spend Dashboard** - Breakdown by model with generation counts
- **Total Spend** - Running total accessible from the UI

### User Experience

- **Keyboard Shortcuts** - Quick actions without mouse
- **Touch Gestures** - Swipe-to-close lightbox on mobile
- **PWA Support** - Install as standalone app on any device
- **Persistent Storage** - IndexedDB with localStorage fallback
- **Zero Build** - No bundlers, transpilers, or build steps required

---

## Supported Models

| Provider | Model | Type | API Key |
|----------|-------|------|---------|
| Black Forest Labs | FLUX.2 Pro, FLUX.2 Max, FLUX.2 Flex | Image | OpenRouter |
| Google | Gemini 3 Pro Image, Gemini 2.5 Flash Image | Image | OpenRouter |
| OpenAI | GPT-5 Image, GPT-5 Image Mini | Image | OpenRouter |
| ByteDance | Seedream 4.5 (via OpenRouter) | Image | OpenRouter |
| ByteDance (Fal) | Seedream 4.5 T2I, Seedream 4.5 Edit | Image | Fal |
| ByteDance (Fal) | Seedream 5 Lite T2I, Seedream 5 Lite Edit | Image | Fal |
| ByteDance (Fal) | Seedance 1.5 Pro Text-to-Video | Video | Fal |
| ByteDance (Fal) | Seedance 1.5 Pro Image-to-Video | Video | Fal |
| xAI | Grok Imagine Image, Grok Imagine Image Pro | Image | xAI |
| xAI | Grok Imagine Video | Video | xAI |
| Sourceful | Riverflow v2 (Max, Standard, Fast) | Image | OpenRouter |

---

## Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Properties + Flexbox/Grid), Vanilla JavaScript (ES6 Modules)
- **Backend:** Vercel Serverless Functions (Node.js) / Express for local development
- **Storage:** IndexedDB (primary), localStorage (fallback)
- **APIs:** OpenRouter, xAI, Fal

---

## Project Structure

```
├── api/
│   ├── generate.js       # Image generation endpoint (OpenRouter proxy)
│   ├── enhance.js        # Prompt enhancement endpoint
│   ├── random-prompt.js  # AI-generated random prompt endpoint
│   └── test-key.js       # API key validation endpoint
├── css/
│   ├── base.css          # Reset, CSS variables, colors
│   ├── layout.css        # Layout, sidebar, responsive breakpoints
│   ├── components.css    # Input bar, buttons, modals, settings panel
│   └── gallery.css       # Grid layout, cards, shimmer animations
├── js/
│   ├── app.js            # Main entry point, event handling
│   ├── api.js            # Client-side API wrapper
│   ├── config.js         # Configuration constants
│   ├── state.js          # State management & persistence
│   ├── storage.js        # IndexedDB storage layer
│   ├── gallery.js        # Gallery rendering & lightbox
│   ├── sidebar.js        # Folder sidebar & navigation
│   ├── image-utils.js    # Image compression & processing
│   ├── prompts.js        # Random prompt suggestions
│   └── utils.js          # Helper functions
├── public/
│   ├── manifest.json     # PWA manifest
│   └── icon-192.svg      # App icon
├── index.html            # Main HTML file
├── sw.js                 # Service worker (root scope)
├── server.js             # Express server for local development
├── vercel.json           # Vercel configuration
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- API key for at least one provider:
  - [OpenRouter API Key](https://openrouter.ai/keys) — FLUX, Gemini, GPT-5, Seedream (OR), Riverflow
  - [Fal API Key](https://fal.ai/dashboard/keys) — Seedream (Fal), Seedance 1.5 Pro
  - [xAI API Key](https://console.x.ai) — Grok image/video models

### Local Development

1. **Clone and install**

   ```bash
   git clone https://github.com/AppleLamps/free-photo-or.git
   cd free-photo-or
   npm install
   ```

2. **Run the server**

   ```bash
   npm start
   ```

3. **Open in browser**

   ```
   http://localhost:3000
   ```

4. **Add your API key**

   Click the settings icon and paste your API key(s). Use OpenRouter for most models, Fal for Seedream/Seedance, or xAI for Grok models.

### Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Deploy (no environment variables required - users provide their own API key)

Or use the CLI:

```bash
npx vercel --prod
```

---

## Usage Guide

### Basic Workflow

1. Enter your API key(s) in Settings (stored locally in your browser, never logged server-side)
2. Type a description of the image or video you want to generate
3. Select a model from the dropdown
4. Choose the number of images (1-4; video models always produce 1)
5. Click the send button or press **Enter** to generate
6. Click any thumbnail to view full-size with download option; videos play inline

### Image Attachments

1. Click the attachment button or drag-and-drop images onto the input
2. Attach up to 3 reference images (8MB max each)
3. Images are automatically compressed if too large
4. Describe the changes you want applied
5. Generate with a compatible model (GPT-5, Gemini, Seedream Edit)

### Image-to-Video (Seedance 1.5 Pro)

1. Select **fal: seedance-1.5 pro image-to-video** from the model dropdown
2. Attach **1 image** as the start frame (required)
3. Optionally attach a **second image** as the end frame
4. Enter a motion/scene prompt
5. Adjust video length (4–12 s) and quality in Settings if needed
6. Generate — the card shows a progress state while rendering, then displays an inline video player

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
|---------|-------------|---------|
| **OpenRouter API Key** | Key for OpenRouter-backed models | Text input with show/hide toggle |
| **xAI API Key** | Key for Grok image/video models | Text input with show/hide toggle |
| **Fal API Key** | Key for Seedream/Seedance Fal models | Text input with show/hide toggle |
| **Aspect Ratio** | Output dimensions (Gemini, Seedream, Fal, xAI) | 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9, 9:21 |
| **Gemini Image Size** | Output resolution (Gemini models only) | 1K, 2K, 4K |
| **Video Length** | Duration for video models | 4–12 s (Seedance), 1–15 s (xAI) |
| **Video Quality** | Resolution for video models | 480p, 720p, 1080p |
| **Photo Visibility** | Controls "All Photos" gallery behavior | Show all photos / Folder-only view |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Generate images |
| `Shift + Enter` | New line in prompt |
| `Escape` | Close lightbox or modal |
| `Ctrl/Cmd + V` | Paste image from clipboard |

---

## Technical Limits

| Constraint | Limit |
|------------|-------|
| **Request/Response Body** | 4.5 MB (Vercel limit) |
| **Image Attachments** | 3 images max per generation |
| **Attachment Size** | 8 MB max per image |
| **Auto Compression** | Images > limits compressed to 1024px, JPEG 85% |
| **Batch Size** | 1-4 images per generation |

---

## Troubleshooting

### "API key is required"

- Open Settings and enter the key for your selected model's provider
- OpenRouter key for FLUX / Gemini / GPT-5 / Riverflow
- Fal key for Seedream / Seedance models
- xAI key for Grok models
- Ensure the key is saved (click Save)

### Images not generating

- Check your account has sufficient credits with the relevant provider
- Verify the selected model supports your request type
- Edit models require at least one attached image (Seedream Edit, GPT-5, Gemini)
- Image-to-video (Seedance I2V) requires at least one image attachment

### Video generation stuck on pending

- Video generation typically takes 30–90 seconds; polling runs every 3 s up to a 3-minute timeout
- If it times out, try again — Fal queue jobs can occasionally stall
- Verify your Fal/xAI API key has credits

### Storage full warning

- Open Settings and check the storage indicator
- Click **Clear All Images** to free space
- Images are stored locally in your browser

### Attachments not working

- Ensure images are under 8MB each
- Maximum 3 images per generation
- Try a different image format (PNG, JPEG, WebP supported)

### PWA not installing

- Access via HTTPS (localhost works for testing)
- Check browser supports PWA installation
- Clear browser cache and reload

---

## License

MIT License

---

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for unified AI model access
- [Vercel](https://vercel.com/) for serverless hosting
