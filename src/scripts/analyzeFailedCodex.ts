import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import { analyzeFailedCodexLog, formatFailedCodexAnalysis } from "../telemetry/failedRunAnalyze.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_LOG = path.join(ROOT, ".mcp-ab-tests", "failed-runs", "codex-full-context-logs.jsonl");

function main(): void {
  const args = parseCliArgs();
  const logArg = readStringArg(args, "log");
  const logFile = path.resolve(logArg ?? DEFAULT_LOG);

  if (!fs.existsSync(logFile)) {
    console.error(`Failed Codex log not found: ${logFile}`);
    console.error("Copy the failed MCP telemetry log to:");
    console.error("  .mcp-ab-tests/failed-runs/codex-full-context-logs.jsonl");
    console.error("Or pass: npm run analyze:failed-codex -- --log /path/to/logs.jsonl");
    process.exit(1);
  }

  const analysis = analyzeFailedCodexLog(logFile);
  console.log(formatFailedCodexAnalysis(analysis));
  process.exit(analysis.toolLoop.toolLoopFailure ? 1 : 0);
}

main();
