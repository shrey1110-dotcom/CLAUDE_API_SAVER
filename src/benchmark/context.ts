import fs from "node:fs";
import path from "node:path";
import { formatToolResult, getOutputCharCount } from "../output.js";
import { generateTelemetryReport } from "../telemetry/report.js";
import { readTelemetryEntries } from "../telemetry/reader.js";
import { analyzeTelemetry } from "../telemetry/analyze.js";
import { withTelemetry } from "../telemetry/logger.js";
import { toolError } from "../output.js";
import { buildContextPack, getContextStatus } from "../context/broker.js";
import { getSymbolContext } from "../tools/getSymbolContext.js";
import { getTelemetryLogFile, getTelemetryReportFile } from "../telemetry/types.js";

process.env.MCP_TELEMETRY = "1";

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

  if (pack.needsFullFileRead && pack.symbols[0]?.name) {
    await recordTelemetryTool("get_symbol_context", { symbol: pack.symbols[0].name, root, maxResults: 1 }, () =>
      getSymbolContext(pack.symbols[0].name, root, 1),
    );
  }

  const totalCalls = results.length;
  const totalChars = results.reduce((sum, item) => sum + item.chars, 0);
  const totalTokens = results.reduce((sum, item) => sum + item.tokens, 0);
  const average = totalCalls ? Math.round(totalChars / totalCalls) : 0;
  const largest = results.reduce((max, item) => (item.chars > max.chars ? item : max), { tool: "", chars: 0, tokens: 0 });

  const serialized = JSON.stringify(pack);
  const expectedFound = /auth|login|session/i.test(serialized);
  const budgetRespected = totalChars <= 1000 * 4 + 200;

  const analysis = analyzeTelemetry(readTelemetryEntries());
  const externalFallbackCalls = (analysis.callsByTool.repo_map ?? 0) + (analysis.callsByTool.search_code ?? 0);
  const noExternalFallback = externalFallbackCalls === 0;

  let verdict = "Bad";
  if (!expectedFound) {
    verdict = "Bad";
  } else if (!noExternalFallback) {
    verdict = "Risky";
  } else if (totalTokens > 2500) {
    verdict = "Risky";
  } else if (totalTokens <= 1000) {
    verdict = "Excellent";
  } else if (totalTokens <= 1500) {
    verdict = "Good";
  }

  const summary = {
    workflow: "context-broker workflow",
    totalCalls,
    totalChars,
    totalTokens,
    averageResponseChars: average,
    largestResponse: largest,
    expectedFound,
    budgetRespected,
    toolsUsed: results.map((result) => result.tool),
    externalFallbackCalls,
    noExternalFallback,
    verdict,
    results,
  };

  const outDir = path.resolve(".mcp-telemetry");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "benchmark-context.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const reportPath = generateTelemetryReport();

  console.log("Context benchmark complete (context-broker workflow)");
  console.log(`Total tool calls: ${totalCalls}`);
  console.log(`Total estimated MCP output tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Average response size: ${average.toLocaleString()} chars`);
  console.log(`Largest response: ${largest.tool} (${largest.chars.toLocaleString()} chars)`);
  console.log(`Tools used: ${summary.toolsUsed.join(", ")}`);
  console.log(`External fallback tool calls (repo_map/search_code): ${externalFallbackCalls}`);
  console.log(`Expected auth/session files found: ${expectedFound ? "yes" : "no"}`);
  console.log(`Budget respected: ${budgetRespected ? "yes" : "no"}`);
  console.log(`Routing check (no external fallback): ${noExternalFallback ? "PASS" : "WARN"}`);
  console.log(`Verdict: ${verdict}`);
  console.log(`Telemetry report: ${reportPath}`);
}

main().catch((error) => {
  console.error("benchmark:context failed:", error);
  process.exit(1);
});
