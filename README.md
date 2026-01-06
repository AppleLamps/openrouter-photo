# AI Image Generator

A modern, lightweight AI image generator powered by OpenRouter. Built with vanilla JavaScript (ES Modules) and deployable to Vercel with zero build configuration.

![No Build Tools](https://img.shields.io/badge/Build-None%20Required-green)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)

## Features

- **AI Image Generation** - Generate images from text prompts using multiple models (FLUX, Gemini, GPT-5, Seedream, etc.)
- **Image Editing** - Attach images and describe changes (supported by compatible models)
- **Prompt Enhancement** - AI-powered prompt improvement
- **Random Prompts** - Creative prompt suggestions for inspiration
- **Folder Organization** - Organize generated images into custom folders
- **Cost Tracking** - Real-time cost tracking per image and total spend
- **Grid Gallery** - Responsive thumbnail grid with lightbox preview
- **Model Selection** - Choose from multiple image generation models inline
- **Remix** - Re-generate with the same prompt and settings
- **Persistent Storage** - Images saved to IndexedDB with localStorage fallback
- **PWA Support** - Install as a standalone app on mobile and desktop
- **Zero Build** - No Webpack, Vite, or bundlers needed

## Supported Models

| Provider | Models |
|----------|--------|
| Black Forest Labs | FLUX.2 Pro, FLUX.2 Max, FLUX.2 Flex |
| Google | Gemini 3 Pro Image, Gemini 2.5 Flash Image |
| OpenAI | GPT-5 Image, GPT-5 Image Mini |
| ByteDance | Seedream 4.5 |
| Sourceful | Riverflow v2 (Max, Standard, Fast) |

## Tech Stack

- **Frontend:** HTML5, CSS3 (Variables + Flexbox/Grid), Vanilla JS (ES6 Modules)
- **Backend:** Vercel Serverless Functions (Node.js) / Express for local dev
- **Storage:** IndexedDB (primary), localStorage (fallback)
- **API:** OpenRouter

## Project Structure

```
├── api/
│   ├── generate.js       # Image generation endpoint (OpenRouter proxy)
│   ├── enhance.js        # Prompt enhancement endpoint
│   └── test-key.js       # API key validation endpoint
├── css/
│   ├── base.css          # Reset, variables, colors
│   ├── layout.css        # Layout, sidebar, responsive
│   ├── components.css    # Input bar, buttons, modal, settings
│   └── gallery.css       # Grid layout, cards, shimmer animations
├── js/
│   ├── app.js            # Main entry point, event handling
│   ├── api.js            # Client-side API wrapper
│   ├── state.js          # State management & persistence
│   ├── storage.js        # IndexedDB storage layer
│   ├── gallery.js        # Gallery rendering & lightbox
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

## Usage

1. Enter your OpenRouter API key in Settings (stored locally in browser)
2. Type a description of the image you want
3. (Optional) Attach an image for editing/variation
4. (Optional) Click the sparkle icon to enhance your prompt
5. (Optional) Click the dice icon for a random prompt
6. Select a model and number of images
7. Click send or press Enter to generate
8. Click any thumbnail for fullscreen view with download option

### Settings

- **OpenRouter API Key** - Required for generation
- **Aspect Ratio** - For Gemini models (1:1, 16:9, etc.)
- **Image Size** - For Gemini models (1K, 2K, 4K)
- **Photo Visibility** - Show all photos or folder-only

### Limits

- **Vercel:** 4.5 MB request/response body limit
- **Image attachments:** Automatically compressed to stay under limits

## License

MIT License

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for unified AI model access
- [Vercel](https://vercel.com/) for serverless hosting
