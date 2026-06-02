import fs from "node:fs";
import path from "node:path";
import { formatToolResult, toolError } from "../output.js";
import { buildContextPack, getContextStatus } from "../context/broker.js";
import { getSymbolContext } from "../tools/getSymbolContext.js";
import { analyzeTelemetry } from "./analyze.js";
import { withTelemetry } from "./logger.js";
import { readTelemetryEntries } from "./reader.js";
import { generateTelemetryReport } from "./report.js";
import { getTelemetryLogFile, getTelemetryReportFile } from "./types.js";

process.env.MCP_TELEMETRY = "1";

const root = process.cwd();

for (const file of [getTelemetryLogFile(), getTelemetryReportFile()]) {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

async function runTelemetryTool<T>(tool: string, args: Record<string, unknown>, run: () => T): Promise<T> {
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
  return value;
}

function passFail(flag: boolean): string {
  return flag ? "PASS" : "FAIL";
}

async function main(): Promise<void> {
  const status = await runTelemetryTool("context_status", { root }, () => getContextStatus(root));
  if (!status.graphExists || !status.capsulesExist) {
    console.warn("Warning: graph/context cache is missing. Run npm run graph:build && npm run context:build for best routing.");
  }

  const pack = await runTelemetryTool("context_pack", { task: "auth login session discovery", root, budgetTokens: 1000 }, () =>
    buildContextPack({
      task: "Find where authentication, login, or user session logic is implemented.",
      root,
      mode: "discovery",
      budgetTokens: 1000,
    }),
  );

  if (pack.needsFullFileRead && pack.symbols[0]?.name) {
    await runTelemetryTool(
      "get_symbol_context",
      { symbol: pack.symbols[0].name, root, maxResults: 1 },
      () => getSymbolContext(pack.symbols[0].name, root, 1),
    );
  }

  const reportPath = generateTelemetryReport();
  const analysis = analyzeTelemetry(readTelemetryEntries());
  const callsByTool = analysis.callsByTool;

  const hasContextStatus = (callsByTool.context_status ?? 0) >= 1;
  const hasContextPack = (callsByTool.context_pack ?? 0) >= 1;
  const hasNoRepoMap = (callsByTool.repo_map ?? 0) === 0;
  const hasNoSearchCode = (callsByTool.search_code ?? 0) === 0;
  const hasNoBadTool = (callsByTool.bad_tool ?? 0) === 0;
  const underTokenBudget = analysis.estimatedTotalTokens < 1500;
  const routingPass = hasContextStatus && hasContextPack && hasNoRepoMap && hasNoSearchCode && hasNoBadTool && underTokenBudget;

  console.log("Context broker telemetry route test");
  console.log(`Tools called: ${Object.keys(callsByTool).sort().join(", ") || "(none)"}`);
  console.log(`Total MCP output tokens: ${analysis.estimatedTotalTokens}`);
  console.log(`context_status called >=1: ${passFail(hasContextStatus)}`);
  console.log(`context_pack called >=1: ${passFail(hasContextPack)}`);
  console.log(`repo_map called 0 times: ${passFail(hasNoRepoMap)}`);
  console.log(`search_code called 0 times: ${passFail(hasNoSearchCode)}`);
  console.log(`bad_tool called 0 times: ${passFail(hasNoBadTool)}`);
  console.log(`tokens < 1500: ${passFail(underTokenBudget)}`);
  console.log(`Routing verdict: ${routingPass ? "PASS" : "FAIL"}`);
  console.log(`Telemetry report: ${reportPath}`);

  if (!routingPass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("telemetry:context-test failed:", error);
  process.exit(1);
});
