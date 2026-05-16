import fs from "node:fs";
import path from "node:path";
import { formatToolResult, getOutputCharCount } from "../output.js";
import { generateTelemetryReport } from "../telemetry/report.js";
import { isTelemetryEnabled } from "../telemetry/logger.js";
import { repoMap } from "../tools/repoMap.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { getFileOutline } from "../tools/getFileOutline.js";
import { getSymbolContext } from "../tools/getSymbolContext.js";

process.env.MCP_TELEMETRY = "1";

const root = process.cwd();
const results: Array<{ tool: string; chars: number; tokens: number }> = [];

function record(tool: string, data: unknown): void {
  const formatted = formatToolResult(data);
  const chars = getOutputCharCount(formatted);
  results.push({ tool, chars, tokens: Math.ceil(chars / 4) });
}

record("repo_map", repoMap(root));

for (const query of ["auth", "login", "session"]) {
  record(`search_code:${query}`, searchCodeTool(query, root, 8));
}

const search = searchCodeTool("login", root, 8);
const likelyFiles = [...new Set(search.matches.map((match) => match.filePath))].slice(0, 3);
for (const filePath of likelyFiles) {
  record(`get_file_outline:${filePath}`, getFileOutline(filePath, root));
}

const symbols = ["login", "session", "repoMap"].slice(0, 3);
for (const symbol of symbols) {
  record(`get_symbol_context:${symbol}`, getSymbolContext(symbol, root, 2));
}

const totalCalls = results.length;
const totalChars = results.reduce((sum, item) => sum + item.chars, 0);
const totalTokens = results.reduce((sum, item) => sum + item.tokens, 0);
const average = totalCalls ? Math.round(totalChars / totalCalls) : 0;
const largest = results.reduce((max, item) => (item.chars > max.chars ? item : max), { tool: "", chars: 0, tokens: 0 });

const exceeded5k = results.filter((item) => item.chars > 5_000).length;
const exceeded10k = results.filter((item) => item.chars > 10_000).length;
const exceeded15k = results.filter((item) => item.chars > 15_000).length;

let verdict = "Excellent";
if (largest.chars > 15_000 || exceeded15k > 0) {
  verdict = "Bad";
} else if (largest.chars > 10_000 || exceeded10k > 0) {
  verdict = "Risky";
} else if (largest.chars > 5_000 || exceeded5k > 0 || average > 4_000) {
  verdict = "Good";
}

const summary = {
  generatedAt: new Date().toISOString(),
  telemetryEnabled: isTelemetryEnabled(),
  totalCalls,
  totalChars,
  totalTokens,
  averageResponseChars: average,
  largestResponse: largest,
  exceeded5k,
  exceeded10k,
  exceeded15k,
  verdict,
  results,
};

const outDir = path.resolve(".mcp-telemetry");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "benchmark-workflow.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const reportPath = generateTelemetryReport();

console.log("Workflow benchmark complete");
console.log(`Total MCP tool calls: ${totalCalls}`);
console.log(`Total estimated MCP output tokens: ${totalTokens.toLocaleString()}`);
console.log(`Average response size: ${average.toLocaleString()} chars`);
console.log(`Largest response: ${largest.tool} (${largest.chars.toLocaleString()} chars)`);
console.log(`>5,000 chars: ${exceeded5k}`);
console.log(`>10,000 chars: ${exceeded10k}`);
console.log(`>15,000 chars: ${exceeded15k}`);
console.log(`Verdict: ${verdict}`);
console.log(`Benchmark JSON: ${path.join(outDir, "benchmark-workflow.json")}`);
console.log(`Telemetry report: ${reportPath}`);
