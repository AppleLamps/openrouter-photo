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

```text
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
- **Tests**: `npm test` (`node --test tests/**/*.test.js`) — catalog, routing, Evolink payloads, UI capabilities
- API keys passed via client headers (`X-OpenRouter-Api-Key`, `X-XAI-Api-Key`, `X-Evolink-Api-Key`) — see `js/settings-keys.js`

## Learned User Preferences

- When adding models, only add new entries; do not remove existing models or change default shortcuts or behavior unless explicitly requested.
- Before adding a model, review how similar models are registered in the catalog and provider modules rather than inventing a new pattern.
- Do not change lightbox shortcuts, default model selection, or other UX defaults while adding models unless the user asks.
- Do not split files or refactor solely to hit arbitrary line-count targets; only extract or refactor when it clearly improves maintainability.

## Learned Workspace Facts

- `shared/model-catalog.json` is the single source of truth for model metadata, capability profiles, pricing, UI flags, and legacy ID redirects.
- Frontend resolves capabilities via `js/model-capabilities.js`; backend via `api/model-catalog.js` (CommonJS mirror of the same logic).
- `js/models.js` builds the model picker from the catalog; new models appear in the UI when added to the catalog only.
- `api/generate.js` routes requests to provider modules under `api/providers/` (openrouter, xai, evolink, evolink-video, format-errors) by `capabilityProfiles.backend`.
- `api/model-catalog.js` exposes catalog helpers (`getBackend`, `getApiKey`, `getEvolinkConfig`, `getModelPricing`, `getUiCapabilities`, etc.) derived from the catalog.
- Run tests with `npm test` (`node --test tests/**/*.test.js`); catalog routing is covered by `tests/model-catalog.test.js`.
- API key UI for OpenRouter, xAI, and Evolink lives in `js/settings-keys.js` (`API_KEY_FIELDS` config table).
- Multiple provider API keys are used (not only OpenRouter); keys are sent from the client via headers and resolved in `api/_middleware.js`.
- Evolink model-specific payload shapes use `evolink.variant` / `evolink.apiModel` on capability profiles (or per-model overrides) and branches in `api/providers/evolink.js` (image) or `api/providers/evolink-video.js` (Seedance 2.0 video).
- Video models are async: `generate.js` returns `202 { request_id, provider }` and the client polls `/api/video-status` (xAI and Evolink Seedance task status).
- `.hintrc` extends `development` and ignores intentional compat warnings for `meta[name=theme-color]` and `video[playsinline]`.
- `tests/catalog-integrity.test.js` enforces catalog completeness (model counts, backend/type counts, legacy redirects, edit-model input requirements, no-fal guard).

## Adding a model

**Full guide:** [docs/adding-a-model.md](docs/adding-a-model.md)

Quick checklist:

1. Copy the closest existing model in `shared/model-catalog.json`; add to `models` (new `capabilityProfiles` entry only if nothing fits).
2. Evolink image with new payload family → new `evolink-*` profile (or model `evolink` override) + branch in `api/providers/evolink.js`.
3. Evolink video with new payload family → new `evolink-video-*` profile + branch in `api/providers/evolink-video.js`.
4. New provider entirely → new file under `api/providers/`, route in `api/generate.js`, mirror in `api/model-catalog.js` (and a `video-status.js` branch for async video).
5. Run `npm test`.
6. Manual: picker, settings panels, one successful generation with the correct API key.

Do not remove models, change `defaultModelId`, or alter UX defaults unless explicitly requested.
