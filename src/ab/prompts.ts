import type { AbMode } from "./types.js";

export const DEFAULT_TASK_PROMPT =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give me the exact files, functions, and a short explanation of why each file matters.";

export const DEFAULT_AB_MODES: AbMode[] = ["no_mcp", "compact_search", "graph", "context_broker"];

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

  return `Use repo-context-mcp v2 context broker.

Required:
1. Call context_status.
2. Call context_pack with budgetTokens 1000.
3. Do not call repo_map or search_code unless context_pack is missing, errors, or explicitly says context is insufficient.
4. Do not call graph_query unless context_pack is insufficient.
5. Do not read broad file contents unless context_pack says full file verification is needed.

Do not edit files.

Task:
${task}

After answering, list:
- MCP tools used
- whether context_pack was sufficient
- whether any fallback tools were used and why`;
}
