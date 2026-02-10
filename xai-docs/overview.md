#### Tools

# Overview

The xAI API supports **tool calling**, enabling Grok to perform actions beyond generating text—like searching the web, executing code, querying your data, or calling your own custom functions. Tools extend what's possible with the API and let you build powerful, interactive applications.

## Types of Tools

The xAI API offers two categories of tools:

| Type | Description | Examples |
|------|-------------|----------|
| **Built-in Tools** | Server-side tools managed by xAI that execute automatically | Web Search, X Search, Code Interpreter, Collections Search |
| **Function Calling** | Custom functions you define that the model can invoke | Database queries, API calls, custom business logic |

Built-in tools run on xAI's servers—you provide the tool configuration, and the API handles execution and returns results. Function calling lets you define your own tools that the model can request, giving you full control over what happens when they're invoked.

## Pricing

Tool requests are priced based on two components: **token usage** and **tool invocations**. Since the model may call multiple tools to answer a query, costs scale with complexity.

For more details on Tools pricing, please check out [the pricing page](/developers/models#tools-pricing).

## How It Works

When you provide tools to a request, the xAI API can use them to gather information or perform actions:

1. **Analyzes the query** and determines what information or actions are needed
2. **Decides what to do next**: Make a tool call, or provide a final answer
3. **Executes the tool** (for built-in tools) or returns a tool call request (for function calling)
4. **Processes results** and continues until sufficient information is gathered
5. **Returns the final response** with citations where applicable

## Quick Start

## Citations

The API automatically returns source URLs for information gathered via tools. See [Citations](/developers/tools/citations) for details on accessing and using citation data.

## Next Steps

* **[Function Calling](/developers/tools/function-calling)** - Define custom tools the model can call
* **[Web Search](/developers/tools/web-search)** - Search the web and browse pages
* **[X Search](/developers/tools/x-search)** - Search X posts, users, and threads
* **[Code Execution](/developers/tools/code-execution)** - Execute Python code in a sandbox
* **[Collections Search](/developers/tools/collections-search)** - Query your uploaded documents
* **[Citations](/developers/tools/citations)** - Access source URLs and inline citations
