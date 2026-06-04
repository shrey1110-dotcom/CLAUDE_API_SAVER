import type { AbMode } from "./types.js";

export const DEFAULT_TASK_PROMPT =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give me the exact files, functions, and a short explanation of why each file matters.";

export const DEFAULT_AB_MODES: AbMode[] = ["no_mcp", "compact_search", "graph", "context_broker", "context_broker_locked"];

function trimPrompt(taskPrompt: string): string {
  const normalized = taskPrompt.trim();
  return normalized.length > 0 ? normalized : DEFAULT_TASK_PROMPT;
}

export function getModePrompt(mode: AbMode, taskPrompt = DEFAULT_TASK_PROMPT): string {
  const task = trimPrompt(taskPrompt);

  if (mode === "no_mcp") {
    return `${task}

After answering, list the files you inspected or read.`;
  }

  if (mode === "compact_search") {
    return `Use repo-context-mcp compact search tools. Prefer repo_map, search_code, get_project_commands, and get_symbol_context. Do not use context_pack or graph tools for this run. Do not edit files.

Task:
${task}

After answering, list which MCP tools you used and which files you inspected or read.`;
  }

  if (mode === "graph") {
    return `Use repo-context-mcp graph tools first. Prefer graph_status, graph_query, and graph_symbol. Use get_symbol_context only if exact symbol context is needed. Do not use context_pack for this run. Do not edit files.

Task:
${task}

After answering, list which MCP tools you used and which files you inspected or read.`;
  }

  if (mode === "context_broker_locked") {
    return `Use repo-context-mcp in locked context-broker mode.

Required:
1. Call context_status once.
2. Call context_pack once with budgetTokens 1000.
3. Do not call graph tools, search tools, or symbol tools.
4. Do not read broad file contents.
5. Answer only from context_pack unless it explicitly says full file verification is needed.

Do not edit files.

Task:
${task}

After answering, list:
- MCP tools used
- whether context_pack was sufficient
- whether any fallback was needed`;
  }

  return `Use repo-context-mcp v2 context broker.

Required:
1. Call context_status once.
2. Call context_pack once with budgetTokens 1000.
3. Answer from context_pack unless it explicitly says context is insufficient.
4. Do not call graph_query, graph_symbol, graph_neighbors, or graph_paths unless context_pack explicitly says context is insufficient.
5. Do not call get_symbol_context unless exact symbol verification is required after context_pack.
6. Do not call repo_map or search_code unless context_pack is missing, errors, or explicitly says context is insufficient.
7. Do not read broad file contents unless context_pack says full file verification is needed.

Hard fallback budget for this run:
- context_pack: max 2 calls
- graph tools combined: max 2 calls
- get_symbol_context: max 2 calls
- total MCP calls: warn above 6, stop above 10 unless you explain why in notes

If you use any fallback tool, explain why context_pack was insufficient.

Do not edit files.

Task:
${task}

After answering, list:
- MCP tools used
- whether context_pack was sufficient
- whether any fallback tools were used and why`;
}
