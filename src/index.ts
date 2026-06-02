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
  "Check graph/context cache status. Use before context_pack when unsure indexing is ready. Suggests npm run graph:build / context:build if missing.",
  { root: z.string().optional() },
  async ({ root }) => handleTool("context_status", { root }, () => getContextStatus(root)),
);

server.tool(
  "context_pack",
  "PRIMARY TOOL. Use first for discovery, debugging, edit planning, and test planning. Prefer over repo_map/search_code/graph_query. Returns the smallest useful context package within budgetTokens.",
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
  "Use for changed-files or diff tasks: likely dependents, related tests/commands, and risk. Call after context_pack when change impact is needed.",
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
  "FALLBACK ONLY. Use when context_pack is insufficient or when graph-level detail is explicitly requested.",
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
  "FALLBACK ONLY. Symbol lookup in graph (path/line/neighbors) when context_pack is insufficient or graph details are explicitly requested.",
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
  "Exact function/class snippets (compact). Use only after context_pack identifies a symbol and exact implementation verification is required.",
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
  "LAST-RESORT FALLBACK. Use only when context/graph tools are missing or insufficient. Do not use first when context_pack is available.",
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
  "LAST-RESORT FALLBACK. Compact repo tree/scripts for missing cache or insufficient context/graph results. Do not use first when context_pack is available.",
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
