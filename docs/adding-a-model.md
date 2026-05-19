# Adding a model

All models are defined in **`shared/model-catalog.json`**. That file is the single source of truth for:

- Model picker entries (name, provider, type, tier)
- Backend routing (`openrouter`, `xai`, `fal-image`, `fal-video`, `evolink`)
- Settings panel visibility (aspect ratio, resolution, video length, etc.)
- Input image requirements and limits
- Spend-tracker pricing hints

You do **not** edit `js/models.js`, `index.html` model lists, or `api/generate.js` for a typical add. The frontend reads the catalog via `js/model-capabilities.js`; the backend mirrors it in `api/model-catalog.js`.

---

## Quick checklist

1. Find the closest existing model in `shared/model-catalog.json` and copy its pattern.
2. Add a row to the `models` array (and a new `capabilityProfiles` entry only if no profile fits).
3. For Fal image models with a new API shape, add or reuse a `falImageVariants` entry.
4. For Fal video models with a new payload family, you may need a new `falVideo.variant` branch in `api/providers/fal-video.js`.
5. Run `npm test`.
6. Manual smoke: pick the model in the UI, confirm settings panels, generate once.

---

## Decision tree

```
New model
    │
    ├─ OpenRouter (FLUX, Gemini, GPT-5, Seedream OR)
    │     └─ Catalog only → reuse openrouter-* profile
    │
    ├─ xAI (Grok image / video)
    │     └─ Catalog only → reuse xai-image or xai-video profile + pricing
    │
    ├─ Evolink (Seedream)
    │     └─ Catalog only → reuse evolink-image or evolink-edit profile
    │
    ├─ Fal text-to-image or edit
    │     ├─ Same payload as an existing variant? → catalog only (set falImage.variant)
    │     └─ New payload fields / different aspect handling? → new falImageVariants entry
    │           (+ maybe extend buildFalImagePayload switch in api/providers/fal-image.js)
    │
    └─ Fal video (T2V / I2V)
          ├─ seedance15 / seedance20 / pixverse / happyHorse / flashhead family?
          │     └─ Catalog only → reuse matching fal-video-* profile
          └─ New video API family? → new profile + falVideo.variant + fal-video.js handler branch
```

**Catalog-only** means: edit `shared/model-catalog.json` only, then test.

**Provider work** means: also touch `api/providers/fal-image.js` or `api/providers/fal-video.js` when the new API needs logic that no existing variant covers.

---

## Catalog structure

### Top-level keys

| Key | Purpose |
|-----|---------|
| `defaultModelId` | Fallback when an unknown model id is requested |
| `defaults.animateModelId` | Default for the Animate action |
| `legacyRedirects` | Map old ids → current ids (aliases, renamed endpoints) |
| `capabilityProfiles` | Reusable capability + UI + backend config |
| `falImageVariants` | Static Fal image payload defaults keyed by variant name |
| `models` | One entry per selectable model |

### Model entry fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Exact provider model id (Fal path, OpenRouter slug, etc.) |
| `name` | yes | Display name in the picker |
| `provider` | yes | Brand shown in the picker (e.g. `"Bytedance"`, `"Google"`) |
| `type` | yes | `"image"`, `"edit"`, `"text-to-video"`, or `"image-to-video"` |
| `tier` | yes | `"fast"`, `"balanced"`, or `"quality"` (sort hint) |
| `profile` | yes | Key into `capabilityProfiles` |
| `via` | no | Badge in picker: `"fal"`, `"OpenRouter"`, `"Evolink"` |
| `falImage` | no | Overrides profile's `falImage` (variant, `usesPresetImageSize`, `asyncQueue`) |
| `capabilities` | no | Deep-merge overrides (e.g. `{ "input": { "maxImages": 10 } }`) |
| `pricing` | no | Per-model pricing for spend tracker (see below) |

After adding a model, it appears automatically in the picker (filtered by `type` tab). No HTML or hardcoded list changes.

---

## Capability profiles

Profiles define **backend**, **API key**, **UI controls**, and **input rules**.

### Common `ui` flags

| Flag | Effect |
|------|--------|
| `aspectRatio: true` | Show aspect ratio dropdown |
| `resolution: { options, default }` | Show resolution dropdown (Gemini, Phota, xAI) |
| `videoLength: { min, max, default }` | Video duration slider/input |
| `videoQuality: { options, default }` | Video resolution dropdown |
| `generateAudio: true` | Toggle for PixVerse-style audio |
| `imageToVideoHint: true` | Hint that attachments are used as frames |
| `flashhead: true` | FlashHead-specific voice/stability controls |

### Input rules

