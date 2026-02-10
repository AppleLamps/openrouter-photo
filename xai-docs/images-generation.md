#### Model Capabilities

# Image Generation

Generate images from text prompts, edit existing images with natural language, or iteratively refine images through multi-turn conversations. The API supports batch generation of multiple images, and control over aspect ratio and resolution.

## Quick Start

Generate an image with a single API call:

Images are returned as URLs by default. URLs are temporary, so download or process promptly. You can also request [base64 output](#base64-output) for embedding images directly.

## Image Editing

Edit an existing image by providing a source image along with your prompt. The model understands the image content and applies your requested changes.

The OpenAI SDK's `images.edit()` method is not supported for image editing because it uses `multipart/form-data`, while the xAI API requires `application/json`. Use the xAI SDK, Vercel AI SDK, or direct HTTP requests instead.

With the xAI SDK, use the same `sample()` method — just add the `image_url` parameter:

You can provide the source image as:

* A **public URL** pointing to an image
* A **base64-encoded data URI** (e.g., `data:image/jpeg;base64,...`)

## Multi-Turn Editing

Chain multiple edits together by using each output as the input for the next. This enables iterative refinement — start with a base image and progressively add details, adjust styles, or make corrections.

## Style Transfer

The `grok-imagine-image` model excels across a wide range of visual styles — from ultra-realistic photography to anime, oil paintings, pencil sketches, and beyond. Transform existing images by simply describing the desired aesthetic in your prompt.

## Concurrent Requests

When you need to generate multiple images with **different prompts** — such as applying various style transfers to the same source image, or generating unrelated images in parallel — use `AsyncClient` with `asyncio.gather` to fire requests concurrently. This is significantly faster than issuing them one at a time.

If you want multiple variations from the **same prompt**, use [`sample_batch()` with the `n` parameter](#multiple-images) instead. That generates all images in a single request and is the most efficient approach for same-prompt generation.

## Configuration

### Multiple Images

Generate multiple images in a single request using the `sample_batch()` method and the `n` parameter. This returns a list of `ImageResponse` objects.

### Aspect Ratio

Control image dimensions with the `aspect_ratio` parameter:

| Ratio | Use case |
|-------|----------|
| `1:1` | Social media, thumbnails |
| `16:9` / `9:16` | Widescreen, mobile, stories |
| `4:3` / `3:4` | Presentations, portraits |
| `3:2` / `2:3` | Photography |
| `2:1` / `1:2` | Banners, headers |
| `19.5:9` / `9:19.5` | Modern smartphone displays |
| `20:9` / `9:20` | Ultra-wide displays |
| `auto` | Model auto-selects the best ratio for the prompt |

### Base64 Output

For embedding images directly without downloading, request base64:

### Response Details

The xAI SDK exposes additional metadata on the response object beyond the image URL or base64 data.

**Moderation** — Check whether the generated image passed content moderation:

**Model** — Get the actual model used (resolving any aliases):

## Pricing

Image generation uses flat per-image pricing rather than token-based pricing like text models. Each generated image incurs a fixed fee regardless of prompt length.

For image editing, you are charged for both the input image and the generated output image.

For full pricing details on the `grok-imagine-image` model, see the [model page](/developers/models/grok-imagine-image).

## Limitations

* **Maximum images per request:** 10
* **URL expiration:** Generated URLs are temporary
* **Content moderation:** Images are subject to content policy review

## Related

* [Models](/developers/models) — Available image models
* [Video Generation](/developers/model-capabilities/video/generation) — Animate generated images
* [API Reference](/developers/api-reference) — Full endpoint documentation
