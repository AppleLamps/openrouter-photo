#### Model Capabilities

# Video Generation

Generate videos from text prompts, animate still images, or edit existing videos with natural language. The API supports configurable duration, aspect ratio, and resolution for generated videos — with the SDK handling the asynchronous polling automatically.

## Quick Start

Generate a video with a single API call:

Video generation is an **asynchronous process** that typically takes up to several minutes to complete. The exact time varies based on:

* **Prompt complexity** — More detailed scenes require additional processing
* **Duration** — Longer videos take more time to generate
* **Resolution** — Higher resolutions (720p vs 480p) increase processing time
* **Video editing** — Editing existing videos adds overhead compared to image-to-video or text-to-video

### How it works

Under the hood, video generation is a two-step process:

1. **Start** — Submit a generation request and receive a `request_id`
2. **Poll** — Repeatedly check the status using the `request_id` until the video is ready

The xAI SDK's `generate()` method abstracts this entirely — it submits your request, polls for the result, and returns the completed video response. You don't need to manage request IDs or implement polling logic. For long-running generations, you can [customize the polling behavior](#customize-polling-behavior) with timeout and interval parameters, or [handle polling manually](#handle-polling-manually) for full control over the generation lifecycle.

**REST API users** must implement this two-step flow manually:

**Step 1: Start the generation request**

Response:

**Step 2: Poll for the result**

Use the `request_id` to check the status. Keep polling every few seconds until the video is ready:

The response includes a `status` field with one of these values:

| Status | Description |
|--------|-------------|
| `pending` | Video is still being generated |
| `done` | Video is ready |
| `expired` | Request has expired |

Response (when complete):

Videos are returned as temporary URLs — download or process them promptly.

## Generate Videos from Images

Transform a still image into a video by providing a source image along with your prompt. The model animates the image content based on your instructions.

You can provide the source image as:

* A **public URL** pointing to an image
* A **base64-encoded data URI** (e.g., `data:image/jpeg;base64,...`)

The demo below shows this in action — hold to animate a still image:

## Edit Existing Videos

Edit an existing video by providing a source video along with your prompt. The model understands the video content and applies your requested changes.

The demo below shows video editing in action — `grok-imagine-video` delivers high-fidelity edits with strong scene preservation, modifying only what you ask for while keeping the rest of the video intact:

## Concurrent Requests

When you need to generate multiple videos or apply several edits to the same source video, use `AsyncClient` with `asyncio.gather` to fire requests concurrently. Since video generation and editing are long-running processes, running requests in parallel is significantly faster than issuing them sequentially.

The example below applies all three edits from the interactive demo above — adding a necklace, changing the outfit color, and adding a hat — concurrently:

## Configuration

The video generation API lets you control the output format of your generated videos. You can specify the duration, aspect ratio, and resolution to match your specific use case.

### Duration

Control video length with the `duration` parameter. The allowed range is 1–15 seconds.

Video editing does not support custom `duration`. The edited video retains the duration of the original, which is capped at 8.7 seconds.

### Aspect Ratio

| Ratio | Use case |
|-------|----------|
| `1:1` | Social media, thumbnails |
| `16:9` / `9:16` | Widescreen, mobile, stories (default: `16:9`) |
| `4:3` / `3:4` | Presentations, portraits |
| `3:2` / `2:3` | Photography |

For image-to-video generation, the output defaults to the input image's aspect ratio. If you specify the `aspect_ratio` parameter, it will override this and stretch the image to the desired aspect ratio.

Video editing does not support custom `aspect_ratio` — the output matches the input video's aspect ratio.

### Resolution

| Resolution | Description |
|------------|-------------|
| `720p` | HD quality |
| `480p` | Standard definition, faster processing (default) |

Video editing does not support custom `resolution`. The output resolution matches the input video's resolution, capped at 720p (e.g., a 1080p input will be downsized to 720p).

### Example

## Customize Polling Behavior

When using the SDK's `generate()` method, you can control how long to wait and how frequently to check for results using the `timeout` and `interval` parameters:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `timeout` | Maximum time to wait for the video to complete | 10 minutes |
| `interval` | Time between status checks | 100 milliseconds |

If the video isn't ready within the timeout period, a `TimeoutError` is raised. For even finer control, use the [manual polling approach](#handle-polling-manually) with `start()` and `get()`.

## Handle Polling Manually

For fine-grained control over the generation lifecycle, use `start()` to initiate generation and `get()` to check status.

The `get()` method returns a response with a `status` field. Import the status enum from the SDK:

The available status values are:

| Proto Value | Description |
|-------------|-------------|
| `deferred_pb2.DeferredStatus.PENDING` | Video is still being generated |
| `deferred_pb2.DeferredStatus.DONE` | Video is ready |
| `deferred_pb2.DeferredStatus.EXPIRED` | Request has expired |

## Response Details

The xAI SDK exposes additional metadata on the response object beyond the video URL.

**Moderation** — Check whether the generated video passed content moderation:

**Duration** — Get the actual duration of the generated video:

**Model** — Get the actual model used (resolving any aliases):

## Pricing

Video generation uses per-second pricing. Longer videos cost more, and both duration and resolution affect the total cost.

For full pricing details on the `grok-imagine-video` model, see the [model page](/developers/models).

## Limitations

* **Maximum duration:** 15 seconds for generation, 8.7 seconds for editing input videos
* **URL expiration:** Generated URLs are ephemeral and should not be relied upon for long-term storage
* **Resolutions:** 480p or 720p
* **Content moderation:** Videos are subject to content policy review

## Related

* [Models](/developers/models) — Available video models and pricing
* [Image Generation](/developers/model-capabilities/images/generation) — Generate still images from text
* [API Reference](/developers/api-reference) — Full endpoint documentation
