# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Development Commands

```bash
# Local development with Express server
npm start                    # Runs server.js on port 3000

# Vercel development (full serverless emulation, recommended for testing API routes)
npx vercel dev
```

## Environment Setup

Create `.env.local` with:
- `OPENROUTER_API_KEY` - Required for image generation and prompt enhancement

Users can also paste their OpenRouter API key directly in the Settings panel (stored in localStorage).

## Architecture

**Zero-build vanilla JavaScript application** for AI image generation via OpenRouter.

### Data Flow
```
User Input → js/app.js → js/api.js → /api/generate or /api/enhance → OpenRouter API → localStorage (state.js) → gallery.js render
```

### Two Deployment Modes
- **Vercel**: Serverless functions in `api/` handle backend requests
- **Local**: Express server (`server.js`) proxies the same `api/` handlers

### Frontend (`js/`)
- ES Modules only - all files use `import`/`export`, loaded via `type="module"` in HTML
- `app.js`: Main entry, event handlers, settings UI coordination
- `api.js`: HTTP client wrapper for backend endpoints
- `state.js`: Singleton `State` class with localStorage persistence and pub/sub pattern
- `gallery.js`: DOM rendering for image grid, lightbox, placeholder animations
- `utils.js`: Pure helper functions (`createElement`, `debounce`, `generateId`)
- `prompts.js`: Static array of creative prompt templates for "Surprise Me" feature

### Backend (`api/`)
- Handlers export `module.exports = async function handler(req, res)` (CommonJS for Vercel compatibility)
- Both handlers follow identical patterns: CORS setup → method check → validation → external API call → response
- `generate.js`: Image generation via OpenRouter (supports Gemini models with aspect ratio config)
- `enhance.js`: Prompt enhancement via OpenRouter using `x-ai/grok-4.1-fast-fast`

### CSS (`css/`)
- CSS Custom Properties defined in `base.css` `:root` - use these variables, don't hardcode colors
- BEM-style naming: `.gallery__card`, `.header__title`, `.empty-state__icon`
- Split by concern: `base.css` (reset/vars), `layout.css` (structure), `components.css` (UI elements), `gallery.css` (grid/animations)

## Code Patterns

### Adding New API Endpoints
1. Create handler in `api/` following `generate.js` pattern (CORS headers, OPTIONS handling, POST-only)
2. Add Express route in `server.js` for local dev
3. Create client function in `js/api.js`

### State Management
```javascript
import { state } from './state.js';
state.addImage({ id, url, prompt, createdAt });  // Triggers listeners
state.subscribe((action, data) => { /* handle */ });
```

### DOM Creation
```javascript
import { createElement } from './utils.js';
const btn = createElement('button', { className: 'btn', onClick: handler }, 'Click');
```

### Image Data Structure
```javascript
{ id: string, url: string, prompt: string, createdAt: number }
```

## Important Notes

- **localStorage key**: `ai-image-generator-images` - clear this to reset gallery
- **No test framework** - manual testing via browser DevTools
- API key passed via `X-OpenRouter-Api-Key` header from client
