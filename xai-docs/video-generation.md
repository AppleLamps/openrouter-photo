#### Model Capabilities

# Video Generation

All video generation/edit requests are deferred requests, where a user sends a video generation/edit request, get a response with a request ID, and retrieve the video result later using the request ID.
If you're using our SDK, it can handle the polling of the result automatically.

## Generate/Edit a Video with Automatic Polling

For easiness of use, our SDK can automatically send the video generation/edit request, and poll for the response until the result is available, or if the request has failed.

Generate a video directly from a text prompt:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.generate(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
)
print(f"Video URL: {response.url}")
```

Generate a video from a user-provided image:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.generate(
    prompt="Generate a video based on the provided image.",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    image_url=<url of the image>,
)
print(f"Video URL: {response.url}")
```

Edit an existing video:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.generate(
    prompt="Make the ball larger.",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    video_url=<url of the video to edit>,
)
print(f"Video URL: {response.url}")
```

## Send a Video Generation Request

If you do not want to use our SDK, or prefer to send a request and retrieve the result yourself, you can still send a regular video generation request. This will return a `response_id` which you can use to retrieve the generated video later.

### Video Generation from Text

Send a request to start generating a video from a text prompt.

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.start(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
)
print(f"Request ID: {response.request_id}")
```

```javascriptWithoutSDK
const response = await fetch('https://api.x.ai/v1/videos/generations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
  body: JSON.stringify({
    prompt: 'A cat playing with a ball',
    model: '{{LATEST_VIDEO_MODEL_NAME}}',
  }),
});
const data = await response.json();
console.log('Request ID:', data.request_id);
```

```bash
curl -X 'POST' https://api.x.ai/v1/videos/generations \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
      "prompt": "A cat playing with a ball",
      "model": "{{LATEST_VIDEO_MODEL_NAME}}"
  }'
```

The response includes a `request_id`, which you'll use to retrieve the generated video result.

```bash
{"request_id":"aa87081b-1a29-d8a6-e5bf-5807e3a7a561"}
```

### Video Generation from Image

You can also generate a video from an existing image.

To generate from an image:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.start(
    prompt="Generate a video based on the provided image.",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    image_url=<url of the image>,
)
print(f"Request ID: {response.request_id}")
```

```javascriptWithoutSDK
const response = await fetch('https://api.x.ai/v1/videos/generations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
  body: JSON.stringify({
    prompt: 'Generate a video based on the provided image.',
    model: '{{LATEST_VIDEO_MODEL_NAME}}',
    image: { url: '<url of the image>' },
  }),
});
const data = await response.json();
console.log('Request ID:', data.request_id);
```

```bash
curl -X 'POST' https://api.x.ai/v1/videos/generations \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
      "prompt": "Generate a video based on the provided image.",
      "model": "{{LATEST_VIDEO_MODEL_NAME}}",
      "image": {"url": "<url of the image>"}
  }'
```

### Edit a Video

Provide an input video (via a publicly accessible URL) and a prompt describing the desired changes. The API will generate a new edited video based on your instructions.

**Note:** The input video URL must be a direct, publicly accessible link to the video file. The maximum supported video length is 8.7 seconds.

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.start(
    prompt="Make the ball in the video larger.",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    video_url=<url of the previous video>,
)
print(f"Request ID: {response.request_id}")
```

```javascriptWithoutSDK
const response = await fetch('https://api.x.ai/v1/videos/edits', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
  body: JSON.stringify({
    prompt: 'Make the ball in the video larger.',
    video: { url: '<url of the previous video>' },
    model: '{{LATEST_VIDEO_MODEL_NAME}}',
  }),
});
const data = await response.json();
console.log('Request ID:', data.request_id);
```

```bash
curl -X 'POST' https://api.x.ai/v1/videos/edits \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
      "prompt": "Make the ball in the video larger.",
      "video": {"url": "<url of the previous video>"},
      "model": "{{LATEST_VIDEO_MODEL_NAME}}"
  }'
```

You will receive a `request_id` in the response body, which you can use to retrieve the edit generation result.

```bash
{"request_id":"a3d1008e-4544-40d4-d075-11527e794e4a"}
```

