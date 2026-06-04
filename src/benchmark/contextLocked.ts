import fs from "node:fs";
import path from "node:path";
import { buildContextPack, getContextStatus } from "../context/broker.js";
import { formatToolResult, getOutputCharCount, toolError } from "../output.js";
import { withTelemetry } from "../telemetry/logger.js";
import { generateTelemetryReport } from "../telemetry/report.js";
import { getTelemetryLogFile, getTelemetryReportFile } from "../telemetry/types.js";

process.env.MCP_TELEMETRY = "1";
process.env.MCP_TOOL_PROFILE = "codex_locked";

const root = process.cwd();
const results: Array<{ tool: string; chars: number; tokens: number }> = [];

function record(tool: string, data: unknown): void {
  const formatted = formatToolResult(data);
  const chars = getOutputCharCount(formatted);
  results.push({ tool, chars, tokens: Math.ceil(chars / 4) });
}

async function recordTelemetryTool<T>(tool: string, args: Record<string, unknown>, run: () => T): Promise<T> {
  let value: T | undefined;
  await withTelemetry(tool, args, async () => {
    try {
      value = run();
      return formatToolResult(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toolError(message);
    }
  });
  if (value === undefined) {
    throw new Error(`Failed to run ${tool}`);
  }
  record(tool, value);
  return value;
}

async function main(): Promise<void> {
  for (const file of [getTelemetryLogFile(), getTelemetryReportFile()]) {
    const fullPath = path.resolve(file);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  await recordTelemetryTool("context_status", { root }, () => getContextStatus(root));
  const pack = await recordTelemetryTool("context_pack", { task: "auth login session", root, budgetTokens: 1000 }, () =>
    buildContextPack({
      task: "Find where authentication, login, or user session logic is implemented.",
      root,
      mode: "discovery",
      budgetTokens: 1000,
    }),
  );

  const totalTokens = results.reduce((sum, item) => sum + item.tokens, 0);
  const toolsUsed = results.map((result) => result.tool);
  const exactlyTwoToolCalls = results.length === 2;
  const noFallbackTools = toolsUsed.every((tool) => tool === "context_status" || tool === "context_pack");
  const underTokenBudget = totalTokens < 800;
  const expectedFound = /auth|login|session/i.test(JSON.stringify(pack));
  const pass = exactlyTwoToolCalls && noFallbackTools && underTokenBudget && expectedFound;

  const summary = {
    workflow: "locked context-broker workflow",
    totalCalls: results.length,
    totalTokens,
    toolsUsed,
    exactlyTwoToolCalls,
    noFallbackTools,
    underTokenBudget,
    expectedFound,
    pass,
    results,
  };

  const outDir = path.resolve(".mcp-telemetry");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "benchmark-context-locked.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const reportPath = generateTelemetryReport();

  console.log("Locked context benchmark complete");
  console.log(`Total tool calls: ${results.length}`);
  console.log(`Total estimated MCP output tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Tools used: ${toolsUsed.join(", ")}`);
  console.log(`Exactly 2 tool calls: ${exactlyTwoToolCalls ? "PASS" : "FAIL"}`);
  console.log(`No fallback tools: ${noFallbackTools ? "PASS" : "FAIL"}`);
  console.log(`MCP tokens < 800: ${underTokenBudget ? "PASS" : "FAIL"}`);
  console.log(`Expected auth/session files found: ${expectedFound ? "yes" : "no"}`);
  console.log(`Telemetry report: ${reportPath}`);

  if (!pass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("benchmark:context-locked failed:", error);
  process.exit(1);
});
