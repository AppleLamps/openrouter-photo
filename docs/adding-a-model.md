# Adding a model

All models are defined in **`shared/model-catalog.json`**. That file is the single source of truth for:

- Model picker entries (name, provider, type, tier)
- Backend routing (`openrouter`, `xai`, `evolink`, `evolink-video`)
- Settings panel visibility (aspect ratio, resolution, video length, etc.)
- Input image requirements and limits
- Spend-tracker pricing hints

You do **not** edit `js/models.js`, `index.html` model lists, or `api/generate.js` for a typical add. The frontend reads the catalog via `js/model-capabilities.js`; the backend mirrors it in `api/model-catalog.js`.

---

## Quick checklist

1. Find the closest existing model in `shared/model-catalog.json` and copy its pattern.
2. Add a row to the `models` array (and a new `capabilityProfiles` entry only if no profile fits).
3. For a new Evolink API family, add a branch in `api/providers/evolink.js` (image) or `api/providers/evolink-video.js` (video).
4. Run `npm test`.
5. Manual smoke: pick the model in the UI, confirm settings panels, generate once.

---

## Decision tree

```text
New model
    │
    ├─ OpenRouter (FLUX, Gemini, GPT-5, Seedream OR)
    │     └─ Catalog only → reuse openrouter-* profile
    │
    ├─ xAI (Grok image / video)
    │     └─ Catalog only → reuse xai-image or xai-video profile + pricing
    │
    ├─ Evolink image (Seedream, Z Image Turbo, …)
    │     ├─ Seedream 4.5 / 5 Lite (T2I or edit)? → catalog only → reuse evolink-image or evolink-edit
    │     │     (override `evolink.apiModel` and `ui.resolution` on the model entry when quality tiers differ)
    │     └─ New API family (e.g. Z Image Turbo)? → new profile + branch in api/providers/evolink.js
    │
    └─ Evolink video (Seedance 2.0 T2V / I2V, …)
          ├─ Same Seedance contract? → catalog only → reuse evolink-video-seedance2-t2v / -i2v
          └─ New video API family? → new evolink-video profile + branch in api/providers/evolink-video.js
```

**Catalog-only** means: edit `shared/model-catalog.json` only, then test.

**Provider work** means: also touch `api/providers/evolink.js` or `api/providers/evolink-video.js` when the new API needs logic that no existing variant covers.

---

## Catalog structure

### Top-level keys

| Key | Purpose |
| --- | --- |
| `defaultModelId` | Fallback when an unknown model id is requested |
| `defaults.animateModelId` | Model used by the Animate action (an image-to-video model) |
| `picker.hiddenApiKeys` | API keys whose models are hidden from the picker (currently empty) |
| `legacyRedirects` | Map old ids → current ids (aliases, renamed/removed endpoints) |
| `capabilityProfiles` | Reusable capability + UI + backend config |
| `models` | One entry per selectable model |

### Model entry fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Exact provider model id (Evolink/OpenRouter slug, etc.) |
| `name` | yes | Display name in the picker |
| `provider` | yes | Brand shown in the picker (e.g. `"Bytedance"`, `"Google"`) |
| `type` | yes | `"image"`, `"edit"`, `"text-to-video"`, or `"image-to-video"` |
| `tier` | yes | `"fast"`, `"balanced"`, or `"quality"` (sort hint) |
| `profile` | yes | Key into `capabilityProfiles` |
| `via` | no | Badge in picker: `"OpenRouter"`, `"Evolink"` |
| `evolink` | no | Overrides profile's `evolink` block (`apiModel`, `variant`, etc.) |
| `capabilities` | no | Deep-merge overrides (e.g. `{ "ui": { "resolution": { "options": ["2K","3K"] } } }`) |
| `pricing` | no | Per-model pricing for spend tracker (see below) |

After adding a model, it appears automatically in the picker (filtered by `type` tab). No HTML or hardcoded list changes.

---

## Capability profiles

Profiles define **backend**, **API key**, **UI controls**, and **input rules**.

### Common `ui` flags