```json
"input": { "maxImages": 3, "required": false }
```

- `type: "edit"` or `image-to-video` profiles usually set `"required": true`.
- Override per model with `"capabilities": { "input": { "maxImages": 10 } }`.

### Existing profiles (reuse before creating new)

| Profile | Backend | Use for |
|---------|---------|---------|
| `openrouter-image` | openrouter | Generic OR image models |
| `openrouter-seedream` | openrouter | Seedream via OpenRouter |
| `openrouter-gemini` | openrouter | Gemini with resolution |
| `xai-image` | xai | Grok image |
| `xai-video` | xai | Grok video (async) |
| `fal-image` | fal-image | Fal T2I (default `seedream-default` variant) |
| `fal-edit` | fal-edit | Fal edit models |
| `evolink-image` / `evolink-edit` | evolink | Evolink Seedream |
| `fal-video-seedance15-t2v` / `-i2v` | fal-video | Seedance 1.5 |
| `fal-video-seedance20-t2v` / `-i2v` | fal-video | Seedance 2.0 |
| `fal-video-pixverse` | fal-video | PixVerse C1 I2V |
| `fal-video-happyhorse` | fal-video | Happy Horse multi-ref I2V |
| `fal-video-flashhead` | fal-video | FlashHead |

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

### 2. Fal image — existing variant (catalog only)

Wan and Seedream Fal endpoints share the default variant:

```json
{
  "id": "fal-ai/wan/v2.7/text-to-image",
  "name": "Wan 2.7",
  "provider": "Wan",
  "type": "image",
  "tier": "balanced",
  "via": "fal",
  "profile": "fal-image",
  "pricing": { "price": { "type": "flat", "amount": 0.04 } }
}
```

The `fal-image` profile already sets `falImage.variant: "seedream-default"`.

### 3. Fal image — different variant (catalog only)

Z-Image uses a dedicated variant with preset `image_size` and 8 steps:

```json
{
  "id": "fal-ai/z-image/turbo/lora",
  "name": "Z-Image Turbo",
  "provider": "Tongyi",
  "type": "image",
  "tier": "fast",
  "via": "fal",
  "profile": "fal-image",
  "falImage": { "variant": "z-image", "usesPresetImageSize": true },
  "pricing": { "price": { "type": "mpix", "amount": 0.0085 } }
}
```

Set `usesPresetImageSize: true` when the API expects Fal preset strings (`landscape_16_9`, etc.) rather than raw aspect ratio.

### 4. Fal edit (catalog only)

Same as Fal image but `type: "edit"` and `profile: "fal-edit"` (requires attachments):

```json
{
  "id": "fal-ai/wan/v2.7/edit",
  "name": "Wan 2.7 Edit",
  "provider": "Wan",
  "type": "edit",
  "tier": "balanced",
  "via": "fal",
  "profile": "fal-edit",
  "pricing": { "price": { "type": "flat", "amount": 0.04 } }
}
```

### 5. Fal video — Seedance (catalog only)

Text-to-video and image-to-video use separate profiles:

```json
{
  "id": "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
  "name": "Seedance 1.5 Pro",
  "provider": "Bytedance",
  "type": "text-to-video",
  "tier": "quality",
  "via": "fal",
  "profile": "fal-video-seedance15-t2v",
  "pricing": {
    "pricePerSecond": { "480p": 0.0241, "720p": 0.0518, "1080p": 0.1166 }
  }
}
```

Video models are **async**: the client polls `/api/video-status` after generate returns a `request_id`.

### 6. Legacy redirect (alias)

When Fal or an old client uses a different id string:

```json
"legacyRedirects": {
  "grok-imagine-image-pro": "grok-imagine-image-quality",
  "fal-ai/bytedance/seedance-2.0/text-to-video": "bytedance/seedance-2.0/text-to-video"
}
```

---

## Fal image variants

Registered in `falImageVariants`. Each model points at one via `falImage.variant` (on the profile or model override).

| Variant | Typical models | Notes |
|---------|----------------|-------|
| `seedream-default` | Wan, Seedream Fal | Generic sync; dual safety checkers off |
| `z-image` | Z-Image Turbo | 8 steps, preset sizes |
| `nucleus` | Nucleus | Uses `aspect_ratio`, not `image_size` |
| `phota` | Phota, Phota Edit | Queue polling when `asyncQueue: true` |
| `ernie` / `ernie-turbo` | Ernie LoRA | Preset sizes |
| `ovis`, `glm`, `bitdance` | Various | Preset sizes |
| `flux-klein-edit` | Flux 2 Klein edit | Edit + loras |
| `flux-pro` | Flux 1.1 Pro | `safety_tolerance` instead of checker |
| `qwen-max` | Qwen-Image Max | Prompt truncated to 800 chars |

