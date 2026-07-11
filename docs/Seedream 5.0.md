> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Seedream 5.0 Pro Image Generation

> - **This model is available**: Seedream 5.0 Pro is open for Playground testing and API integration on EvoLink

- Seedream 5.0 Pro (doubao-seedream-5.0-pro) model supports text-to-image, image-to-image, image editing and other generation modes
- Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
- Generated image links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml
openapi: 3.1.0
info:
  title: doubao-seedream-5.0-pro Interface
  description: >-
    Create image tasks using AI models, supporting multiple models and parameter
    configurations
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Image Generation
    description: AI image generation related APIs
paths:
  /v1/images/generations:
    post:
      tags:
        - Image Generation
      summary: doubao-seedream-5.0-pro Interface
      description: >-
        - **This model is available**: Seedream 5.0 Pro is open for Playground
        testing and API integration on EvoLink

        - Seedream 5.0 Pro (doubao-seedream-5.0-pro) model supports
        text-to-image, image-to-image, image editing and other generation modes

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated image links are valid for 24 hours, please save them
        promptly
      operationId: createImageGeneration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ImageGenerationRequest'
            examples:
              text_to_image:
                summary: Text to Image
                value:
                  model: doubao-seedream-5.0-pro
                  prompt: A serene lake reflecting the beautiful sunset
                  size: '16:9'
                  quality: 2K
      responses:
        '200':
          description: Image generation task created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageGenerationResponse'
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: invalid_request
                  message: Invalid request parameters
                  type: invalid_request_error
        '401':
          description: Unauthenticated, invalid or expired token
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: unauthorized
                  message: Invalid or expired token
                  type: authentication_error
        '402':
          description: Insufficient quota, recharge required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: insufficient_quota
                  message: Insufficient quota. Please top up your account.
                  type: insufficient_quota
        '403':
          description: Access denied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: model_access_denied
                  message: 'Token does not have access to model: doubao-seedream-5.0-pro'
                  type: invalid_request_error
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: rate_limit_exceeded
                  message: Too many requests, please try again later
                  type: rate_limit_error
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: internal_error
                  message: Internal server error
                  type: api_error
