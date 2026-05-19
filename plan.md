# Refactor plan — remaining work

This document picks up after the model catalog refactor (`shared/model-catalog.json`, provider modules, `settings-keys.js`, and `tests/model-catalog.test.js`). Work top-to-bottom; later steps assume earlier ones are done.

## Progress summary

| Phase | Status | Notes |
|-------|--------|-------|
| **1** Split `app.js` | **Done** | ~971 lines — orchestration + prompt/enhance/upload; no further splits unless a area grows |
| **2** Catalog Fal payloads | **Done** | 2.1–2.2 complete; 2.3 optional, skip unless a variant file gets unwieldy |
| **3** Expand tests | **Done** | 50 tests; CI workflow added |
| **4** Optional cleanups | **Mostly done** | 4.1 + 4.3 done; 4.2 only if actively working on gallery |

**New modules:** `js/spend-tracker.js`, `js/model-picker.js`, `js/generation-controller.js`, `api/generation-routing.js`

**Test files:** `tests/ui-capabilities.test.js`, `tests/generate-routing.test.js`, `tests/fal-payload.test.js`

**Removed:** `api/model-registry.js` (folded into `api/model-catalog.js`)

---

## Phase 1 — Split `app.js` ✅ Done

Goal: extract cohesive modules so `app.js` is mostly wiring (`init()`, event registration, cross-module coordination). **~971 lines is fine** — no arbitrary line-count target.

### Step 1.1 — Extract `js/spend-tracker.js` ✅ Done

**Acceptance:**
- [x] Spend tracker still updates on generation
- [x] Breakdown modal opens and shows per-model totals
- [x] No spend-related functions left in `app.js`

---

### Step 1.2 — Extract `js/model-picker.js` ✅ Done

**Acceptance:**
- [x] Model picker search/tabs still work
- [x] Changing model updates settings panel visibility from catalog
- [x] Folder + num-images dropdowns unchanged

---

### Step 1.3 — Extract `js/generation-controller.js` ✅ Done

**Acceptance:**
- [x] Generate / cancel / retry behave identically
- [x] Rapid-click guard still works
- [x] Video async polling still completes or times out
- [x] API key popups still show via `showApiKeyPopupForCode`

---

### Step 1.4 — Slim `app.js` to orchestration ✅ Done

**Still in `app.js` (by design):**
- `init()` wiring, remix/animate handlers, enhance/surprise-me, toasts, settings panel, image upload, storage indicator

**Acceptance:**
- [x] Major domains extracted to dedicated modules
- [x] `index.html` modulepreload updated
- [ ] Manual smoke test (see checklist below)

---

## Phase 2 — Catalog-driven Fal image payloads ✅ Done (2.1–2.2)

Goal: adding a Fal image model with an **existing** variant = JSON only; new API shapes = one registry entry in catalog, not scattered logic.

### Step 2.1 — Document variant registry ✅ Done

Comment block in `api/providers/fal-image.js` + `falImageVariants` in `shared/model-catalog.json`.

### Step 2.2 — Move static payload defaults to catalog ✅ Done

`falImageVariants.<variant>.payloadDefaults`; `getFalImageConfig()` merges defaults; `buildFalImagePayload()` uses them.

**Acceptance:**
- [x] Catalog tests pass
- [x] Fal payload snapshot tests cover all 12 variants

---

### Step 2.3 — Variant-specific builder files (optional) ⬜ Skip unless needed

Split `api/providers/fal-image/` into per-variant files only if the single module becomes hard to maintain. **Not worth doing preemptively.**

---

## Phase 3 — Expand tests ✅ Done

- [x] `tests/ui-capabilities.test.js`
- [x] `tests/generate-routing.test.js` + `api/generation-routing.js`
- [x] `tests/fal-payload.test.js`
- [x] `.github/workflows/test.yml`

**50 tests passing.**

---

## Phase 4 — Optional cleanups

### Step 4.1 — Fold `model-registry.js` into `model-catalog.js` ✅ Done

- [x] `getFalImageModel`, `getFalVideoModel`, `getFalImageCostPerImage` live in `api/model-catalog.js`
- [x] Imports updated in `fal-image.js`, `fal-video.js`, `video-status.js`
- [x] `api/model-registry.js` deleted

---

### Step 4.2 — Split `gallery.js` (~1,466 lines) ⬜ Defer

Only when actively changing gallery/lightbox behavior — not a line-count exercise.

| Module | Contents |
|--------|----------|
| `js/gallery-grid.js` | Card render, lazy load, placeholders |
| `js/gallery-lightbox.js` | Lightbox, swipe, navigation |
| `js/gallery-download.js` | ZIP download, batch export |

---

### Step 4.3 — Update `AGENTS.md` ✅ Done

“Adding a model” checklist in `AGENTS.md`.

---

## Status table

| Phase | Step | Status |
|-------|------|--------|
| 1 | 1.1–1.4 app.js split | ✅ |
| 2 | 2.1–2.2 catalog payloads | ✅ |
| 2 | 2.3 variant builder files | ⬜ skip unless needed |
| 3 | 3.1–3.4 tests + CI | ✅ |
| 4 | 4.1 model-registry fold | ✅ |
| 4 | 4.2 gallery split | ⬜ defer |
| 4 | 4.3 AGENTS.md | ✅ |

**Plan complete** except optional/deferred items and manual verification.

---

## Manual test checklist

- [ ] Pick OpenRouter model (Flux) → generate 2 images
- [ ] Pick Fal model (Z-Image) → generate with aspect ratio
- [ ] Pick Fal edit model → attach image → generate
- [ ] Pick video model (Seedance 2.0 I2V) → attach frame → generate → poll completes
- [ ] FlashHead → voice settings visible, generation works
- [ ] Settings → save/test each API key
- [ ] Spend tracker increments
- [x] `npm test` passes (50/50)