### Adding a new variant

1. Add an entry under `falImageVariants` with `payloadDefaults` matching the Fal API schema.
2. Set `"enable_safety_checker": false` (and `"enable_output_safety_checker": false` when the schema supports it).
3. Point the model at it: `"falImage": { "variant": "your-variant" }`.
4. If aspect ratio or field mapping differs from existing cases, add a `case` in `buildFalImagePayload()` inside `api/providers/fal-image.js`.
5. Add a snapshot test in `tests/fal-payload.test.js`.

---

## Pricing (spend tracker)

Pricing is optional but recommended. Shapes used today:

```json
// Flat per image
"pricing": { "price": { "type": "flat", "amount": 0.04 } }

// Per megapixel
"pricing": { "price": { "type": "mpix", "amount": 0.0085 } }

// Resolution-based (Phota edit)
"pricing": { "price": { "type": "resolution", "oneK": 0.09, "fourK": 0.18 } }

// xAI image
"pricing": { "perImageOutput": 0.02, "inputImageCost": 0.002 }

// xAI video (per second)
"pricing": { "perSecondOutput": 0.05, "inputImageCost": 0.002 }

// Fal video (per second by resolution)
"pricing": { "pricePerSecond": { "720p": 0.0518, "1080p": 0.1166 } }
```

For Fal video, put `pricePerSecond` on the **profile** (or model `pricing`) and ensure every resolution exposed in `ui.videoQuality.options` has a rate — otherwise cost shows as `$0`.

OpenRouter models often rely on live usage from the API response instead of catalog pricing.

---

## Fal video variants

Video payload logic lives in `api/providers/fal-video.js`. Catalog `falVideo.variant` selects the branch:

| Variant | Profile example |
|---------|-----------------|
| `seedance15` | `fal-video-seedance15-t2v` / `-i2v` |
| `seedance20` | `fal-video-seedance20-t2v` / `-i2v` |
| `pixverse` | `fal-video-pixverse` |
| `happyHorse` | `fal-video-happyhorse` |
| `flashhead` | `fal-video-flashhead` |

A new Fal video **family** needs a new variant string, profile, pricing table, and a handler branch in `fal-video.js`.

---

## Testing

```bash
npm test
```

| Test file | What it catches |
|-----------|-----------------|
| `tests/catalog-integrity.test.js` | Duplicate ids, orphan variants, payload build for every Fal image model |
| `tests/model-catalog.test.js` | Routing, redirects, Fal config resolution |
| `tests/fal-payload.test.js` | Payload shape per Fal image variant |
| `tests/generate-routing.test.js` | Input image validation, provider resolution |
| `tests/ui-capabilities.test.js` | Settings panel flags per profile |

After tests pass, manually verify:

- [ ] Model appears in picker (correct tab: Image / Edit / Video)
- [ ] Settings panel shows only the controls that profile allows
- [ ] Generate succeeds with the correct API key type (OpenRouter / Fal / xAI / Evolink)
- [ ] Edit / I2V models reject generation with no attachments
- [ ] Spend pill updates (if pricing is configured)

Use `npx vercel dev` when testing API routes with serverless behavior.

---

## Conventions

- **Add only** — do not remove existing models or change defaults (`defaultModelId`, shortcuts, empty-state copy) unless explicitly asked.
- **Copy similar models** — match an existing entry's profile and variant before inventing a new pattern.
- **Safety off for Fal** — disable checkers in `payloadDefaults`; match each endpoint's schema (some only expose `enable_safety_checker`).
- **No scattered id checks** — do not add `if (model === 'fal-ai/...')` in `generate.js`; use catalog profiles and provider modules.
- **Provider API docs** — Fal reference dumps live in `api-docs/` and model-specific folders (e.g. `wan-models/`).

---

## Files touched (typical vs advanced)

| Change | Files |
|--------|-------|
| Most models | `shared/model-catalog.json` only |
| New Fal image variant | + `api/providers/fal-image.js`, `tests/fal-payload.test.js` |
| New Fal video family | + `api/providers/fal-video.js`, pricing in catalog |
| Legacy alias | `legacyRedirects` in catalog |
| New provider entirely | New file under `api/providers/`, route in `api/generate.js`, mirror in `api/model-catalog.js` |

---

## Related docs

- [AGENTS.md](../AGENTS.md) — agent checklist and architecture notes
- [README.md](../README.md) — user-facing overview
- [plan.md](../plan.md) — refactor history (not a living how-to)
