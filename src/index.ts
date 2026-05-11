import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { formatToolResult, toolError } from "./output.js";
import { withTelemetry } from "./telemetry/logger.js";
import { getFileOutline } from "./tools/getFileOutline.js";
import { getProjectCommands } from "./tools/getProjectCommands.js";
import { getSymbolContext } from "./tools/getSymbolContext.js";
import { repoMap } from "./tools/repoMap.js";
import { searchCodeTool } from "./tools/searchCode.js";

const server = new McpServer({
  name: "repo-context-mcp",
  version: "1.0.0",
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
  "repo_map",
  "Return a compact map of the repository: package manager, languages, frameworks, config files, scripts, and top-level tree.",
  {
    root: z.string().optional().describe("Project root directory. Defaults to current working directory."),
  },
  async ({ root }) => handleTool("repo_map", { root }, () => repoMap(root)),
);

server.tool(
  "search_code",
  "Search code with ripgrep when available, otherwise a Node fallback. Returns file path, line number, and nearby context.",
  {
    query: z.string().describe("Search query (regex when supported)."),
    root: z.string().optional().describe("Project root directory. Defaults to current working directory."),
    maxResults: z.number().int().positive().max(100).optional().describe("Maximum number of matches to return."),
  },
  async ({ query, root, maxResults }) => {
    const limit = maxResults ?? getConfig().defaultSearchResults;
    return handleTool("search_code", { query, root, maxResults: limit }, () => searchCodeTool(query, root, limit));
  },
);

server.tool(
  "get_file_outline",
  "Return a lightweight outline for a file: imports, exports, and top-level symbols.",
  {
    filePath: z.string().describe("Path to the file, relative to root or absolute within root."),
    root: z.string().optional().describe("Project root directory. Defaults to current working directory."),
  },
  async ({ filePath, root }) => handleTool("get_file_outline", { filePath, root }, () => getFileOutline(filePath, root)),
);

server.tool(
  "get_symbol_context",
  "Find symbol definitions and return compact code blocks around them instead of whole files.",
  {
    symbol: z.string().describe("Function, class, or constant name to locate."),
    root: z.string().optional().describe("Project root directory. Defaults to current working directory."),
    maxResults: z.number().int().positive().max(20).optional().describe("Maximum number of symbol matches."),
  },
  async ({ symbol, root, maxResults }) =>
    handleTool("get_symbol_context", { symbol, root, maxResults: maxResults ?? 5 }, () =>
      getSymbolContext(symbol, root, maxResults ?? 5),
    ),
);

server.tool(
  "get_project_commands",
  "Return package scripts and likely test, lint, and dev commands from common project files.",
  {
    root: z.string().optional().describe("Project root directory. Defaults to current working directory."),
  },
  async ({ root }) => handleTool("get_project_commands", { root }, () => getProjectCommands(root)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[repo-context-mcp] ready on stdio");
}

main().catch((error) => {
  console.error("[repo-context-mcp] failed to start:", error);
  process.exit(1);
});
