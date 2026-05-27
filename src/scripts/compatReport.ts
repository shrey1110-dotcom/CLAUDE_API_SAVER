import fs from "node:fs";
import path from "node:path";
import { getContextStatus } from "../context/broker.js";
import { loadCapsules } from "../context/loadContext.js";
import { getGraphStatus } from "../graph/queryGraph.js";
import { getConfig } from "../config.js";
import { isTelemetryEnabled } from "../telemetry/logger.js";

const REPORT_PATH = path.resolve(".mcp-telemetry/compatibility-report.md");

const CLIENT_DOCS = [
  "docs/client-configs/cursor.md",
  "docs/client-configs/codex.md",
  "docs/client-configs/claude-code.md",
  "docs/client-configs/claude-desktop.md",
  "docs/client-configs/generic-stdio.md",
];

const AGENT_DOCS = [
  "docs/agent-instructions/AGENTS.md",
  "docs/agent-instructions/CLAUDE.md",
  "docs/agent-instructions/CURSOR-RULE.md",
  "docs/agent-instructions/GENERIC-MCP-CLIENT.md",
];

const BENCHMARK_SCRIPTS = [
  "benchmark:workflow",
  "benchmark:graph",
  "benchmark:context",
  "benchmark:compact",
];

const EXPOSED_TOOLS = [
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

function docStatus(paths: string[]): string {
  return paths
    .map((doc) => `- ${doc}: ${fs.existsSync(path.resolve(doc)) ? "found" : "missing"}`)
    .join("\n");
}

function scriptStatus(scripts: string[]): string {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as { scripts?: Record<string, string> };
  return scripts
    .map((script) => `- ${script}: ${pkg.scripts?.[script] ? "found" : "missing"}`)
    .join("\n");
}

function main(): void {
  const config = getConfig();
  const graph = getGraphStatus();
  const context = getContextStatus();
  const capsules = loadCapsules();

  const report = `# Compatibility Report

Generated: ${new Date().toISOString()}

## Server

- Name: repo-context-mcp
- Version: 2.0.0
- Transport: stdio

## Tools exposed (${EXPOSED_TOOLS.length})

${EXPOSED_TOOLS.map((t) => `- ${t}`).join("\n")}

## Compact defaults

- MCP_OUTPUT_MODE: ${config.outputMode}
- MCP_MAX_RESPONSE_CHARS: ${config.maxResponseChars}
- MCP_DEFAULT_SEARCH_RESULTS: ${config.defaultSearchResults}
- MCP_TREE_DEPTH: ${config.treeDepth}
- MCP_SYMBOL_CONTEXT_LINES: ${config.symbolContextLines}

## Telemetry

- MCP_TELEMETRY enabled: ${isTelemetryEnabled() ? "yes" : "no"}

## Graph status

- Exists: ${graph.exists ? "yes" : "no"}
- Nodes: ${graph.nodeCount}
- Edges: ${graph.edgeCount}
- Files: ${graph.fileCount}
- Symbols: ${graph.symbolCount}

## Context broker status

- Capsules exist: ${context.capsulesExist ? "yes" : "no"}
- Capsule count: ${context.capsuleCount}
- Topics: ${capsules?.map((c) => c.topic).join(", ") ?? "n/a"}

## Client setup docs

${docStatus(CLIENT_DOCS)}

## Agent instruction docs

${docStatus(AGENT_DOCS)}

## Benchmark scripts

${scriptStatus(BENCHMARK_SCRIPTS)}

## Verdict

${graph.exists && context.capsulesExist ? "Ready for multi-client A/B testing (build graph and context first per client repo)." : "Run npm run graph:build and npm run context:build before client A/B tests."}
`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`Compatibility report written to ${REPORT_PATH}`);
}

main();
