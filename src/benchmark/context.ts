import fs from "node:fs";
import path from "node:path";
import { formatToolResult, getOutputCharCount } from "../output.js";
import { generateTelemetryReport } from "../telemetry/report.js";
import { buildContextPack, getContextStatus } from "../context/broker.js";
import { getSymbolContext } from "../tools/getSymbolContext.js";

process.env.MCP_TELEMETRY = "1";

const root = process.cwd();
const results: Array<{ tool: string; chars: number; tokens: number }> = [];

function record(tool: string, data: unknown): void {
  const formatted = formatToolResult(data);
  const chars = getOutputCharCount(formatted);
  results.push({ tool, chars, tokens: Math.ceil(chars / 4) });
}

record("context_status", getContextStatus(root));
const pack = buildContextPack({
  task: "Find where authentication, login, or user session logic is implemented.",
  root,
  mode: "discovery",
  budgetTokens: 1000,
});
record("context_pack", pack);

if (pack.needsFullFileRead && pack.symbols[0]?.name) {
  record("get_symbol_context", getSymbolContext(pack.symbols[0].name, root, 1));
}

const totalCalls = results.length;
const totalChars = results.reduce((sum, item) => sum + item.chars, 0);
const totalTokens = results.reduce((sum, item) => sum + item.tokens, 0);
const average = totalCalls ? Math.round(totalChars / totalCalls) : 0;
const largest = results.reduce((max, item) => (item.chars > max.chars ? item : max), { tool: "", chars: 0, tokens: 0 });

const serialized = JSON.stringify(pack);
const expectedFound = /auth|login|session/i.test(serialized);
const budgetRespected = totalChars <= 1000 * 4 + 200;

let verdict = "Bad";
if (!expectedFound) {
  verdict = "Bad";
} else if (totalTokens > 2500) {
  verdict = "Risky";
} else if (totalTokens <= 1000) {
  verdict = "Excellent";
} else if (totalTokens <= 1500) {
  verdict = "Good";
}

const summary = {
  totalCalls,
  totalChars,
  totalTokens,
  averageResponseChars: average,
  largestResponse: largest,
  expectedFound,
  budgetRespected,
  verdict,
  results,
};

const outDir = path.resolve(".mcp-telemetry");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "benchmark-context.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const reportPath = generateTelemetryReport();

console.log("Context benchmark complete");
console.log(`Total tool calls: ${totalCalls}`);
console.log(`Total estimated MCP output tokens: ${totalTokens.toLocaleString()}`);
console.log(`Average response size: ${average.toLocaleString()} chars`);
console.log(`Largest response: ${largest.tool} (${largest.chars.toLocaleString()} chars)`);
console.log(`Expected auth/session files found: ${expectedFound ? "yes" : "no"}`);
console.log(`Budget respected: ${budgetRespected ? "yes" : "no"}`);
console.log(`Verdict: ${verdict}`);
console.log(`Telemetry report: ${reportPath}`);
