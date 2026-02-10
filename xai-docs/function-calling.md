#### Tools

# Function Calling

Define custom tools that the model can invoke during a conversation. The model requests the call, you execute it locally, and return the result. This enables integration with databases, APIs, and any external system.

With streaming, the function call is returned in whole in a single chunk, not streamed across chunks.

## How It Works

1. Define tools with a name, description, and JSON schema for parameters
2. Include tools in your request
3. Model returns a `tool_call` when it needs external data
4. Execute the function locally and return the result
5. Model continues with your result

## Quick Start

## Defining Tools with Pydantic

Use Pydantic models for type-safe parameter schemas:

## Handling Tool Calls

When the model wants to use your tool, execute the function and return the result:

## Combining with Built-in Tools

Function calling works alongside built-in agentic tools. The model can use web search, then call your custom function:

When mixing tools:

* **Built-in tools** execute automatically on xAI servers
* **Custom tools** pause execution and return to you for handling

See [Advanced Usage](/developers/tools/advanced-usage#mixing-server-side-and-client-side-tools) for complete examples with tool loops.

## Tool Choice

Control when the model uses tools:

| Value | Behavior |
|-------|----------|
| `"auto"` | Model decides whether to call a tool (default) |
| `"required"` | Model must call at least one tool |
| `"none"` | Disable tool calling |
| `{"type": "function", "function": {"name": "..."}}` | Force a specific tool |

## Parallel Function Calling

By default, parallel function calling is enabled — the model can request multiple tool calls in a single response. Process all of them before continuing:

```pythonWithoutSDK
# response.tool_calls may contain multiple calls
for tool_call in response.tool_calls:
    result = tools_map[tool_call.function.name](**json.loads(tool_call.function.arguments))
    # Append each result...
```

Disable with `parallel_tool_calls: false` in your request.

## Tool Schema Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (max 200 tools per request) |
| `description` | Yes | What the tool does — helps the model decide when to use it |
| `parameters` | Yes | JSON Schema defining function inputs |

### Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "string",
      "description": "City name"
    },
    "unit": {
      "type": "string",
      "enum": ["celsius", "fahrenheit"],
      "default": "celsius"
    }
  },
  "required": ["location"]
}
```

## Complete Vercel AI SDK Example

The Vercel AI SDK handles tool definition, execution, and the request/response loop automatically:

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

const result = streamText({
  model: xai.responses('grok-4-1-fast-reasoning'),
  tools: {
    getCurrentTemperature: tool({
      description: 'Get current temperature for a location',
      parameters: z.object({
        location: z.string().describe('City and state, e.g. San Francisco, CA'),
        unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
      }),
      execute: async ({ location, unit }) => ({
        location,
        temperature: unit === 'fahrenheit' ? 59 : 15,
        unit,
      }),
    }),
    getCurrentCeiling: tool({
      description: 'Get current cloud ceiling for a location',
      parameters: z.object({
        location: z.string().describe('City and state'),
      }),
      execute: async ({ location }) => ({
        location,
        ceiling: 15000,
        ceiling_type: 'broken',
        unit: 'ft',
      }),
    }),
  },
  stopWhen: stepCountIs(5),
  prompt: "What's the temperature and cloud ceiling in San Francisco?",
});

for await (const chunk of result.fullStream) {
  switch (chunk.type) {
    case 'text-delta':
      process.stdout.write(chunk.text);
      break;
    case 'tool-call':
      console.log(`Tool call: ${chunk.toolName}`, chunk.args);
      break;
    case 'tool-result':
      console.log(`Tool result: ${chunk.toolName}`, chunk.result);
      break;
  }
}
```
