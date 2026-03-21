[Run models all in one Sandbox 🏖️](https://fal.ai/sandbox)

[Docs](https://docs.fal.ai/)

[Log-in](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api) [Sign-up](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api)

[Docs](https://docs.fal.ai/)

[Log-in](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api) [Sign-up](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api)

# fal-ai/bytedance/seedream/v5/lite/text-to-image

Text to Image (Lite)

Text to Image endpoint for the fast Lite version of Seedream 5.0, supporting high quality intelligent text-to-image generation.

[Learn more about Seedream 5.0 Lite](https://fal.ai/seedream-5.0)

Inference

Commercial use

Partner

[Schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/bytedance/seedream/v5/lite/text-to-image)

[LLMs](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/llms.txt)

[Playground](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/playground) [API](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api) [Examples](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/examples)

### Table of contents

JavaScript / Node.js

[**1\. Calling the API**](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#api-call)

- [Install the client](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#api-call-install)
- [Setup your API Key](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#api-call-setup)
- [Submit a request](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#api-call-submit-request)

[**2\. Authentication**](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#auth)

- [API Key](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#auth-api-key)

[**3\. Queue**](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#queue)

- [Submit a request](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#queue-submit)
- [Fetch request status](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#queue-status)
- [Get the result](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#queue-result)

[**4\. Files**](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#files)

- [Data URI (base64)](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#files-data-uri)
- [Hosted files (URL)](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#files-from-url)
- [Uploading files](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#files-upload)

[**5\. Schema**](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#schema)

- [Input](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#schema-input)
- [Output](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#schema-output)
- [Other](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#schema-other)

### About

Generate images using Bytedance's Seedream 5.0 Lite model.

### 1\. Calling the API [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#api-call-install)

### Install the client [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#api-call-install)

The client provides a convenient way to interact with the model API.

npmyarnpnpmbun

```
npm install --save @fal-ai/client
```

##### Migrate to @fal-ai/client

The `@fal-ai/serverless-client` package has been deprecated in favor of `@fal-ai/client`. Please check the [migration guide](https://docs.fal.ai/clients/javascript#migration-from-serverless-client-to-client) for more information.

### Setup your API Key [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#api-call-setup)

Set `FAL_KEY` as an environment variable in your runtime.

```
export FAL_KEY="YOUR_API_KEY"
```

### Submit a request [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#api-call-submit-request)

The client API handles the API submit protocol. It will handle the request status updates and return the result when the request is completed.

```
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/bytedance/seedream/v5/lite/text-to-image", {
  input: {
    prompt: "Realistic DSLR photograph of anthropomorphic Penkingese dog enjoying a bowl of ramen on the Great Wall of China with the words \"Seedream 5.0 Lite available on fal\" visible at the top."
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

## 2\. Authentication [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#auth)

The API uses an API Key for authentication. It is recommended you set the `FAL_KEY` environment variable in your runtime when possible.

### API Key [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#auth-api-key)

In case your app is running in an environment where you cannot set environment variables, you can set the API Key manually as a client configuration.

```
import { fal } from "@fal-ai/client";

fal.config({
  credentials: "YOUR_FAL_KEY"
});
```

##### Protect your API Key

When running code on the client-side (e.g. in a browser, mobile app or GUI applications), make sure to not expose your `FAL_KEY`. Instead, **use a server-side proxy** to make requests to the API. For more information, check out our [server-side integration guide](https://docs.fal.ai/model-endpoints/server-side).

## 3\. Queue [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#queue)

##### Long-running requests

For long-running requests, such as _training_ jobs or models with slower inference times, it is recommended to check the [Queue](https://docs.fal.ai/model-endpoints/queue) status and rely on [Webhooks](https://docs.fal.ai/model-endpoints/webhooks) instead of blocking while waiting for the result.

### Submit a request [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#queue-submit)

The client API provides a convenient way to submit requests to the model.

```
import { fal } from "@fal-ai/client";

const { request_id } = await fal.queue.submit("fal-ai/bytedance/seedream/v5/lite/text-to-image", {
  input: {
    prompt: "Realistic DSLR photograph of anthropomorphic Penkingese dog enjoying a bowl of ramen on the Great Wall of China with the words \"Seedream 5.0 Lite available on fal\" visible at the top."
  },
  webhookUrl: "https://optional.webhook.url/for/results",
});
```

### Fetch request status [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#queue-status)

You can fetch the status of a request to check if it is completed or still in progress.

```
import { fal } from "@fal-ai/client";

const status = await fal.queue.status("fal-ai/bytedance/seedream/v5/lite/text-to-image", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b",
  logs: true,
});
```

### Get the result [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#queue-result)

Once the request is completed, you can fetch the result. See the [Output Schema](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api#schema-output) for the expected result format.

```
import { fal } from "@fal-ai/client";

const result = await fal.queue.result("fal-ai/bytedance/seedream/v5/lite/text-to-image", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b"
});
console.log(result.data);
console.log(result.requestId);
```

## 4\. Files [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#files)

Some attributes in the API accept file URLs as input. Whenever that's the case you can pass your own URL or a Base64 data URI.

### Data URI (base64) [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#files-data-uri)

You can pass a Base64 data URI as a file input. The API will handle the file decoding for you. Keep in mind that for large files, this alternative although convenient can impact the request performance.

### Hosted files (URL) [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#files-from-url)

You can also pass your own URLs as long as they are publicly accessible. Be aware that some hosts might block cross-site requests, rate-limit, or consider the request as a bot.

### Uploading files [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#files-upload)

We provide a convenient file storage that allows you to upload files and use them in your requests. You can upload files using the client API and use the returned URL in your requests.

```
import { fal } from "@fal-ai/client";

const file = new File(["Hello, World!"], "hello.txt", { type: "text/plain" });
const url = await fal.storage.upload(file);
```

##### Auto uploads

The client will auto-upload the file for you if you pass a binary object (e.g. `File`, `Data`).

Read more about file handling in our [file upload guide](https://docs.fal.ai/model-endpoints#file-uploads).

## 5\. Schema [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#schema)

### Input [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#schema-input)

`prompt``string`\\* required

The text prompt used to generate the image

`image_size``ImageSize | Enum`

The size of the generated image. Total pixels must be between 2560x1440 and 3072x3072. In case the image size does not fall within these parameters, the image size will be adjusted to by scaling. Default value: `auto_2K`

Possible enum values: `square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9, auto_2K, auto_3K`

**Note:** For custom image sizes, you can pass the `width` and `height` as an object:

```
"image_size": {
  "width": 1280,
  "height": 720
}
```

`num_images``integer`

Number of separate model generations to be run with the prompt. Default value: `1`

`max_images``integer`

If set to a number greater than one, enables multi-image generation. The model will potentially return up to `max_images` images every generation, and in total, `num_images` generations will be carried out. In total, the number of images generated will be between `num_images` and `max_images*num_images`. Default value: `1`

`sync_mode``boolean`

If `True`, the media will be returned as a data URI and the output data won't be available in the request history.

`enable_safety_checker``boolean`

If set to true, the safety checker will be enabled. Default value: `true`

```
{
  "prompt": "Realistic DSLR photograph of anthropomorphic Penkingese dog enjoying a bowl of ramen on the Great Wall of China with the words \"Seedream 5.0 Lite available on fal\" visible at the top.",
  "image_size": "auto_2K",
  "num_images": 1,
  "max_images": 1,
  "enable_safety_checker": true
}
```

### Output [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#schema-output)

`images``list<Image>`\\* required

Generated images

`seed``integer`\\* required

Seed used for generation.

```
{
  "images": [\
    {\
      "url": "https://v3b.fal.media/files/b/0a8fbf48/fv693UaOADKqnujJRZN90_4518fc5e1fed4fb29963b22a8cc3d5a6.png"\
    }\
  ],
  "seed": 42
}
```

### Other types [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#schema-other)

#### Image [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#type-Image)

`url``string`\\* required

The URL where the file can be downloaded from.

`content_type``string`

The mime type of the file.

`file_name``string`

The name of the file. It will be auto-generated if not provided.

`file_size``integer`

The size of the file in bytes.

`width``integer`

The width of the image in pixels.

`height``integer`

The height of the image in pixels.

#### File [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#type-File)

`url``string`\\* required

The URL where the file can be downloaded from.

`content_type``string`

The mime type of the file.

`file_name``string`

The name of the file. It will be auto-generated if not provided.

`file_size``integer`

The size of the file in bytes.

#### ImageSize [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#type-ImageSize)

`width``integer`

The width of the generated image. Default value: `512`

`height``integer`

The height of the generated image. Default value: `512`

#### Seed2MiniMessage [\#](https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image/api\#type-Seed2MiniMessage)

`role``RoleEnum`\\* required

The role of the message author.

Possible enum values: `system, user, assistant`

`content``string | list<object>`\\* required

The content of the message. Can be a string for text-only messages, or a list of content parts for multimodal messages (e.g. with images).

## Related Models