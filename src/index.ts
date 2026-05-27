#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildContextPack, buildImpactPack, getContextStatus } from "./context/broker.js";
import { getConfig } from "./config.js";
import { formatToolResult, toolError } from "./output.js";
import { withTelemetry } from "./telemetry/logger.js";
import { getProjectCommands } from "./tools/getProjectCommands.js";
import { getSymbolContext } from "./tools/getSymbolContext.js";
import {
  graphNeighbors,
  graphPaths,
  graphQuery,
  graphStatus,
  graphSymbol,
} from "./tools/graphTools.js";
import { repoMap } from "./tools/repoMap.js";
import { searchCodeTool } from "./tools/searchCode.js";

const server = new McpServer({
  name: "repo-context-mcp",
  version: "0.1.0",
});

async function handleTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  handler: () => T | Promise<T>,
) {
  return withTelemetry(toolName, args, async () => {
    try {
      return formatToolResult(await handler());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toolError(message);
    }
  });
}

server.tool(
  "context_status",
  "Check graph and context index status. Call first when unsure the repo is indexed. Suggests npm run graph:build / context:build if missing.",
  { root: z.string().optional() },
  async ({ root }) => handleTool("context_status", { root }, () => getContextStatus(root)),
);

server.tool(
  "context_pack",
  "PREFERRED FIRST TOOL. Returns the smallest useful file/symbol/command package for a task within budgetTokens. Use before graph_query, search_code, repo_map, or full file reads.",
  {
    task: z.string(),
    root: z.string().optional(),
    mode: z.enum(["discovery", "edit", "test", "debug", "impact"]).optional(),
    budgetTokens: z.number().int().min(300).max(2500).optional(),
  },
  async ({ task, root, mode, budgetTokens }) =>
    handleTool("context_pack", { task, root, mode, budgetTokens }, () =>
      buildContextPack({ task, root, mode, budgetTokens }),
    ),
);

server.tool(
  "impact_pack",
  "For changed files or diffs: likely dependents, related tests, commands, and risk level. Use when editing or reviewing changes—not for initial discovery (use context_pack first).",
  {
    changedFiles: z.array(z.string()).optional(),
    root: z.string().optional(),
    budgetTokens: z.number().int().min(300).max(2500).optional(),
  },
  async ({ changedFiles, root, budgetTokens }) =>
    handleTool("impact_pack", { changedFiles, root, budgetTokens }, () =>
      buildImpactPack({ changedFiles, root, budgetTokens }),
    ),
);

server.tool(
  "graph_status",
  "Read-only graph index status. Run npm run graph:build if missing.",
  { root: z.string().optional() },
  async ({ root }) => handleTool("graph_status", { root }, () => graphStatus(root)),
);

server.tool(
  "graph_query",
  "FALLBACK: query the local knowledge graph when context_pack did not return enough. Not the preferred first tool.",
  {
    query: z.string(),
    root: z.string().optional(),
    maxResults: z.number().int().positive().max(20).optional(),
    budgetTokens: z.number().int().min(300).max(2500).optional(),
  },
  async ({ query, root, maxResults, budgetTokens }) =>
    handleTool("graph_query", { query, root, maxResults, budgetTokens }, () =>
      graphQuery(query, root, maxResults, budgetTokens),
    ),
);

server.tool(
  "graph_symbol",
  "FALLBACK: find a symbol in the knowledge graph (path, line, neighbors). Use when context_pack is insufficient. No full file bodies.",
  {
    symbol: z.string(),
    root: z.string().optional(),
    maxResults: z.number().int().positive().max(20).optional(),
    budgetTokens: z.number().int().min(300).max(2500).optional(),
  },
  async ({ symbol, root, maxResults, budgetTokens }) =>
    handleTool("graph_symbol", { symbol, root, maxResults, budgetTokens }, () =>
      graphSymbol(symbol, root, maxResults, budgetTokens),
    ),
);

server.tool(
  "graph_neighbors",
  "Lower-priority: expand graph neighbors for a node, path, or symbol. Keep compact.",
  {
    nodeId: z.string().optional(),
    path: z.string().optional(),
    symbol: z.string().optional(),
    depth: z.number().int().min(1).max(3).optional(),
    maxResults: z.number().int().positive().max(30).optional(),
    root: z.string().optional(),
    budgetTokens: z.number().int().min(300).max(2500).optional(),
  },
  async (input) => handleTool("graph_neighbors", input, () => graphNeighbors(input)),
);

server.tool(
  "graph_paths",
  "Lower-priority: find short paths between files/symbols in the graph.",
  {
    from: z.string(),
    to: z.string(),
    maxDepth: z.number().int().min(1).max(5).optional(),
    root: z.string().optional(),
    budgetTokens: z.number().int().min(300).max(2500).optional(),
  },
  async ({ from, to, maxDepth, root, budgetTokens }) =>
    handleTool("graph_paths", { from, to, maxDepth, root, budgetTokens }, () =>
      graphPaths(from, to, root, maxDepth, budgetTokens),
    ),
);

server.tool(
  "get_symbol_context",
  "Exact symbol-level code snippets (compact). Use only when context_pack/graph_symbol are insufficient and you must verify implementation details.",
  {
    symbol: z.string(),
    root: z.string().optional(),
    maxResults: z.number().int().positive().max(20).optional(),
  },
  async ({ symbol, root, maxResults }) => {
    const limit = maxResults ?? getConfig().defaultSymbolResults;
    return handleTool("get_symbol_context", { symbol, root, maxResults: limit }, () =>
      getSymbolContext(symbol, root, limit),
    );
  },
);

server.tool(
  "get_project_commands",
  "Likely test/lint/dev/install commands. Fallback when context_pack omits commands.",
  { root: z.string().optional() },
  async ({ root }) => handleTool("get_project_commands", { root }, () => getProjectCommands(root)),
);

server.tool(
  "search_code",
  "FALLBACK ONLY: ripgrep search when context_pack and graph_query are insufficient. Prefer context_pack first.",
  {
    query: z.string(),
    root: z.string().optional(),
    maxResults: z.number().int().positive().max(100).optional(),
  },
  async ({ query, root, maxResults }) => {
    const limit = maxResults ?? getConfig().defaultSearchResults;
    return handleTool("search_code", { query, root, maxResults: limit }, () => searchCodeTool(query, root, limit));
  },
);

server.tool(
  "repo_map",
  "FALLBACK ONLY: compact repo tree and scripts when graph/context index is missing. Prefer context_pack when indexed.",
  { root: z.string().optional() },
  async ({ root }) => handleTool("repo_map", { root }, () => repoMap(root)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[repo-context-mcp] ready on stdio v0.1.0");
}

main().catch((error) => {
  console.error("[repo-context-mcp] failed to start:", error);
  process.exit(1);
});
