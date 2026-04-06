[Run models all in one Sandbox 🏖️](https://fal.ai/sandbox)

[Docs](https://docs.fal.ai/)

[Log-in](https://fal.ai/login?returnTo=/models/fal-ai/wan/v2.7/pro/edit/api) [Sign-up](https://fal.ai/login?returnTo=/models/fal-ai/wan/v2.7/pro/edit/api)

[Docs](https://docs.fal.ai/)

[Log-in](https://fal.ai/login?returnTo=/models/fal-ai/wan/v2.7/pro/edit/api) [Sign-up](https://fal.ai/login?returnTo=/models/fal-ai/wan/v2.7/pro/edit/api)

# fal-ai/wan/v2.7/pro/edit

WAN 2.7 Pro Edit

Edit and transform images using text instructions with the WAN 2.7 Pro model for precise, professional-grade image modifications.

Inference

Commercial use

Partner

[Schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.7/pro/edit)

[LLMs](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/llms.txt)

[Playground](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/playground) [API](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api) [Examples](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/examples)

### Table of contents

JavaScript / Node.js

[**1\. Calling the API**](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#api-call)

- [Install the client](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#api-call-install)
- [Setup your API Key](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#api-call-setup)
- [Submit a request](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#api-call-submit-request)

[**2\. Authentication**](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#auth)

- [API Key](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#auth-api-key)

[**3\. Queue**](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#queue)

- [Submit a request](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#queue-submit)
- [Fetch request status](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#queue-status)
- [Get the result](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#queue-result)

[**4\. Files**](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#files)

- [Data URI (base64)](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#files-data-uri)
- [Hosted files (URL)](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#files-from-url)
- [Uploading files](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#files-upload)

[**5\. Schema**](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#schema)

- [Input](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#schema-input)
- [Output](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#schema-output)
- [Other](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#schema-other)

### About

Pro Image Edit

### 1\. Calling the API [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#api-call-install)

### Install the client [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#api-call-install)

The client provides a convenient way to interact with the model API.

npmyarnpnpmbun

```
npm install --save @fal-ai/client
```

##### Migrate to @fal-ai/client

The `@fal-ai/serverless-client` package has been deprecated in favor of `@fal-ai/client`. Please check the [migration guide](https://docs.fal.ai/clients/javascript#migration-from-serverless-client-to-client) for more information.

### Setup your API Key [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#api-call-setup)

Set `FAL_KEY` as an environment variable in your runtime.

```
export FAL_KEY="YOUR_API_KEY"
```

### Submit a request [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#api-call-submit-request)

The client API handles the API submit protocol. It will handle the request status updates and return the result when the request is completed.

```
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/wan/v2.7/pro/edit", {
  input: {
    prompt: "Turn image 1 into a watercolor painting.",
    image_urls: ["https://storage.googleapis.com/falserverless/model_tests/wan/dragon-warrior.jpg"]
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

## 2\. Authentication [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#auth)

The API uses an API Key for authentication. It is recommended you set the `FAL_KEY` environment variable in your runtime when possible.

### API Key [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#auth-api-key)

In case your app is running in an environment where you cannot set environment variables, you can set the API Key manually as a client configuration.

```
import { fal } from "@fal-ai/client";

fal.config({
  credentials: "YOUR_FAL_KEY"
});
```

##### Protect your API Key

When running code on the client-side (e.g. in a browser, mobile app or GUI applications), make sure to not expose your `FAL_KEY`. Instead, **use a server-side proxy** to make requests to the API. For more information, check out our [server-side integration guide](https://docs.fal.ai/model-endpoints/server-side).

## 3\. Queue [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#queue)

##### Long-running requests

For long-running requests, such as _training_ jobs or models with slower inference times, it is recommended to check the [Queue](https://docs.fal.ai/model-endpoints/queue) status and rely on [Webhooks](https://docs.fal.ai/model-endpoints/webhooks) instead of blocking while waiting for the result.

### Submit a request [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#queue-submit)

The client API provides a convenient way to submit requests to the model.

```
import { fal } from "@fal-ai/client";

const { request_id } = await fal.queue.submit("fal-ai/wan/v2.7/pro/edit", {
  input: {
    prompt: "Turn image 1 into a watercolor painting.",
    image_urls: ["https://storage.googleapis.com/falserverless/model_tests/wan/dragon-warrior.jpg"]
  },
  webhookUrl: "https://optional.webhook.url/for/results",
});
```

### Fetch request status [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#queue-status)

You can fetch the status of a request to check if it is completed or still in progress.

```
import { fal } from "@fal-ai/client";

const status = await fal.queue.status("fal-ai/wan/v2.7/pro/edit", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b",
  logs: true,
});
```

### Get the result [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#queue-result)

Once the request is completed, you can fetch the result. See the [Output Schema](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api#schema-output) for the expected result format.

```
import { fal } from "@fal-ai/client";

const result = await fal.queue.result("fal-ai/wan/v2.7/pro/edit", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b"
});
console.log(result.data);
console.log(result.requestId);
```

## 4\. Files [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#files)

Some attributes in the API accept file URLs as input. Whenever that's the case you can pass your own URL or a Base64 data URI.

### Data URI (base64) [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#files-data-uri)

You can pass a Base64 data URI as a file input. The API will handle the file decoding for you. Keep in mind that for large files, this alternative although convenient can impact the request performance.

### Hosted files (URL) [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#files-from-url)

You can also pass your own URLs as long as they are publicly accessible. Be aware that some hosts might block cross-site requests, rate-limit, or consider the request as a bot.

### Uploading files [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#files-upload)

We provide a convenient file storage that allows you to upload files and use them in your requests. You can upload files using the client API and use the returned URL in your requests.

```
import { fal } from "@fal-ai/client";

const file = new File(["Hello, World!"], "hello.txt", { type: "text/plain" });
const url = await fal.storage.upload(file);
```

##### Auto uploads

The client will auto-upload the file for you if you pass a binary object (e.g. `File`, `Data`).

Read more about file handling in our [file upload guide](https://docs.fal.ai/model-endpoints#file-uploads).

## 5\. Schema [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#schema)

### Input [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#schema-input)

`prompt``string`\\* required

Text prompt describing the desired image edit. Supports Chinese and English.

`image_urls``list<string>`\\* required

Reference images for editing (1-4 images required). Order matters: reference them as image 1, image 2, image 3, image 4 in the prompt.

`negative_prompt``string`

Content to avoid in the generated image. Max 500 characters. Default value: `""`

`image_size``ImageSize | Enum`

Output image size. Uses fal image size presets or explicit dimensions and is converted to DashScope size format. Default value: `square_hd`

Possible enum values:`square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`

**Note:** For custom image sizes, you can pass the `width` and `height` as an object:

```
"image_size": {
  "width": 1280,
  "height": 720
}
```

`num_images``integer`

Number of images to generate (1-4). Default value: `1`

`enable_prompt_expansion``boolean`

Enable DashScope prompt expansion. Supported only for image edit mode. Default value: `true`

`seed``integer`

Random seed for reproducibility (0-2147483647).

`enable_safety_checker``boolean`

Enable content moderation for input and output. Default value: `true`

```
{
  "prompt": "Turn image 1 into a watercolor painting.",
  "image_urls": [\
    "https://storage.googleapis.com/falserverless/model_tests/wan/dragon-warrior.jpg"\
  ],
  "image_size": "square_hd",
  "num_images": 1,
  "enable_prompt_expansion": true,
  "enable_safety_checker": true
}
```

### Output [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#schema-output)

`images``list<File>`\\* required

Generated images.

`seed``integer`\\* required

The seed used for generation.

```
{
  "images": [\
    {\
      "url": "",\
      "content_type": "image/png",\
      "file_name": "z9RV14K95DvU.png",\
      "file_size": 4404019\
    }\
  ]
}
```

### Other types [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#schema-other)

#### WanSmallT2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallT2VRequest)

`prompt``string`\\* required

The text prompt to guide video generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `24`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (580p or 720p). Default value: `"720p"`

Possible enum values:`580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video (16:9 or 9:16). Default value: `"16:9"`

Possible enum values:`16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `40`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4.

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

#### WanLoRAT2IRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanLoRAT2IRequest)

`prompt``string`\\* required

The text prompt to guide image generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Shift value for the image. Must be between 1.0 and 10.0. Default value: `2`

`loras``list<LoRAWeight>`

LoRA weights to be used in the inference.

`reverse_video``boolean`

If true, the video will be reversed.

`image_size``ImageSize | Enum`

The size of the generated image. Default value: `square_hd`

Possible enum values:`square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`

**Note:** For custom image sizes, you can pass the `width` and `height` as an object:

```
"image_size": {
  "width": 1280,
  "height": 720
}
```

`image_format``ImageFormatEnum`

The format of the output image. Default value: `"jpeg"`

Possible enum values:`png, jpeg`

#### WanAnimateReplaceResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanAnimateReplaceResponse)

`video``File`\\* required

The generated video file.

`frames_zip``File`

ZIP archive of generated frames (if requested).

`prompt``string`\\* required

The prompt used for generation (auto-generated by the model)

`seed``integer`\\* required

The seed used for generation

#### WanSmallT2IRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallT2IRequest)

`prompt``string`\\* required

The text prompt to guide image generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `40`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`shift``float`

Shift value for the image. Must be between 1.0 and 10.0. Default value: `2`

`image_size``ImageSize | Enum`

The size of the generated image. Default value: `square_hd`

Possible enum values:`square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`

**Note:** For custom image sizes, you can pass the `width` and `height` as an object:

```
"image_size": {
  "width": 1280,
  "height": 720
}
```

`image_format``ImageFormatEnum`

The format of the output image. Default value: `"jpeg"`

Possible enum values:`png, jpeg`

#### WanLoRAT2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanLoRAT2VRequest)

`prompt``string`\\* required

The text prompt to guide video generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `16`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video (16:9 or 9:16). Default value: `"16:9"`

Possible enum values:`16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4. Default value: `1`

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`loras``list<LoRAWeight>`

LoRA weights to be used in the inference.

`reverse_video``boolean`

If true, the video will be reversed.

#### File [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-File)

`url``string`\\* required

The URL where the file can be downloaded from.

`content_type``string`

The mime type of the file.

`file_name``string`

The name of the file. It will be auto-generated if not provided.

`file_size``integer`

The size of the file in bytes.

#### WanSmallFastVideoT2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallFastVideoT2VRequest)

`prompt``string`\\* required

The text prompt to guide video generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `24`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (580p or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video (16:9 or 9:16). Default value: `"16:9"`

Possible enum values:`16:9, 9:16, 1:1`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4.

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

#### WanSmallFastVideoT2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallFastVideoT2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanS2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanS2VRequest)

`prompt``string`\\* required

The text prompt used for video generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`num_frames``integer`

Number of frames to generate. Must be between 40 to 120, (must be multiple of 4). Default value: `80`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `16`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"480p"`

Possible enum values:`480p, 580p, 720p`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`image_url``string`\\* required

URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped.

`audio_url``string`\\* required

The URL of the audio file.

#### WanI2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanI2VRequest)

`image_url``string`\\* required

URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped.

`prompt``string`\\* required

The text prompt to guide video generation.

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `16`

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image. Default value: `"auto"`

Possible enum values:`auto, 16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `3.5`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4. Default value: `1`

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`end_image_url``string`

URL of the end image.

#### WanTurboI2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanTurboI2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanSmallT2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallT2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanTurboT2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanTurboT2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanT2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanT2VRequest)

`prompt``string`\\* required

The text prompt to guide video generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `16`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video (16:9 or 9:16). Default value: `"16:9"`

Possible enum values:`16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4. Default value: `1`

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

#### WanV2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanV2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanLoRAI2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanLoRAI2VRequest)

`image_url``string`\\* required

URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped.

`prompt``string`\\* required

The text prompt to guide video generation.

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `16`

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image. Default value: `"auto"`

Possible enum values:`auto, 16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4. Default value: `1`

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`loras``list<LoRAWeight>`

LoRA weights to be used in the inference.

`reverse_video``boolean`

If true, the video will be reversed.

`end_image_url``string`

URL of the end image.

#### WanV2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanV2VRequest)

`video_url``string`\\* required

URL of the input video.

`prompt``string`\\* required

The text prompt to guide video generation.

`strength``float`

Strength of the video transformation. A value of 1.0 means the output will be completely based on the prompt, while a value of 0.0 means the output will be identical to the input video. Default value: `0.9`

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `16`

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input video. Default value: `"auto"`

Possible enum values:`auto, 16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4. Default value: `1`

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`resample_fps``boolean`

If true, the video will be resampled to the passed frames per second. If false, the video will not be resampled.

#### WanAnimateMoveResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanAnimateMoveResponse)

`video``File`\\* required

The generated video file.

`frames_zip``File`

ZIP archive of generated frames (if requested).

`prompt``string`\\* required

The prompt used for generation (auto-generated by the model)

`seed``integer`\\* required

The seed used for generation

#### LoRAWeight [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-LoRAWeight)

`path``string`\\* required

URL or the path to the LoRA weights.

`weight_name``string`

Name of the LoRA weight. Used only if `path` is a Hugging Face repository, and required only if you have more than 1 safetensors file in the repo.

`scale``float`

The scale of the LoRA weight. This is used to scale the LoRA weight
before merging it with the base model. Default value: `1`

`transformer``TransformerEnum`

Specifies the transformer to load the lora weight into. 'high' loads into the high-noise transformer, 'low' loads it into the low-noise transformer, while 'both' loads the LoRA into both transformers. Default value: `"high"`

Possible enum values:`high, low, both`

#### WanI2IRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanI2IRequest)

`image_url``string`\\* required

URL of the input image.

`prompt``string`\\* required

The text prompt to guide image generation.

`strength``float`

Denoising strength. 1.0 = fully remake; 0.0 = preserve original. Default value: `0.5`

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated image. If 'auto', the aspect ratio will be determined automatically based on the input image. Default value: `"auto"`

Possible enum values:`auto, 16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Default value: `2`

`image_size``ImageSize | Enum`

Possible enum values:`square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`

**Note:** For custom image sizes, you can pass the `width` and `height` as an object:

```
"image_size": {
  "width": 1280,
  "height": 720
}
```

`image_format``ImageFormatEnum`

The format of the output image. Default value: `"jpeg"`

Possible enum values:`png, jpeg`

#### WanI2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanI2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanS2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanS2VResponse)

`video``File`\\* required

The generated video file.

#### WanT2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanT2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanI2IResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanI2IResponse)

`image``File`\\* required

The generated image file.

`prompt``string`

The text prompt used for image generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanTurboI2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanTurboI2VRequest)

`image_url``string`\\* required

URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped.

`prompt``string`\\* required

The text prompt to guide video generation.

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image. Default value: `"auto"`

Possible enum values:`auto, 16:9, 9:16, 1:1`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`end_image_url``string`

URL of the end image.

#### WanSmallI2VResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallI2VResponse)

`video``File`\\* required

The generated video file.

`prompt``string`

The text prompt used for video generation. Default value: `""`

`seed``integer`\\* required

The seed used for generation.

#### WanT2IRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanT2IRequest)

`prompt``string`\\* required

The text prompt to guide image generation.

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `27`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`guidance_scale_2``float`

Guidance scale for the second stage of the model. This is used to control the adherence to the prompt in the second stage of the model. Default value: `4`

`shift``float`

Shift value for the image. Must be between 1.0 and 10.0. Default value: `2`

`image_size``ImageSize | Enum`

The size of the generated image. Default value: `square_hd`

Possible enum values:`square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9`

**Note:** For custom image sizes, you can pass the `width` and `height` as an object:

```
"image_size": {
  "width": 1280,
  "height": 720
}
```

#### WanT2IResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanT2IResponse)

`image``File`\\* required

The generated image file.

`seed``integer`\\* required

The seed used for generation.

#### WanAnimateMoveRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanAnimateMoveRequest)

`video_url``string`\\* required

URL of the input video.

`image_url``string`\\* required

URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `1`

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"480p"`

Possible enum values:`480p, 580p, 720p`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `20`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

`return_frames_zip``boolean`

If true, also return a ZIP archive containing per-frame images generated on GPU (lossless).

`use_turbo``boolean`

If true, applies quality enhancement for faster generation with improved quality. When enabled, parameters are automatically optimized for best results.

#### WanSmallI2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallI2VRequest)

`image_url``string`\\* required

URL of the input image. If the input image does not match the chosen aspect ratio, it is resized and center cropped.

`prompt``string`\\* required

The text prompt to guide video generation.

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `24`

`negative_prompt``string`

Negative prompt for video generation. Default value: `""`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (580p or 720p). Default value: `"720p"`

Possible enum values:`580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video. If 'auto', the aspect ratio will be determined automatically based on the input image. Default value: `"auto"`

Possible enum values:`auto, 16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `40`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `3.5`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4.

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

#### WanSmallT2IResponse [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanSmallT2IResponse)

`image``File`\\* required

The generated image file.

`seed``integer`\\* required

The seed used for generation.

#### WanTurboT2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanTurboT2VRequest)

`prompt``string`\\* required

The text prompt to guide video generation.

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (480p, 580p, or 720p). Default value: `"720p"`

Possible enum values:`480p, 580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video (16:9 or 9:16). Default value: `"16:9"`

Possible enum values:`16:9, 9:16, 1:1`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`acceleration``AccelerationEnum`

Acceleration level to use. The more acceleration, the faster the generation, but with lower quality. The recommended value is 'regular'. Default value: `"regular"`

Possible enum values:`none, regular`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

#### ImageSize [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-ImageSize)

`width``integer`

The width of the generated image. Default value: `512`

`height``integer`

The height of the generated image. Default value: `512`

#### WanDistillT2VRequest [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-WanDistillT2VRequest)

`prompt``string`\\* required

The text prompt to guide video generation.

`num_frames``integer`

Number of frames to generate. Must be between 17 to 161 (inclusive). Default value: `81`

`frames_per_second``integer`

Frames per second of the generated video. Must be between 4 to 60. When using interpolation and `adjust_fps_for_interpolation` is set to true (default true,) the final FPS will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If `adjust_fps_for_interpolation` is set to false, this value will be used as-is. Default value: `24`

`seed``integer`

Random seed for reproducibility. If None, a random seed is chosen.

`resolution``ResolutionEnum`

Resolution of the generated video (580p or 720p). Default value: `"720p"`

Possible enum values:`580p, 720p`

`aspect_ratio``AspectRatioEnum`

Aspect ratio of the generated video (16:9 or 9:16). Default value: `"16:9"`

Possible enum values:`16:9, 9:16, 1:1`

`num_inference_steps``integer`

Number of inference steps for sampling. Higher values give better quality but take longer. Default value: `40`

`enable_safety_checker``boolean`

If set to true, input data will be checked for safety before processing.

`enable_output_safety_checker``boolean`

If set to true, output video will be checked for safety after generation.

`enable_prompt_expansion``boolean`

Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning.

`guidance_scale``float`

Classifier-free guidance scale. Higher values give better adherence to the prompt but may decrease quality. Default value: `1`

`shift``float`

Shift value for the video. Must be between 1.0 and 10.0. Default value: `5`

`interpolator_model``InterpolatorModelEnum`

The model to use for frame interpolation. If None, no interpolation is applied. Default value: `"film"`

Possible enum values:`none, film, rife`

`num_interpolated_frames``integer`

Number of frames to interpolate between each pair of generated frames. Must be between 0 and 4.

`adjust_fps_for_interpolation``boolean`

If true, the number of frames per second will be multiplied by the number of interpolated frames plus one. For example, if the generated frames per second is 16 and the number of interpolated frames is 1, the final frames per second will be 32. If false, the passed frames per second will be used as-is. Default value: `true`

`video_quality``VideoQualityEnum`

The quality of the output video. Higher quality means better visual quality but larger file size. Default value: `"high"`

Possible enum values:`low, medium, high, maximum`

`video_write_mode``VideoWriteModeEnum`

The write mode of the output video. Faster write mode means faster results but larger file size, balanced write mode is a good compromise between speed and quality, and small write mode is the slowest but produces the smallest file size. Default value: `"balanced"`

Possible enum values:`fast, balanced, small`

#### VideoFile [\#](https://fal.ai/models/fal-ai/wan/v2.7/pro/edit/api\#type-VideoFile)

`url``string`\\* required

The URL where the file can be downloaded from.

`content_type``string`

The mime type of the file.

`file_name``string`

The name of the file. It will be auto-generated if not provided.

`file_size``integer`

The size of the file in bytes.

`width``integer`

The width of the video

`height``integer`

The height of the video

`fps``float`

The FPS of the video

`duration``float`

The duration of the video

`num_frames``integer`

The number of frames in the video

## Related Models