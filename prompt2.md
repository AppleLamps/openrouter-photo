Implement Fal Seedream support in two phases for safer rollout.

Models to add:

- fal-ai/bytedance/seedream/v4.5/text-to-image
- fal-ai/bytedance/seedream/v4.5/edit
- fal-ai/bytedance/seedream/v5/lite/text-to-image
- fal-ai/bytedance/seedream/v5/lite/edit

Global requirements:

- Keep current OpenRouter and xAI behavior unchanged.
- Use server-side proxy for Fal requests.
- Store Fal key in browser localStorage and send via request header.
- Maintain current response shape consumed by frontend generate flow.

Phase 1: Key plumbing and UI only (no generation routing yet)

1. Add Fal API key settings UI in index.html

- Add fields:
  - setting-fal-key
  - setting-fal-key-show
  - setting-fal-save
  - setting-fal-test
  - setting-fal-save-status
- Match existing settings styles.

1. Add frontend key handling in js/api.js and js/app.js

- localStorage key: fal_api_key
- getter for Fal key
- testFalKey function calling /api/test-fal-key
- add X-FAL-Api-Key header on generate requests if key exists
- save, show, and test interactions with user feedback

1. Add backend test endpoint and CORS support

- Create api/test-fal-key.js
- Resolve key from header or process.env.FAL_KEY
- 401 with code FAL_API_KEY_REQUIRED when missing
- Validate with lightweight Fal API call
- Add route in server.js
- Add X-FAL-Api-Key to CORS allow headers in api/_middleware.js and server.js

1. Add model options in dropdown (index.html)

- Add all 4 Fal model ids to model menu only.
- Do not route them yet.

1. Phase 1 acceptance

- Existing models still generate correctly.
- Fal key can be saved and tested.
- Fal models appear in dropdown.
- Selecting Fal model may still fail generation (expected before Phase 2).

Stop after Phase 1 and provide:

- touched files
- short risk notes
- proposed Phase 2 diff plan

Phase 2: Generation routing and normalization

1. Add Fal routing in api/generate.js

- Detect selected Fal model by exact id.
- Require Fal key (header or env fallback).
- Return 401 FAL_API_KEY_REQUIRED with help url <https://fal.ai/dashboard/keys> when missing.
- For edit models, require image_urls and return 400 if absent.
- Call correct Fal endpoint per model.
- Pass supported inputs only:
  - prompt
  - num_images
  - image_size (if valid)
  - max_images (if provided)
  - enable_safety_checker (if provided)
  - image_urls for edit

1. Normalize Fal response to app format

- Return:
  - images array with url, model, provider: fal, and cost if available
  - meta with total_usage, requests, usage_pending
- If cost unavailable, use 0 and usage_pending false.

1. Frontend model-setting behavior

- Update updateSettingsForModel and getGenerationSettings in js/app.js for Fal defaults.
- Prevent sending invalid Gemini-only fields to Fal.
- Update help text where necessary to avoid misleading users.

1. Docs and env

- Update .env.example with optional FAL_KEY fallback note.
- Update README with provider/key matrix: OpenRouter vs xAI vs Fal.

1. Phase 2 acceptance

- Existing OpenRouter and xAI models still work.
- All 4 Fal models generate successfully.
- Fal edit models enforce attached image input.
- Spend tracker does not break when Fal usage is missing.

Final output format required:

- what changed
- file list
- manual test results
- known limitations
