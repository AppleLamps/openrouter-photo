[Run models all in one Sandbox 🏖️](https://fal.ai/sandbox)

[Docs](https://docs.fal.ai/)

[Log-in](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v4.5/edit) [Sign-up](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v4.5/edit)

[Docs](https://docs.fal.ai/)

[Log-in](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v4.5/edit) [Sign-up](https://fal.ai/login?returnTo=/models/fal-ai/bytedance/seedream/v4.5/edit)

# fal-ai/bytedance/seedream/v4.5/edit

Image Editing

A new-generation image creation model ByteDance, Seedream 4.5 integrates image generation and image editing capabilities into a single, unified architecture.

Inference

Commercial use

Partner

[Schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/bytedance/seedream/v4.5/edit)

[LLMs](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit/llms.txt)

[Playground](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit/playground) [API](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit/api)

[Try in Sandbox](https://fal.ai/sandbox?models=d4o1984regj8iad9fb5g&op=image.edit_multi_images&prompt=Replace+the+product+in+Figure+1+with+that+in+Figure+2.+For+the+title+copy+the+text+in+Figure+3+to+the+top+of+the+screen%2C+the+title+should+have+a+clear+contrast+with+the+background+but+not+be+overly+eye-catching.&aspect_ratio=auto_4K&image_urls=https%3A%2F%2Fstorage.googleapis.com%2Ffalserverless%2Fexample_inputs%2Fseedreamv45%2Fseedream_v45_edit_input_1.png%2Chttps%3A%2F%2Fstorage.googleapis.com%2Ffalserverless%2Fexample_inputs%2Fseedreamv45%2Fseedream_v45_edit_input_2.png%2Chttps%3A%2F%2Fstorage.googleapis.com%2Ffalserverless%2Fexample_inputs%2Fseedreamv45%2Fseedream_v45_edit_input_3.png)

### Input

Form

Prompt\*

Image URLs\*

Add Image

Add URL

**Hint:** Drag and drop files from your computer, images from web pages, paste from clipboard (Ctrl/Cmd+V), or provide a URL.

![](https://storage.googleapis.com/falserverless/example_inputs/seedreamv45/seedream_v45_edit_input_1.png)

![](https://storage.googleapis.com/falserverless/example_inputs/seedreamv45/seedream_v45_edit_input_2.png)

![](https://storage.googleapis.com/falserverless/example_inputs/seedreamv45/seedream_v45_edit_input_3.png)

3images added

Additional Settings

More

Customize your input with more control.

Reset

[Sign in to run](https://fal.ai/login?returnTo=%2Fmodels%2Ffal-ai%2Fbytedance%2Fseedream%2Fv4.5%2Fedit%3FrestoreInputKey%3Dfal-ai%2Fbytedance%2Fseedream%2Fv4.5%2Fedit)

### Result

Idle

PreviewJSON

This generation takes approximately1m.

![seedream_v45_edit_output.png](https://storage.googleapis.com/falserverless/example_outputs/seedreamv45/seedream_v45_edit_output.png)

#### What would you like to do next?

```
{
  "images": [\
    {\
      "url": "https://storage.googleapis.com/falserverless/example_outputs/seedreamv45/seedream_v45_edit_output.png"\
    }\
  ]
}
```

Your requestwill cost$0.04per image.

### Logs

Show

### Seedream 4.5 \[image-to-image\]

ByteDance's Seedream 4.5 transforms existing images through natural language instructions at $0.04 per edit, processing up to 10 reference images simultaneously for complex multi-source compositions. Trading simple single-image workflows for sophisticated context-aware editing, this unified architecture references multiple sources, copies specific elements between images, and maintains spatial relationships without manual masking. Built for e-commerce teams assembling product composites, designers prototyping layout variations, and marketing workflows requiring consistent brand element integration across visuals.

**Built for:** Multi-image product composites \| Layout prototyping with text overlays \| Brand asset integration workflows

* * *

#### Natural Language Editing Without Layers

Seedream 4.5 consolidates image generation and editing into a single architecture that interprets spatial references directly from your prompt. Instead of requiring layer masks or selection tools, you describe edits using natural language - "replace the product in Figure 1 with that in Figure 2" or "copy the text from Figure 3 to the top with clear contrast."

**What this means for you:**

- **Multi-source composition:** Reference up to 10 images per edit, enabling complex workflows like product swaps, text overlay copying, and element positioning across multiple source files
- **Context-aware transformations:** The model maintains depth, perspective, and lighting consistency when integrating elements from different sources - no manual blending required
- **Resolution flexibility:** Output up to 4 megapixels (2048x2048 maximum) with configurable dimensions between 1920px and 4096px on either axis
- **Batch generation control:** Run 1-6 separate generations per request, with optional multi-image output (up to 6 images per generation) for exploring variations

* * *

#### Performance That Scales

Seedream 4.5 processes edits in approximately 60 seconds on [fal infrastructure](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit), with pricing structured for production workflows requiring multiple reference images.

| Metric | Result | Context |
| --- | --- | --- |
| **Inference Speed** | ~60 seconds | Standard processing time per edit on fal |
| **Cost per Edit** | $0.04 | 25 edits per $1.00 on fal |
| **Max Reference Images** | 10 images | Multi-source composition capability (last 10 used if more provided) |
| **Max Resolution** | 4MP (2048x2048) | Configurable dimensions between 1920-4096px per axis |

* * *

#### Technical Specifications

| Spec | Details |
| --- | --- |
| **Architecture** | Seedream 4.5 |
| **Input Formats** | Image URLs (up to 10), text prompt |
| **Output Formats** | PNG images via URL or data URI |
| **Resolution Range** | 1920-4096px per axis, 2560×1440 to 4096×4096 total pixels |
| **License** | Commercial use via fal Partner agreement |

[API Documentation](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit/api)

* * *

#### How It Stacks Up

**[Bytedance Seedream v4 Edit](https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit)** \- Seedream 4.5 expands multi-image input capacity from v4's baseline while maintaining the unified editing architecture. Both versions handle natural language spatial instructions, with v4.5 prioritizing higher reference image limits for complex composition workflows.

**[Bytedance Seededit v3](https://fal.ai/models/fal-ai/bytedance/seededit/v3/edit-image)** \- Seedream 4.5 consolidates generation and editing into a single model architecture, trading v3's specialized editing focus for broader capability coverage. Seededit v3 remains purpose-built for pure image-to-image transformation workflows without generation requirements.

**[NAFNet-deblur](https://fal.ai/models/fal-ai/nafnet/deblur)** \- Seedream 4.5 handles multi-image composition and semantic editing through natural language, making it ideal for layout assembly and element integration. NAFNet-deblur specializes in single-image restoration tasks like blur removal and artifact correction where semantic understanding isn't required.