| Flag | Effect |
| --- | --- |
| `aspectRatio: true` | Show aspect ratio dropdown |
| `resolution: { options, default }` | Show resolution dropdown (Gemini, Evolink Seedream, xAI) |
| `videoLength: { min, max, default }` | Video duration slider/input |
| `videoQuality: { options, default }` | Video resolution dropdown |
| `generateAudio: true` | Toggle for video audio (Seedance) |
| `webSearch: true` | Web-search toggle (Seedream 5 Lite, Seedance 2.0 T2V) |
| `imageToVideoHint: true` | Hint that attachments are used as start/end frames |

### Input rules

```json
"input": { "maxImages": 3, "required": false }
```

- `type: "edit"` or `image-to-video` profiles set `"required": true`.
- Override per model with `"capabilities": { "input": { "maxImages": 10 } }`.

### Existing profiles (reuse before creating new)

| Profile | Backend | Use for |
| --- | --- | --- |
| `openrouter-image` | openrouter | Generic OR image models |
| `openrouter-seedream` | openrouter | Seedream via OpenRouter |
| `openrouter-gemini` | openrouter | Gemini with resolution |
| `xai-image` | xai | Grok image |
| `xai-video` | xai | Grok video (async, text-to-video) |
| `evolink-image` / `evolink-edit` | evolink | Evolink Seedream (4.5 default; override `apiModel` / resolution per model) |
| `evolink-z-image` | evolink | Evolink Z Image Turbo (aspect ratio only, async) |
| `evolink-video-seedance2-i2v` | evolink-video | Seedance 2.0 image-to-video (async, 1–2 frames) |
| `evolink-video-seedance2-t2v` | evolink-video | Seedance 2.0 text-to-video (async, web search) |

---

## Examples

### 1. OpenRouter image (catalog only)

Copy an existing entry and change `id`, `name`, and `profile` if needed:

```json
{
  "id": "openai/gpt-5-image-mini",
  "name": "GPT-5 Image Mini",
  "provider": "OpenAI",
  "type": "image",
  "tier": "fast",
  "profile": "openrouter-image"
}
```

Gemini models use `"profile": "openrouter-gemini"` for aspect ratio + 1K/2K/4K resolution.

### 2. Evolink Seedream — same family, different API model (catalog only)

Seedream 5 Lite reuses the Seedream profiles but overrides the API model and resolution options:

```json
{
  "id": "evolink/doubao-seedream-5.0-lite",
  "name": "Seedream 5 Lite",
  "provider": "Bytedance",
  "type": "image",
  "tier": "fast",
  "via": "Evolink",
  "profile": "evolink-image",
  "evolink": { "variant": "seedream", "apiModel": "doubao-seedream-5.0-lite" },
  "capabilities": { "ui": { "resolution": { "options": ["2K", "3K"], "default": "3K" }, "webSearch": true } }
}
```

Use `"profile": "evolink-edit"` and the same overrides for an edit entry. The provider maps `ui.resolution.options` to Evolink `quality` (`2K`/`4K` for 4.5, `2K`/`3K` for 5 Lite).

### 3. Evolink Z Image Turbo (catalog + provider variant)

Z Image Turbo uses a dedicated profile and async task polling (no batch `n`, no resolution control):

```json
{
  "id": "evolink/z-image-turbo",
  "name": "Z Image Turbo",
  "provider": "Tongyi",
  "type": "image",
  "tier": "fast",
  "via": "Evolink",
  "profile": "evolink-z-image",
  "pricing": { "price": { "type": "flat", "amount": 0.004 } }
}
```

If a new Evolink image endpoint needs different payload fields or aspect-ratio handling, add a branch in `api/providers/evolink.js` keyed by `evolink.variant` from `getEvolinkConfig()`.

### 4. Evolink video — Seedance 2.0 (catalog only)

Text-to-video and image-to-video share the `evolink-video` backend and `/v1/videos/generations` endpoint, but use separate profiles. The handler in `api/providers/evolink-video.js` branches on the model `type`:

```json
{
  "id": "evolink/seedance-2.0/text-to-video",
  "name": "Seedance 2.0",
  "provider": "Bytedance",
  "type": "text-to-video",
  "tier": "quality",
  "via": "Evolink",
  "profile": "evolink-video-seedance2-t2v"
}
```

