import { formatToolResult, toolError } from "../output.js";
import { getFileOutline } from "../tools/getFileOutline.js";
import { getProjectCommands } from "../tools/getProjectCommands.js";
import { getSymbolContext } from "../tools/getSymbolContext.js";
import { repoMap } from "../tools/repoMap.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { generateTelemetryReport } from "./report.js";
import { withTelemetry } from "./logger.js";

process.env.MCP_TELEMETRY = "1";
process.env.MCP_TELEMETRY_LOG_FILE = ".mcp-telemetry/synthetic-telemetry-test.jsonl";
process.env.MCP_TELEMETRY_REPORT_FILE = ".mcp-telemetry/synthetic-telemetry-test-report.md";

const root = process.cwd();

async function runSampleToolCalls(): Promise<void> {
  const calls: Array<{ tool: string; args: Record<string, unknown>; run: () => unknown }> = [
    { tool: "synthetic_repo_map", args: { root }, run: () => repoMap(root) },
    {
      tool: "synthetic_search_code",
      args: { query: "repo-context-mcp", root, maxResults: 3 },
      run: () => searchCodeTool("repo-context-mcp", root, 3),
    },
    {
      tool: "synthetic_get_file_outline",
      args: { filePath: "src/index.ts", root },
      run: () => getFileOutline("src/index.ts", root),
    },
    {
      tool: "synthetic_get_symbol_context",
      args: { symbol: "repoMap", root, maxResults: 2 },
      run: () => getSymbolContext("repoMap", root, 2),
    },
    { tool: "synthetic_get_project_commands", args: { root }, run: () => getProjectCommands(root) },
  ];

  for (const call of calls) {
    await withTelemetry(call.tool, call.args, async () => {
      try {
        return formatToolResult(call.run());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolError(message);
      }
    });
  }
}

async function main(): Promise<void> {
  await runSampleToolCalls();
  await withTelemetry("synthetic_error_tool", { source: "telemetry:test" }, async () => toolError("synthetic telemetry error"));
  const reportPath = generateTelemetryReport();
  console.log("Telemetry test complete (synthetic log/report only).");
  console.log(`Report path: ${reportPath}`);
}

main().catch((error) => {
  console.error("Telemetry test failed:", error);
  process.exit(1);
});
