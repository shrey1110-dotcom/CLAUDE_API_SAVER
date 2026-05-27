import fs from "node:fs";
import path from "node:path";
import { formatToolResult, getOutputCharCount } from "../output.js";
import { loadGraph } from "../graph/queryGraph.js";
import { graphNeighbors, graphQuery, graphStatus, graphPaths, graphSymbol } from "../tools/graphTools.js";

const root = process.cwd();
const fixtureRoot = path.resolve("tests/fixtures/monorepo-app");
const results: Array<{ tool: string; chars: number; tokens: number }> = [];

const EXPECTED_PATTERNS = [/auth/i, /login/i, /session/i];

function record(tool: string, data: unknown): void {
  const formatted = formatToolResult(data);
  const chars = getOutputCharCount(formatted);
  results.push({ tool, chars, tokens: Math.ceil(chars / 4) });
}

record("graph_status", graphStatus(root));
const query = graphQuery("auth login session", root, 8, 1000);
record("graph_query", query);
record("graph_symbol", graphSymbol("loginUser", root, 3, 1000));

const top = query.results[0];
if (top?.path) {
  record("graph_neighbors", graphNeighbors({ path: top.path, depth: 1, root, budgetTokens: 1000 }));
}

const loginFile = query.results.find((r) => /login/i.test(r.path ?? ""))?.path;
const sessionFile = query.results.find((r) => /session/i.test(r.path ?? ""))?.path;
if (loginFile && sessionFile) {
  record("graph_paths", graphPaths(loginFile, sessionFile, root, 3, 1000));
}

const totalTokens = results.reduce((sum, item) => sum + item.tokens, 0);
const largest = results.reduce((max, item) => (item.chars > max.chars ? item : max), { tool: "", chars: 0, tokens: 0 });
const queryPayload = JSON.stringify(query);
const expectedFound =
  /auth|login|session/i.test(queryPayload) &&
  (/fixtures\/.*(auth|login|session)/i.test(queryPayload) ||
    /auth\.controller|session\.service|\/auth\//i.test(queryPayload));

let verdict = "Bad";
if (!expectedFound) {
  verdict = "Bad";
} else if (totalTokens > 5000) {
  verdict = "Risky";
} else if (totalTokens <= 1500) {
  verdict = "Excellent";
} else if (totalTokens <= 3000) {
  verdict = "Good";
}

const summary = {
  task: "Find where auth/login/session logic is implemented.",
  totalCalls: results.length,
  totalTokens,
  largest,
  expectedFound,
  verdict,
  results,
};

const outDir = path.resolve(".mcp-telemetry");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "benchmark-graph.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log("Graph benchmark complete");
console.log(`Total graph tool calls: ${results.length}`);
console.log(`Total estimated MCP output tokens: ${totalTokens.toLocaleString()}`);
console.log(`Largest response: ${largest.tool} (${largest.chars.toLocaleString()} chars)`);
console.log(`Expected auth/session files found: ${expectedFound ? "yes" : "no"}`);
console.log(`Verdict: ${verdict}`);
