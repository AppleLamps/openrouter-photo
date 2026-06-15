# AI Image Generator - Copilot Instructions

## Architecture Overview

This is a **zero-build vanilla JavaScript** application for AI image generation. It runs on two deployment modes:

- **Vercel**: Serverless functions in `api/` handle backend requests
- **Local**: Express server (`server.js`) proxies the same `api/` handlers

### Data Flow

```text
User Input → js/app.js → js/api.js → /api/generate or /api/enhance → External APIs → localStorage (state.js) → gallery.js render
```

### Key External APIs

Models are catalog-driven (`shared/model-catalog.json`); `api/generate.js` routes to a provider module by backend:

- **OpenRouter** (FLUX, Gemini, GPT-5, Seedream): image generation + prompt enhancement (`x-ai/grok-4.1-fast`) — `OPENROUTER_API_KEY`
- **xAI** (Grok image + video): `XAI_API_KEY`
- **Evolink** (Seedream, Z Image Turbo, Seedance 2.0 video): `EVOLINK_API_KEY`

API keys are normally supplied per-request from the client via headers (`X-OpenRouter-Api-Key`, `X-XAI-Api-Key`, `X-Evolink-Api-Key`); the `*_API_KEY` env vars are server-side fallbacks.

## Project Structure & Conventions

### Frontend (`js/`)

- **ES Modules only** - all files use `import`/`export`, loaded via `type="module"` in HTML
- `app.js`: Main entry, event handlers, settings UI coordination
- `api.js`: HTTP client wrapper for backend endpoints (typed with JSDoc)
- `state.js`: Singleton `State` class with localStorage persistence and pub/sub pattern
- `gallery.js`: DOM rendering for image grid, lightbox, placeholder animations
- `utils.js`: Pure helper functions (`createElement`, `debounce`, `generateId`)
- `prompts.js`: Static array of creative prompt templates for "Surprise Me" feature

### Backend (`api/`)

- Handlers export `module.exports = async function handler(req, res)` (CommonJS for Vercel compatibility)
- Handlers follow identical patterns: CORS setup → method check → validation → external API call → response (shared in `api/_middleware.js`)
- Provider keys resolved in `api/_middleware.js` (client header first, then `process.env.OPENROUTER_API_KEY` / `XAI_API_KEY` / `EVOLINK_API_KEY`)

### CSS (`css/`)

- **CSS Custom Properties** defined in `base.css` `:root` - use these variables, don't hardcode colors
- BEM-style naming: `.gallery__card`, `.header__title`, `.empty-state__icon`
- Split by concern: `base.css` (reset/vars), `layout.css` (structure), `components.css` (UI elements), `gallery.css` (grid/animations)

## Development Commands

```bash
# Local development with Express
npm start                    # Runs server.js on port 3000

# Vercel development (full serverless emulation)
vercel dev                   # Recommended for testing API routes

# Tests
npm test                     # node --test (catalog, routing, payloads, UI capabilities)

# Environment setup (optional; keys can also be pasted in the Settings panel)
# Create .env.local with OPENROUTER_API_KEY (and optionally XAI_API_KEY, EVOLINK_API_KEY)
```

## Code Patterns to Follow

### Adding New API Endpoints

1. Create handler in `api/` following `generate.js` pattern (CORS headers, OPTIONS handling, POST-only)
2. Add Express route in `server.js` for local dev
3. Create client function in `js/api.js` with JSDoc types

### State Management

```javascript
// Always use the singleton state instance
import { state } from './state.js';
state.addImage({ id, url, prompt, createdAt });  // Triggers listeners
state.subscribe((action, data) => { /* handle */ });
```

### DOM Creation

```javascript
// Use utils.js createElement helper for dynamic elements
import { createElement } from './utils.js';
const btn = createElement('button', { className: 'btn', onClick: handler }, 'Click');
```

### Image Data Structure

```javascript
{ id: string, url: string, prompt: string, createdAt: number }
```

## Important Behaviors

- **No build step**: Changes to JS/CSS are live-reloadable
- **localStorage key**: `ai-image-generator-images` - clear this to reset gallery
- **Placeholders**: `showPlaceholder()`/`removePlaceholder()` in gallery.js manage loading shimmer
- **Settings panel**: Values read dynamically from DOM in `getGenerationSettings()` (app.js)
- **Image preloading**: Gallery waits for images to load before removing placeholder (seamless UX)

## Testing Considerations

- Run `npm test` (Node's built-in test runner) — covers catalog integrity, provider routing, Evolink payloads, and UI capability flags; CI runs on every push
- Also do manual testing via browser DevTools for UI flows
- Test API failures by temporarily invalidating keys
- Check localStorage persistence by refreshing page after generating images
