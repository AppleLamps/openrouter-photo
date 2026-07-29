# Evolink pricing reference

Rates the spend tracker uses for Evolink models, and where they come from.

**Verified: 2026-07-29** against the Evolink pricing changelog and the per-model route pages.
The corresponding values live in `shared/model-catalog.json`.

## Credits

Evolink bills in credits at a published rate of **1 credit ≈ $0.0147**
([evolink.ai/pricing](https://evolink.ai/pricing)). The rate is stored once, in
`providers.evolink.creditUsd`.

The API reports credits directly, and those figures are authoritative:

| Field | Where | Meaning |
| --- | --- | --- |
| `usage.credits_reserved` | task-create response | credits held for the task |
| `usage.credits_used` | completed task (`GET /v1/tasks/{id}`) | credits actually charged |

The app prefers `credits_used`, then `credits_reserved`, then the catalog rates below.

## Images (per generated image)

| Model | Catalog id | Price | Credits |
| --- | --- | --- | --- |
| Seedream 5.0 Pro — 1K | `evolink/doubao-seedream-5.0-pro` | $0.03375 | 2.295 |
| Seedream 5.0 Pro — 2K | `evolink/doubao-seedream-5.0-pro` | $0.0675 | 4.59 |
| Seedream 5.0 Pro — input image | `evolink/doubao-seedream-5.0-pro` | $0.00225 each | 0.153 |
| Seedream 5.0 Lite | `evolink/doubao-seedream-5.0-lite` | $0.028 | 1.904 |
| Seedream 4.5 | `evolink/doubao-seedream-4.5` (+ `/edit`) | $0.03 | 2.04 |
| Z Image Turbo | `evolink/z-image-turbo` | $0.0038 | 0.26 |

Source: [2026-07-26 pricing changelog](https://evolink.ai/changelog) (Seedream range),
[z-image-turbo route page](https://evolink.ai/z-image-turbo).

Notes:

- Seedream 5.0 Pro is the only model here with tiered output pricing *and* per-input-image
  billing — each reference image is charged on top of the output. When an exact `WxH` size is
  requested the `quality` field is omitted from the payload and Evolink derives the tier from the
  pixel count, so `resolveBilledQuality()` mirrors that (≥ 2,097,152 px bills as 2K).
- Every Evolink image task creates one image (`n: 1` per task), so per-task cost is per-image cost.

## Video (per second of output)

| Model | Catalog id | 480p | 720p | 1080p |
| --- | --- | --- | --- | --- |
| Seedance 2.0 (t2v / i2v) | `evolink/seedance-2.0/*` | $0.092 | $0.199 | $0.496 |
| HappyHorse 1.0 (i2v) | `evolink/happyhorse-1.0/image-to-video` | — | $0.1388 | $0.2468 |

Source: [Seedance 2.0 route page](https://evolink.ai/seedance-2-0),
[HappyHorse route page](https://evolink.ai/happy-horse).

Notes:

- Seedance 2.0 includes generated audio at no extra charge, so `generate_audio` does not affect cost.
- HappyHorse is priced in credits (9.4427 cr/s at 720p, 16.7892 cr/s at 1080p); the USD values
  above are those credits at the rate in `providers.evolink.creditUsd`.
- The catalog omits Seedance 2.0's 4K tier because the app's UI does not offer 4K. Add it to
  `pricing.pricePerSecond` if that changes — an unlisted resolution falls back to `defaultQuality`
  and would under-bill.

## Re-verifying

1. Check [evolink.ai/changelog](https://evolink.ai/changelog) for `pricing` entries newer than the
   date at the top of this file — price changes are announced there with an effective date.
2. Cross-check the per-model route page, which shows the live USD and credit figures.
3. Update `shared/model-catalog.json`, the table above, `providers.evolink.pricingVerifiedAt`, and
   the expected values in `tests/model-catalog.test.js`, `tests/evolink-payload.test.js` and
   `tests/evolink-cost.test.js`.

Marketing pages and blog posts lag the changelog and disagree with each other; prefer the
changelog and the route page.
