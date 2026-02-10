#### Tools

# Streaming & Synchronous Requests

Agentic requests can be executed in either streaming or synchronous mode. This page covers both approaches and how to use them effectively.

## Streaming Mode (Recommended)

We strongly recommend using streaming mode when using agentic tool calling. It provides:

* **Real-time observability** of tool calls as they happen
* **Immediate feedback** during potentially long-running requests
* **Reasoning token counts** as the model thinks

### Streaming Example

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution, web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4-1-fast-reasoning",
    tools=[
        web_search(),
        x_search(),
        code_execution(),
    ],
    include=["verbose_streaming"],
)

chat.append(user("What are the latest updates from xAI?"))

is_thinking = True
for response, chunk in chat.stream():
    # View server-side tool calls in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\nCitations:", response.citations)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';

const { fullStream } = streamText({
  model: xai.responses('grok-4-1-fast-reasoning'),
  prompt: 'What are the latest updates from xAI?',
  tools: {
    web_search: xai.tools.webSearch(),
    x_search: xai.tools.xSearch(),
    code_execution: xai.tools.codeExecution(),
  },
});

for await (const part of fullStream) {
  if (part.type === 'tool-call') {
    console.log(\`Calling tool: \${part.toolName}\`);
  } else if (part.type === 'text-delta') {
    process.stdout.write(part.text);
  } else if (part.type === 'source' && part.sourceType === 'url') {
    console.log(\`Citation: \${part.url}\`);
  }
}
```

## Synchronous Mode

For simpler use cases or when you want to wait for the complete agentic workflow to finish before processing the response, you can use synchronous requests:

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution, web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4-1-fast-reasoning",
    tools=[
        web_search(),
        x_search(),
        code_execution(),
    ],
)

chat.append(user("What is the latest update from xAI?"))

# Get the final response in one go once it's ready
response = chat.sample()

print("Final Response:")
print(response.content)

print("\\nCitations:")
print(response.citations)

print("\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

// Synchronous request - waits for complete response
const { text, sources } = await generateText({
  model: xai.responses('grok-4-1-fast-reasoning'),
  prompt: 'What is the latest update from xAI?',
  tools: {
    web_search: xai.tools.webSearch(),
    x_search: xai.tools.xSearch(),
    code_execution: xai.tools.codeExecution(),
  },
});

console.log('Final Response:');
console.log(text);

console.log('\\nCitations:');
console.log(sources);
```

Synchronous requests will wait for the entire agentic process to complete before returning. This is simpler for basic use cases but provides less visibility into intermediate steps.

## Using Tools with Responses API

We also support using the Responses API in both streaming and non-streaming modes:

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4-1-fast-reasoning",
    store_messages=True,  # Enable Responses API
    tools=[
        web_search(),
        x_search(),
    ],
)

chat.append(user("What is the latest update from xAI?"))
response = chat.sample()

print(response.content)
print(response.citations)

# The response id can be used to continue the conversation
print(response.id)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4-1-fast-reasoning",
    input=[
        {
            "role": "user",
            "content": "what is the latest update from xAI?",
        },
    ],
    tools=[
        {
            "type": "web_search",
        },
        {
            "type": "x_search",
        },
    ],
)

print(response)
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4-1-fast-reasoning",
  "input": [
    {
      "role": "user",
      "content": "what is the latest update from xAI?"
    }
  ],
  "tools": [
    {
      "type": "web_search"
    },
    {
      "type": "x_search"
    }
  ]
}'
```

## Accessing Tool Outputs

By default, server-side tool call outputs are not returned since they can be large. However, you can opt-in to receive them:

### xAI SDK

| Tool | Value for `include` field |
|------|---------------------------|
| `"web_search"` | `"web_search_call_output"` |
| `"x_search"` | `"x_search_call_output"` |
| `"code_execution"` | `"code_execution_call_output"` |
| `"collections_search"` | `"collections_search_call_output"` |
| `"attachment_search"` | `"attachment_search_call_output"` |
| `"mcp"` | `"mcp_call_output"` |

```pythonXAI
import os
from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4-1-fast-reasoning",
    tools=[
        code_execution(),
    ],
    include=["code_execution_call_output"],
)
chat.append(user("What is the 100th Fibonacci number?"))

# stream or sample the response...
```

### Responses API

| Tool | Responses API tool name | Value for `include` field |
|------|-------------------------|---------------------------|
| `"web_search"` | `"web_search"` | `"web_search_call.action.sources"` |
| `"code_execution"` | `"code_interpreter"` | `"code_interpreter_call.outputs"` |
| `"collections_search"` | `"file_search"` | `"file_search_call.results"` |
| `"mcp"` | `"mcp"` | Always returned in Responses API |