## Retrieving Video Generation/Edit Results

After making a video generation or edit requests and receiving the video generation `request_id`, you can retrieve
the results using the `request_id`.

```pythonXAI
# After sending the generation request and getting the request_id.

response = client.video.get(request_id)
print(f"Video URL: {response.url}")
```

```javascriptWithoutSDK
// After sending the generation request and getting the request_id.
const requestId = 'aa87081b-1a29-d8a6-e5bf-5807e3a7a561';

const response = await fetch(\`https://api.x.ai/v1/videos/\${requestId}\`, {
  headers: {
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
});
const data = await response.json();
console.log('Video URL:', data.url);
```

```bash
curl -X 'GET' https://api.x.ai/v1/videos/{request_id} \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>'
```

## Specifying Video Output Format

### Video Duration

You can specify the duration of the generated video in seconds. The allowed range is between 1 and 15 seconds.

Video editing doesn't support user-defined `duration`. The edited video will have the same duration of the original video.

Using xAI SDK auto-polling:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.generate(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    duration=10
)
print(f"Video URL: {response.url}")
print(f"Duration: {response.duration}")
```

Sending normal generation request:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.start(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    duration=10
)
print(f"Request ID: {response.request_id}")
```

```javascriptWithoutSDK
const response = await fetch('https://api.x.ai/v1/videos/generations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
  body: JSON.stringify({
    prompt: 'A cat playing with a ball',
    model: '{{LATEST_VIDEO_MODEL_NAME}}',
    duration: 10,
  }),
});
const data = await response.json();
console.log('Request ID:', data.request_id);
```

```bash
curl -X 'POST' https://api.x.ai/v1/videos/generations \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
      "prompt": "A cat playing with a ball",
      "model": "{{LATEST_VIDEO_MODEL_NAME}}",
      "duration": 10
  }'
```

### Aspect Ratio

You can specify the aspect ratio of the video. The default aspect ratio is 16:9.

The following aspect ratios are supported:

* 16:9
* 4:3
* 1:1
* 9:16
* 3:4
* 3:2
* 2:3

Using xAI SDK auto-polling:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.generate(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    aspect_ratio="4:3"
)
print(f"Video URL: {response.url}")
```

Sending regular generation request:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.start(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    aspect_ratio="4:3"
)
print(f"Request ID: {response.request_id}")
```

```javascriptWithoutSDK
const response = await fetch('https://api.x.ai/v1/videos/generations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
  body: JSON.stringify({
    prompt: 'A cat playing with a ball',
    model: '{{LATEST_VIDEO_MODEL_NAME}}',
    aspect_ratio: '4:3',
  }),
});
const data = await response.json();
console.log('Request ID:', data.request_id);
```

```bash
curl -X 'POST' https://api.x.ai/v1/videos/generations \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
      "prompt": "A cat playing with a ball",
      "model": "{{LATEST_VIDEO_MODEL_NAME}}",
      "aspect_ratio": "4:3"
  }'
```

### Resolution

You can select a resolution from a list of supported resolutions.

Supported resolutions:

* 720p
* 480p

Using xAI SDK auto-polling:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.generate(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    resolution="720p"
)
print(f"Video URL: {response.url}")
```

Sending regular generation request:

```pythonXAI
from xai_sdk import Client

client = Client()

response = client.video.start(
    prompt="A cat playing with a ball",
    model="{{LATEST_VIDEO_MODEL_NAME}}",
    resolution="720p"
)
print(f"Request ID: {response.request_id}")
```

```javascriptWithoutSDK
const response = await fetch('https://api.x.ai/v1/videos/generations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.XAI_API_KEY}\`,
  },
  body: JSON.stringify({
    prompt: 'A cat playing with a ball',
    model: '{{LATEST_VIDEO_MODEL_NAME}}',
    resolution: '720p',
  }),
});
const data = await response.json();
console.log('Request ID:', data.request_id);
```

```bash
curl -X 'POST' https://api.x.ai/v1/videos/generations \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer <API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
      "prompt": "A cat playing with a ball",
      "model": "{{LATEST_VIDEO_MODEL_NAME}}",
      "resolution": "720p"
  }'
```