```json
{
  "id": "evolink/seedance-2.0/image-to-video",
  "name": "Seedance 2.0",
  "provider": "Bytedance",
  "type": "image-to-video",
  "tier": "quality",
  "via": "Evolink",
  "profile": "evolink-video-seedance2-i2v"
}
```

- **Image-to-video** requires 1–2 attached frames (first frame, optional last frame); the handler uploads them via the Evolink files API and sends `image_urls`.
- **Text-to-video** takes no images and sends `model_params: { web_search: true }` when the web-search toggle is on.
- Both are **async**: generate returns `202 { request_id, provider: "evolink" }`, and the client polls `/api/video-status?provider=evolink` (Evolink task status `GET /v1/tasks/{task_id}`).

### 5. Legacy redirect (alias)

When an old client uses a different id string, or a removed model should map to its replacement:

```json
"legacyRedirects": {
  "grok-imagine-image-pro": "grok-imagine-image-quality",
  "fal-ai/bytedance/seedance-2.0/image-to-video": "evolink/seedance-2.0/image-to-video",
  "bytedance/seedance-2.0/image-to-video": "evolink/seedance-2.0/image-to-video"
}
```

---

## Pricing (spend tracker)

Pricing is optional but recommended. Shapes used today:

```json
// Flat per image (Evolink)
"pricing": { "price": { "type": "flat", "amount": 0.04 } }

// xAI image
"pricing": { "perImageOutput": 0.02, "inputImageCost": 0.002 }

// Per-second video (xAI video, and Evolink video when rates are known)
"pricing": { "perSecondOutput": 0.05, "inputImageCost": 0.002 }
"pricing": { "pricePerSecond": 0.05 }
```

Notes:

- Image spend is recorded from each provider's per-image cost (Evolink/xAI) or live OpenRouter usage.
- **Video spend is not recorded** — async video responses carry no usage records, so `estimated_cost` is informational only. Evolink Seedance video has no per-second rate wired yet (`estimated_cost` is `0`); add `pricePerSecond` to the profile/model `pricing` to populate it.
- OpenRouter models often rely on live usage from the API response instead of catalog pricing.

---

## Testing

```bash
npm test
```

| Test file | What it catches |
| --- | --- |
| `tests/catalog-integrity.test.js` | Model counts, backend/type counts, legacy redirects, edit-model input requirements, no-fal guard |
| `tests/model-catalog.test.js` | Routing, redirects, Evolink config resolution |
| `tests/evolink-payload.test.js` | Evolink Seedream and Z Image Turbo payload shape |
| `tests/generate-routing.test.js` | Input image validation, provider resolution |
| `tests/ui-capabilities.test.js` | Settings panel flags per profile, picker visibility |

After tests pass, manually verify:

- [ ] Model appears in picker (correct tab: Image / Edit / Video)
- [ ] Settings panel shows only the controls that profile allows
- [ ] Generate succeeds with the correct API key type (OpenRouter / xAI / Evolink)
- [ ] Edit / I2V models reject generation with no attachments
- [ ] Video models poll to completion and play inline
- [ ] Spend pill updates (if pricing is configured)

Use `npx vercel dev` when testing API routes with serverless behavior.

---

## Conventions

- **Copy similar models** — match an existing entry's profile and variant before inventing a new pattern.
- **No scattered id checks** — do not add `if (model === 'evolink/...')` in `generate.js`; use catalog profiles and provider modules.
- **Catalog drives everything** — picker, settings UI, routing, and pricing all read from `shared/model-catalog.json`.

---

## Files touched (typical vs advanced)

| Change | Files |
| --- | --- |
| Most models | `shared/model-catalog.json` only |
| New Evolink image API family | + `api/providers/evolink.js`, `tests/evolink-payload.test.js` |
| New Evolink video API family | + `api/providers/evolink-video.js`, pricing in catalog |
| Legacy alias | `legacyRedirects` in catalog |
| New provider entirely | New file under `api/providers/`, route in `api/generate.js`, mirror in `api/model-catalog.js`, video polling branch in `api/video-status.js` |

---

## Related docs

- [AGENTS.md](../AGENTS.md) — agent checklist and architecture notes
- [README.md](../README.md) — user-facing overview
- [plan.md](../plan.md) — refactor history (not a living how-to)
