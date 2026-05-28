import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../config.js";
import { loadContextManifest } from "../context/loadContext.js";
import { getGraphCachePaths } from "../graph/paths.js";
import { getGraphStatus } from "../graph/queryGraph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
  bin?: Record<string, string>;
};

function status(ok: boolean): string {
  return ok ? "OK" : "MISSING";
}

function line(label: string, value: string): void {
  console.log(`${label}: ${value}`);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function docsExist(paths: string[]): boolean {
  return paths.every((p) => fileExists(p));
}

const nodeMajor = Number(process.version.slice(1).split(".")[0]);
const buildOk = fileExists("dist/index.js");
const graphPaths = getGraphCachePaths(ROOT);
const graph = getGraphStatus(ROOT);
const contextManifest = loadContextManifest(ROOT);
const capsuleCount = contextManifest?.capsuleCount ?? 0;

const exposedTools = [
  "context_status",
  "context_pack",
  "impact_pack",
  "graph_status",
  "graph_query",
  "graph_symbol",
  "graph_neighbors",
  "graph_paths",
  "get_symbol_context",
  "get_project_commands",
  "search_code",
  "repo_map",
];

const config = getConfig();
let staleHint = "";
if (graph.exists && graph.generatedAt) {
  const ageHours = (Date.now() - new Date(graph.generatedAt).getTime()) / 3_600_000;
  if (ageHours > 168) {
    staleHint = " (graph may be stale — consider npm run graph:build)";
  }
}

console.log("repo-context-mcp doctor\n");
line("Package", `${PKG.name} v${PKG.version}`);
line("Node", nodeMajor >= 18 ? `OK (${process.version})` : `WARN (${process.version}, need >=18)`);
line("Build", buildOk ? "OK" : "Run npm run build");
line("MCP server", buildOk ? `OK (dist/index.js${PKG.bin?.["repo-context-mcp"] ? ", bin linked" : ""})` : "MISSING");
line(
  "Graph cache",
  graph.exists
    ? `OK, ${graph.nodeCount} nodes, ${graph.edgeCount} edges${staleHint}`
    : "MISSING — run npm run graph:build",
);
line(
  "Context capsules",
  capsuleCount > 0 ? `OK, ${capsuleCount} capsules` : "MISSING — run npm run context:build",
);
line(
  "Telemetry",
  process.env.MCP_TELEMETRY === "1" ? "enabled" : "ready (set MCP_TELEMETRY=1 to log)",
);
line(
  "Docs",
  docsExist([
    "docs/client-configs/codex.md",
    "docs/safety.md",
    "docs/benchmarks.md",
    "docs/setup-checklist.md",
  ])
    ? "OK"
    : "INCOMPLETE",
);
line("Examples", fileExists("examples/generic-stdio/mcp-server.json") ? "OK" : "MISSING");

console.log("\nCompact defaults:");
line("  MCP_OUTPUT_MODE", config.outputMode);
line("  MCP_MAX_RESPONSE_CHARS", String(config.maxResponseChars));
line("  MCP_DEFAULT_SEARCH_RESULTS", String(config.defaultSearchResults));
line("  MCP_TREE_DEPTH", String(config.treeDepth));
line("  MCP_SYMBOL_CONTEXT_LINES", String(config.symbolContextLines));

console.log(`\nExposed MCP tools (${exposedTools.length}):`);
console.log(exposedTools.join(", "));

if (!fs.existsSync(graphPaths.graphDir)) {
  console.log("\nSuggested next step:");
  console.log("  npm run graph:build && npm run context:build && npm run doctor");
} else if (capsuleCount === 0) {
  console.log("\nSuggested next step:");
  console.log("  npm run context:build");
} else {
  console.log("\nSuggested next step:");
  console.log("  npm run benchmark:context");
}
