#### Tools

# Tool Usage Details

This page covers the technical details of how tool calls are tracked, billed, and how to understand token usage in agentic requests.

## Real-time Server-side Tool Calls

When streaming agentic requests, you can observe **every tool call decision** the model makes in real-time via the `tool_calls` attribute on the `chunk` object:

```pythonWithoutSDK
for tool_call in chunk.tool_calls:
    print(f"\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
```

**Note**: Only the tool call invocations are shown — **server-side tool call outputs are not returned** in the API response. The agent uses these outputs internally to formulate its final response.

## Server-side Tool Calls vs Tool Usage

The API provides two related but distinct metrics for server-side tool executions:

### `tool_calls` - All Attempted Calls

```pythonWithoutSDK
response.tool_calls
```

Returns a list of all **attempted** tool calls made during the agentic process. Each entry contains:

* `id`: Unique identifier for the tool call
* `function.name`: The name of the specific server-side tool called
* `function.arguments`: The parameters passed to the server-side tool

This includes **every tool call attempt**, even if some fail.

### `server_side_tool_usage` - Successful Calls (Billable)

```pythonWithoutSDK
response.server_side_tool_usage
```

Returns a map of successfully executed tools and their invocation counts. This represents only the tool calls that returned meaningful responses and **determines your billing**.

```output
{'SERVER_SIDE_TOOL_X_SEARCH': 3, 'SERVER_SIDE_TOOL_WEB_SEARCH': 2}
```

## Tool Call Function Names vs Usage Categories

The function names in `tool_calls` represent the precise name of the tool invoked, while the entries in `server_side_tool_usage` provide a high-level categorization that aligns with the original tool passed in the `tools` array.

| Usage Category | Function Name(s) |
|----------------|------------------|
| `SERVER_SIDE_TOOL_WEB_SEARCH` | `web_search`, `web_search_with_snippets`, `browse_page` |
| `SERVER_SIDE_TOOL_X_SEARCH` | `x_user_search`, `x_keyword_search`, `x_semantic_search`, `x_thread_fetch` |
| `SERVER_SIDE_TOOL_CODE_EXECUTION` | `code_execution` |
| `SERVER_SIDE_TOOL_VIEW_X_VIDEO` | `view_x_video` |
| `SERVER_SIDE_TOOL_VIEW_IMAGE` | `view_image` |
| `SERVER_SIDE_TOOL_COLLECTIONS_SEARCH` | `collections_search` |
| `SERVER_SIDE_TOOL_MCP` | `{server_label}.{tool_name}` if `server_label` provided, otherwise `{tool_name}` |

## When Tool Calls and Usage Differ

In most cases, `tool_calls` and `server_side_tool_usage` will show the same tools. However, they can differ when:

* **Failed tool executions**: The model attempts to browse a non-existent webpage, fetch a deleted X post, or encounters other execution errors
* **Invalid parameters**: Tool calls with malformed arguments that can't be processed
* **Network or service issues**: Temporary failures in the tool execution pipeline

The agentic system handles these failures gracefully, updating its trajectory and continuing with alternative approaches when needed.

**Billing Note**: Only successful tool executions (`server_side_tool_usage`) are billed. Failed attempts are not charged.

## Understanding Token Usage

Agentic requests have unique token usage patterns compared to standard chat completions:

### `completion_tokens`

Represents **only the final text output** of the model. This is typically much smaller than you might expect, as the agent performs all its intermediate reasoning and tool orchestration internally.

### `prompt_tokens`

Represents the **cumulative input tokens** across all inference requests made during the agentic process. Each request includes the full conversation history up to that point, which grows as the agent progresses.

While this can result in higher `prompt_tokens` counts, agentic requests benefit significantly from **prompt caching**. The majority of the prompt remains unchanged between steps, allowing for efficient caching.

### `reasoning_tokens`

Represents the tokens used for the model's internal reasoning process. This includes planning tool calls, analyzing results, and formulating responses, but excludes the final output tokens.

### `cached_prompt_text_tokens`

Indicates how many prompt tokens were served from cache rather than recomputed. Higher values indicate better cache utilization and lower costs.

### `prompt_image_tokens`

Represents tokens from visual content that the agent processes. These are counted separately from text tokens. If no images or videos are processed, this value will be zero.

## Limiting Tool Call Turns

The `max_turns` parameter allows you to control the maximum number of assistant/tool-call turns the agent can perform during a single request.

### Understanding Turns vs Tool Calls

**Important**: `max_turns` does **not** directly limit the number of individual tool calls. Instead, it limits the number of assistant turns in the agentic loop. During a single turn, the model may invoke multiple tools in parallel.

A "turn" represents one iteration of the agentic reasoning loop:

1. The model analyzes the current context
2. The model decides to call one or more tools (potentially in parallel)
3. Tools execute and return results
4. The model processes the results

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4-1-fast-reasoning",
    tools=[
        web_search(),
        x_search(),
    ],
    max_turns=3,  # Limit to 3 assistant/tool-call turns
)

chat.append(user("What is the latest news from xAI?"))
response = chat.sample()
print(response.content)
```

### When to Use `max_turns`

| Use Case | Recommended `max_turns` | Tradeoff |
|----------|------------------------|----------|
| **Quick lookups** | 1-2 | Fastest response, may miss deeper insights |
| **Balanced research** | 3-5 | Good balance of speed and thoroughness |
| **Deep research** | 10+ or unset | Most comprehensive, longer latency and higher cost |

### Default Behavior

If `max_turns` is not specified, the server applies a global default cap. When the agent reaches the limit, it will stop making additional tool calls and generate a final response based on information gathered so far.

## Identifying Tool Call Types

To determine whether a returned tool call is a client-side tool that needs local execution:

### Using xAI SDK

Use the `get_tool_call_type` function:

```pythonXAI
from xai_sdk.tools import get_tool_call_type

for tool_call in response.tool_calls:
    print(get_tool_call_type(tool_call))
```

| Tool call types | Description |
|---------------|-------------|
| `"client_side_tool"` | Client-side tool call - requires local execution |
| `"web_search_tool"` | Web-search tool - handled by xAI server |
| `"x_search_tool"` | X-search tool - handled by xAI server |
| `"code_execution_tool"` | Code-execution tool - handled by xAI server |
| `"collections_search_tool"` | Collections-search tool - handled by xAI server |
| `"mcp_tool"` | MCP tool - handled by xAI server |

### Using Responses API

Check the `type` field of output entries (`response.output[].type`):

| Types | Description |
|-------|-------------|
| `"function_call"` | Client-side tool - requires local execution |
| `"web_search_call"` | Web-search tool - handled by xAI server |
| `"x_search_call"` | X-search tool - handled by xAI server |
| `"code_interpreter_call"` | Code-execution tool - handled by xAI server |
| `"file_search_call"` | Collections-search tool - handled by xAI server |
| `"mcp_call"` | MCP tool - handled by xAI server |
