[Seedance 2.0 by ByteDance is now live on fal! 🚀](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video)

# bytedance/seedance-2.0/image-to-video

Image to Video

ByteDance's most advanced video generation model. Cinematic output with native audio, real-world physics, and director-level camera control. Accepts text, image, audio, and video inputs.

### Table of contents

JavaScript / Node.js

[**1\. Calling the API**](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#api-call)

- [Install the client](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#api-call-install)
- [Setup your API Key](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#api-call-setup)
- [Submit a request](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#api-call-submit-request)

[**2\. Authentication**](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#auth)

- [API Key](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#auth-api-key)

[**3\. Queue**](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#queue)

- [Submit a request](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#queue-submit)
- [Fetch request status](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#queue-status)
- [Get the result](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#queue-result)

[**4\. Files**](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#files)

- [Data URI (base64)](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#files-data-uri)
- [Hosted files (URL)](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#files-from-url)
- [Uploading files](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#files-upload)

[**5\. Schema**](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#schema)

- [Input](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#schema-input)
- [Output](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#schema-output)
- [Other](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#schema-other)

### About

Image To Video

### 1\. Calling the API [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#api-call-install)

### Install the client [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#api-call-install)

The client provides a convenient way to interact with the model API.

npmyarnpnpmbun

```
npm install --save @fal-ai/client
```

##### Migrate to @fal-ai/client

The `@fal-ai/serverless-client` package has been deprecated in favor of `@fal-ai/client`. Please check the [migration guide](https://docs.fal.ai/clients/javascript#migration-from-serverless-client-to-client) for more information.

### Setup your API Key [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#api-call-setup)

Set `FAL_KEY` as an environment variable in your runtime.

```
export FAL_KEY="YOUR_API_KEY"
```

### Submit a request [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#api-call-submit-request)

The client API handles the API submit protocol. It will handle the request status updates and return the result when the request is completed.

```
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("bytedance/seedance-2.0/image-to-video", {
  input: {
    prompt: "An octopus finds a football in the ocean and excitedly calls its octopus friends to come and play. Cut scene to an octopus football game under the sea.",
    image_url: "https://v3b.fal.media/files/b/0a8eba37/Cqg-4Uwzyz4DELfceT1CF_a17e588773ec45b1a9e6f100a787b80b.jpg"
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});
console.log(result.data);
console.log(result.requestId);
```

## 2\. Authentication [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#auth)

The API uses an API Key for authentication. It is recommended you set the `FAL_KEY` environment variable in your runtime when possible.

### API Key [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#auth-api-key)

In case your app is running in an environment where you cannot set environment variables, you can set the API Key manually as a client configuration.

```
import { fal } from "@fal-ai/client";

fal.config({
  credentials: "YOUR_FAL_KEY"
});
```

##### Protect your API Key

When running code on the client-side (e.g. in a browser, mobile app or GUI applications), make sure to not expose your `FAL_KEY`. Instead, **use a server-side proxy** to make requests to the API. For more information, check out our [server-side integration guide](https://docs.fal.ai/model-endpoints/server-side).

## 3\. Queue [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#queue)

##### Long-running requests

For long-running requests, such as _training_ jobs or models with slower inference times, it is recommended to check the [Queue](https://docs.fal.ai/model-endpoints/queue) status and rely on [Webhooks](https://docs.fal.ai/model-endpoints/webhooks) instead of blocking while waiting for the result.

### Submit a request [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#queue-submit)

The client API provides a convenient way to submit requests to the model.

```
import { fal } from "@fal-ai/client";

const { request_id } = await fal.queue.submit("bytedance/seedance-2.0/image-to-video", {
  input: {
    prompt: "An octopus finds a football in the ocean and excitedly calls its octopus friends to come and play. Cut scene to an octopus football game under the sea.",
    image_url: "https://v3b.fal.media/files/b/0a8eba37/Cqg-4Uwzyz4DELfceT1CF_a17e588773ec45b1a9e6f100a787b80b.jpg"
  },
  webhookUrl: "https://optional.webhook.url/for/results",
});
```

### Fetch request status [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#queue-status)

You can fetch the status of a request to check if it is completed or still in progress.

```
import { fal } from "@fal-ai/client";

const status = await fal.queue.status("bytedance/seedance-2.0/image-to-video", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b",
  logs: true,
});
```

### Get the result [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#queue-result)

Once the request is completed, you can fetch the result. See the [Output Schema](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api#schema-output) for the expected result format.

```
import { fal } from "@fal-ai/client";

const result = await fal.queue.result("bytedance/seedance-2.0/image-to-video", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b"
});
console.log(result.data);
console.log(result.requestId);
```

## 4\. Files [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#files)

Some attributes in the API accept file URLs as input. Whenever that's the case you can pass your own URL or a Base64 data URI.

### Data URI (base64) [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#files-data-uri)

You can pass a Base64 data URI as a file input. The API will handle the file decoding for you. Keep in mind that for large files, this alternative although convenient can impact the request performance.

### Hosted files (URL) [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#files-from-url)

You can also pass your own URLs as long as they are publicly accessible. Be aware that some hosts might block cross-site requests, rate-limit, or consider the request as a bot.

### Uploading files [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#files-upload)

We provide a convenient file storage that allows you to upload files and use them in your requests. You can upload files using the client API and use the returned URL in your requests.

```
import { fal } from "@fal-ai/client";

const file = new File(["Hello, World!"], "hello.txt", { type: "text/plain" });
const url = await fal.storage.upload(file);
```

##### Auto uploads

The client will auto-upload the file for you if you pass a binary object (e.g. `File`, `Data`).

Read more about file handling in our [file upload guide](https://docs.fal.ai/model-endpoints#file-uploads).

## 5\. Schema [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#schema)

### Input [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#schema-input)

`prompt``string`\\* required

The text prompt describing the desired motion and action for the video.

`image_url``string`\\* required

The URL of the starting frame image to animate. Supported formats: JPEG, PNG, WebP. Max 30 MB.

`end_image_url``string`

The URL of the image to use as the last frame of the video. When provided, the generated video will transition from the starting image to this ending image. Supported formats: JPEG, PNG, WebP. Max 30 MB.

`resolution``ResolutionEnum`

Video resolution - 480p for faster generation, 720p for balance. Default value: `"720p"`

Possible enum values:`480p, 720p`

`duration``DurationEnum`

Duration of the video in seconds. Supports 4 to 15 seconds, or auto to let the model decide based on the prompt. Default value: `"auto"`

Possible enum values:`auto, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15`

`aspect_ratio``AspectRatioEnum`

The aspect ratio of the generated video. Use 16:9 for landscape, 9:16 for portrait/vertical, 1:1 for square, 21:9 for ultrawide cinematic, or auto to infer from the input image. Default value: `"auto"`

Possible enum values:`auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16`

`generate_audio``boolean`

Whether to generate synchronized audio for the video, including sound effects, ambient sounds, and lip-synced speech. The cost of video generation is the same regardless of whether audio is generated or not. Default value: `true`

`seed``integer`

Random seed for reproducibility. Note that results may still vary slightly even with the same seed.

`end_user_id``string`

The unique user ID of the end user.

```
{
  "prompt": "An octopus finds a football in the ocean and excitedly calls its octopus friends to come and play. Cut scene to an octopus football game under the sea.",
  "image_url": "https://v3b.fal.media/files/b/0a8eba37/Cqg-4Uwzyz4DELfceT1CF_a17e588773ec45b1a9e6f100a787b80b.jpg",
  "resolution": "720p",
  "duration": "auto",
  "aspect_ratio": "auto",
  "generate_audio": true
}
```

### Output [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#schema-output)

`video``File`\\* required

The generated video file.

`seed``integer`\\* required

The seed used for generation.

```
{
  "video": {
    "url": "https://storage.googleapis.com/falserverless/example_outputs/bytedance/seedance_2/output.mp4"
  },
  "seed": 42
}
```

### Other types [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#schema-other)

#### File [\#](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api\#type-File)

`url``string`\\* required

The URL where the file can be downloaded from.

`content_type``string`

The mime type of the file.

`file_name``string`

The name of the file. It will be auto-generated if not provided.

`file_size``integer`

The size of the file in bytes.

## Related Models
