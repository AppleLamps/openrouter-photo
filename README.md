# AI Image Generator

A modern, lightweight AI image generator powered by OpenRouter. Built with vanilla JavaScript (ES Modules) and deployable to Vercel with zero build configuration.

![No Build Tools](https://img.shields.io/badge/Build-None%20Required-green)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)

---

## Features

### Image Generation
- **Multi-Model Support** - Generate images using 10+ AI models from leading providers
- **Batch Generation** - Create 1-4 images per request
- **Configurable Output** - Aspect ratio (9 presets) and resolution (1K/2K/4K) for supported models

### Image Editing
- **Reference Images** - Attach up to 3 images for editing or variations
- **Auto Compression** - Large uploads automatically compressed (1024px max, JPEG 85%)
- **Model Interpretation** - Describe changes and let compatible models apply them

### Prompt Tools
- **AI Enhancement** - Improve prompts with one click using Grok-4
- **Surprise Me** - AI-generated random prompts combining subjects, styles, moods, settings, and lighting

### Gallery & Organization
- **Responsive Grid** - Thumbnail gallery with shimmer loading animations
- **Lightbox Viewer** - Full-screen preview with metadata, download, and remix options
- **Folder System** - Organize images into custom folders with drag-and-drop
- **Bulk Selection** - Multi-select mode for batch operations
- **Visibility Modes** - Show all photos or folder-only view

### Cost Management
- **Real-Time Tracking** - Cost displayed per image as it generates
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

| Provider | Models |
|----------|--------|
| Black Forest Labs | FLUX.2 Pro, FLUX.2 Max, FLUX.2 Flex |
| Google | Gemini 3 Pro Image, Gemini 2.5 Flash Image |
| OpenAI | GPT-5 Image, GPT-5 Image Mini |
| ByteDance | Seedream 4.5 |
| Sourceful | Riverflow v2 (Max, Standard, Fast) |

---

## Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Properties + Flexbox/Grid), Vanilla JavaScript (ES6 Modules)
- **Backend:** Vercel Serverless Functions (Node.js) / Express for local development
- **Storage:** IndexedDB (primary), localStorage (fallback)
- **API:** OpenRouter

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
│   ├── state.js          # State management & persistence
│   ├── storage.js        # IndexedDB storage layer
│   ├── gallery.js        # Gallery rendering & lightbox
│   ├── sidebar.js        # Folder sidebar & navigation
│   ├── image-utils.js    # Image compression & processing
│   ├── prompts.js        # Random prompt suggestions
│   └── utils.js          # Helper functions
├── public/
│   ├── manifest.json     # PWA manifest
│   ├── sw.js             # Service worker
│   └── icon-192.svg      # App icon
├── index.html            # Main HTML file
├── server.js             # Express server for local development
├── vercel.json           # Vercel configuration
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [OpenRouter API Key](https://openrouter.ai/keys)

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

   Click the settings icon and paste your OpenRouter API key.

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

1. Enter your OpenRouter API key in Settings (stored locally, never sent to our servers)
2. Type a description of the image you want to generate
3. Select a model from the dropdown
4. Choose the number of images (1-4)
5. Click the send button or press **Enter** to generate
6. Click any thumbnail to view full-size with download option

### Image Attachments

1. Click the attachment button or drag-and-drop images onto the input
2. Attach up to 3 reference images (8MB max each)
3. Images are automatically compressed if too large
4. Describe the changes you want applied
5. Generate with a compatible model (GPT-5, Gemini)

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
| **API Key** | Your OpenRouter API key | Text input with show/hide toggle |
| **Aspect Ratio** | Output dimensions (Gemini models only) | 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9, 9:21 |
| **Image Size** | Output resolution (Gemini models only) | 1K, 2K, 4K |
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
- Open Settings and enter your OpenRouter API key
- Ensure the key is saved (click Save or the key auto-saves on input)

### Images not generating
- Check your OpenRouter account has credits
- Verify the selected model supports your request type
- For image editing, ensure you're using a compatible model (GPT-5, Gemini)

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