components:
  schemas:
    ImageGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: Image generation model name
          enum:
            - doubao-seedream-5.0-pro
          default: doubao-seedream-5.0-pro
          example: doubao-seedream-5.0-pro
        prompt:
          type: string
          description: >-
            Prompt describing the image you want to generate, or describing how
            to edit the input image, limited to 2000 tokens
          example: A serene lake reflecting the beautiful sunset
          maxLength: 2000
        'n':
          type: integer
          description: >-
            Number of images to generate, Pro only supports `1`


            **Note:**

            - Each request will pre-charge based on the value of `n`, actual
            charges based on the number of images generated
          example: 1
        size:
          type: string
          description: >-
            Size of generated image, supports two formats:


            **Method 1 - Ratio format:**

            - `auto`, `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`,
            `16:9`, `21:9`

            - Works with `quality` parameter to automatically generate images at
            the specified ratio and resolution, no need to specify exact pixels

            - Ratio + quality resolve to these exact pixels:

            | Ratio | 1K | 2K |
            | --- | --- | --- |
            | `1:1` | 1024x1024 | 2048x2048 |
            | `2:3` | 832x1248 | 1664x2496 |
            | `3:2` | 1248x832 | 2496x1664 |
            | `3:4` | 896x1184 | 1728x2304 |
            | `4:3` | 1184x896 | 2304x1728 |
            | `4:5` | 960x1200 | 1792x2240 |
            | `5:4` | 1200x960 | 2240x1792 |
            | `9:16` | 768x1376 | 1440x2560 |
            | `16:9` | 1376x768 | 2560x1440 |
            | `21:9` | 1568x672 | 3024x1296 |


            **Method 2 - Pixel format:**

            - Width x Height, e.g.: `1024x1024`, `2048x2048` and other values
            within range

            - Total pixel range: `[1024x1024, 2048x2048]` (1,048,576 to 4,194,304
            pixels); listed 1K/2K preset pixel values above are always accepted

            - Aspect ratio range: `[1/16, 16]`


            Defaults to `auto` when `size` is omitted
          default: auto
          example: '16:9'
        quality:
          type: string
          description: >-
            Resolution tier, used in combination with ratio format of `size`


            **Options:**

            - `1K`: 1K resolution

            - `2K`: 2K resolution


            Works with ratio format of `size` to automatically generate images
            at the corresponding resolution; Pro defaults to `1K`
          enum:
            - 1K
            - 2K
          default: 1K
          example: 2K
        prompt_priority:
          type: string
          description: >-
            Prompt optimization strategy, used to set the mode for prompt
            optimization


            **Options:**

            - `standard`: Standard mode, higher quality output, longer
            processing time
          enum:
            - standard
          default: standard
          example: standard
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-image and image editing
            features


            **Note:**

            - Single request supports input image quantity: `10` images

            - Image size: no more than `30MB`

            - Supported image formats: `.jpeg`, `.jpg`, `.png`, `.webp`, `.bmp`,
            `.tiff`, `.gif`, `.heic`, `.heif`

            - Aspect ratio (width/height) range: `[1/16, 16]`

            - Width and height (px) > 14

            - Total pixels: no more than `6000×6000`

            - Image URLs must be directly viewable by the server, or the image
            URL should trigger direct download when accessed (typically these
            URLs end with image file extensions, such as `.png`, `.jpg`)
          items:
            type: string
            format: uri
          maxItems: 10
          example:
            - https://example.com/image1.png
            - https://example.com/image2.png
        model_params:
          type: object
          description: |-
            **Supported parameters:**
            - `output_format`: Output image format
          properties:
            output_format:
              type: string
              description: |-
                Output image format

                **Options:**
                - `png`: PNG format
                - `jpeg`: JPEG format
              enum:
                - png
                - jpeg
              example: jpeg
        callback_url:
          type: string
          description: >-
            HTTPS callback address after task completion


            **Callback Timing:**

            - Triggered when task is completed, failed, or cancelled

            - Sent after billing confirmation is completed


            **Security Restrictions:**

            - Only HTTPS protocol is supported

            - Callback to internal IP addresses is prohibited (127.0.0.1,
            10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.)

            - URL length must not exceed `2048` characters


            **Callback Mechanism:**

            - Timeout: `10` seconds

            - Maximum `3` retries on failure (retries after `1` second/`2`
            seconds/`4` seconds)

            - Callback response body format is consistent with the task query
            API response format

            - Callback address returning 2xx status code is considered
            successful, other status codes will trigger retry
          format: uri
          example: https://your-domain.com/webhooks/image-task-completed
    ImageGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1757165031
        id:
          type: string
          description: Task ID
          example: task-unified-1757165031-seedream5pro
        model:
          type: string
          description: Actual model name used
          example: doubao-seedream-5.0-pro
        object:
          type: string
          enum:
            - image.generation.task
          description: Specific task type
        progress:
          type: integer
          description: Task progress percentage (0-100)
          minimum: 0
          maximum: 100
          example: 0
        status:
          type: string
          description: Task status
          enum:
            - pending
            - processing
            - completed
            - failed
          example: pending
        task_info:
          $ref: '#/components/schemas/TaskInfo'
          description: Async task information
        type:
          type: string
          enum:
            - text
            - image
            - audio
            - video
          description: Task output type
          example: image
        usage:
          $ref: '#/components/schemas/Usage'
          description: Usage and billing information
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: string
              description: Error code identifier
            message:
              type: string
              description: Error description
            type:
              type: string
              description: Error type
    TaskInfo:
      type: object
      properties:
        can_cancel:
          type: boolean
          description: Whether the task can be cancelled
          example: true
        estimated_time:
          type: integer
          description: Estimated completion time (seconds)
          minimum: 0
          example: 45
    Usage:
      type: object
      description: Usage and billing information
      properties:
        billing_rule:
          type: string
          description: Billing rule
          enum:
            - per_call
            - per_token
            - per_second
          example: per_call
        credits_reserved:
          type: number
          description: Estimated credits consumed
          minimum: 0
          example: 1.8
        user_group:
          type: string
          description: User group category
          example: default
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ##All APIs require Bearer Token authentication##


        **Get API Key:**


        Visit [API Key Management Page](https://evolink.ai/dashboard/keys) to
        get your API Key


        **Add to request header:**

        ```

        Authorization: Bearer YOUR_API_KEY

        ```

````

> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Query Task Status

> Query the status, progress, and result information of asynchronous tasks by task ID

## OpenAPI

````yaml
openapi: 3.1.0
info:
  title: Get Task Details API
  description: >-
    Query the status, progress, and result information of asynchronous tasks by
    task ID
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Task Management
    description: Asynchronous task management related APIs
paths:
  /v1/tasks/{task_id}:
    get:
      tags:
        - Task Management
      summary: Query Task Status
      description: >-
        Query the status, progress, and result information of asynchronous tasks
        by task ID
      operationId: getTaskDetail
      parameters:
        - name: task_id
          in: path
          required: true
          schema:
            type: string
          description: >-
            Task ID, ignore {} when querying, append the id from the async task
            response body at the end of the path
          example: task-unified-1756817821-4x3rx6ny
      responses:
        '200':
          description: Task status details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TaskDetailResponse'
        '400':
          description: Request parameter error, format error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: invalid_task_id
                  message: Invalid task ID format, must start with 'task-unified-'
                  type: invalid_request_error
                  param: task_id
        '401':
          description: Unauthenticated, token invalid or expired
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: unauthorized
                  message: Authentication required
                  type: authentication_error
        '402':
          description: Insufficient quota, recharge required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: quota_exceeded
                  message: Insufficient quota. Please top up your account.
                  type: insufficient_quota
        '403':
          description: No permission to access
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: permission_denied
                  message: You don't have permission to access this task
                  type: invalid_request_error
        '404':
          description: Resource does not exist
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: task_not_found
                  message: The requested task could not be found
                  type: invalid_request_error
        '429':
          description: Request rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: rate_limit_exceeded
                  message: Rate limit exceeded
                  type: evo_api_error
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: internal_error
                  message: Failed to retrieve task status
                  type: api_error
components:
  schemas:
    TaskDetailResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1756817821
        id:
          type: string
          description: Task ID
          example: task-unified-1756817821-4x3rx6ny
        model:
          type: string
          description: Model used
          example: doubao-seedream-5.0-pro
        object:
          type: string
          description: Task type
          enum:
            - image.generation.task
            - video.generation.task
            - audio.generation.task
          example: image.generation.task
        progress:
          type: integer
          minimum: 0
          maximum: 100
          description: Task progress percentage
          example: 100
        results:
          type: array
          items:
            type: string
            format: uri
          description: Task result list (provided when completed)
          example:
            - http://example.com/image.jpg
        status:
          type: string
          description: Task status
          enum:
            - pending
            - processing
            - completed
            - failed
          example: completed
        error:
          type: object
          nullable: true
          description: >-
            Error information when the task fails (only present when status is
            "failed"). Note: error.code here is a string-type business error
            code, different from HTTP status codes. See the Error Codes
            Reference for the complete list.
          properties:
            code:
              type: string
              description: Business error code (string type)
              example: content_policy_violation
            message:
              type: string
              description: User-friendly error description with troubleshooting tips
              example: |-
                Content policy violation.
                Your request was blocked by safety filters.
            type:
              type: string
              description: Error type identifier, always "task_error"
              example: task_error
        task_info:
          type: object
          description: Task detailed information
          properties:
            can_cancel:
              type: boolean
              description: Whether the task can be cancelled
              example: false
        type:
          type: string
          description: Task type
          enum:
            - image
            - video
            - audio
            - text
          example: image
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: string
              description: Error code (string type)
              example: invalid_task_id
            message:
              type: string
              description: Error description message
              example: Invalid task ID format
            type:
              type: string
              description: Error type
              example: invalid_request_error
            param:
              type: string
              description: Related parameter name
              example: task_id
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ##All APIs require Bearer Token authentication##


        **Get API Key:**


        Visit [API Key Management Page](https://evolink.ai/dashboard/keys) to
        get your API Key


        **Add to request header:**

        ```

        Authorization: Bearer YOUR_API_KEY

        ```

````
