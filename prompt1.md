Implement Fal Seedream integration for these 4 models in this repo:

- fal-ai/bytedance/seedream/v4.5/text-to-image
- fal-ai/bytedance/seedream/v4.5/edit
- fal-ai/bytedance/seedream/v5/lite/text-to-image
- fal-ai/bytedance/seedream/v5/lite/edit

Constraints:

- Keep architecture consistent with the existing OpenRouter and xAI approach.
- Browser stores user key in localStorage and sends it as a request header to backend.
- Backend must proxy Fal requests so secrets are not exposed in frontend code.
- Preserve existing OpenRouter and xAI behavior exactly.
- Keep response shape compatible with the current generateImage flow.

Implement all of this:

1. Settings UI

- In index.html add a new Fal API Key settings group with:
  - input field id: setting-fal-key
  - show checkbox id: setting-fal-key-show
  - save button id: setting-fal-save
  - test button id: setting-fal-test
  - status span id: setting-fal-save-status
- Match existing styles and classes used by OpenRouter and xAI groups.

1. Frontend API client

- In js/api.js:
  - add localStorage key constant fal_api_key
  - add getter for Fal key
  - include X-FAL-Api-Key header in generate requests when key exists
  - add testFalKey function that calls a new backend endpoint /api/test-fal-key
  - throw code FAL_API_KEY_REQUIRED when missing for test
- Export testFalKey and wire imports where needed.

1. Settings behavior

- In js/app.js:
  - wire Fal key input load/save/show/test exactly like existing key flows
  - show success and error toasts consistent with existing behavior
  - add handling for FAL_API_KEY_REQUIRED in generation error path
  - add a missing-key popup helper for Fal (parallel to OpenRouter popup), or equivalent strong UX path

1. Backend middleware and CORS

- In api/_middleware.js include X-FAL-Api-Key in default Access-Control-Allow-Headers.
- In server.js local dev CORS middleware also allow X-FAL-Api-Key.

1. Fal key test endpoint

- Create api/test-fal-key.js following structure of test-key.js and test-xai-key.js.
- Read key from headers x-fal-api-key or x-fal-api_key or process.env.FAL_KEY.
- Return 401 with code FAL_API_KEY_REQUIRED when absent.
- Validate key with a lightweight Fal API call and return { ok: true } when valid.
- Register route in server.js: POST /api/test-fal-key.

1. Model picker

- In index.html model dropdown, add the 4 Fal model IDs as selectable options.
- Keep existing options unchanged.

1. Generation routing

- In api/generate.js:
  - detect Fal models by exact model IDs listed above
  - read Fal key from header or process.env.FAL_KEY
  - if Fal model selected and key missing, return 401 with code FAL_API_KEY_REQUIRED and help url <https://fal.ai/dashboard/keys>
  - for edit models, require image_urls non-empty; if missing return 400 with clear message
  - call Fal endpoint for selected model and pass supported inputs:
    - prompt, num_images, image_size (if provided), max_images (if provided), enable_safety_checker (if provided), image_urls for edit models
  - normalize Fal output to current response contract:
    {
      images: [{ url, model, cost, provider: "fal" }],
      meta: {
        total_usage: number,
        requests: [{ model, provider_name, usage, imageCount }],
        usage_pending: false
      }
    }
- If Fal does not return usage, set usage to 0 and usage_pending false.
- Do not break existing OpenRouter and xAI branches.

1. Model-specific settings logic

- In js/app.js update updateSettingsForModel and getGenerationSettings so Fal models have sane defaults.
- Ensure settings panel does not show misleading Gemini-only guidance for Fal.
- If no Fal-specific size UI is added, do not send invalid size values to Fal endpoints.

1. Validation and docs

- Update .env.example to include optional FAL_KEY and note it is fallback-only.
- Update README with Fal key setup and which models require Fal vs OpenRouter vs xAI.

1. Verify

- Run local manual checks:
  - OpenRouter model still works
  - xAI model still works
  - each Fal text-to-image model works
  - each Fal edit model enforces image input and works with attached images
  - Fal key test button works and errors cleanly on bad or missing key

Output required at end:

- concise change summary
- list of touched files
- follow-up recommendations if any
