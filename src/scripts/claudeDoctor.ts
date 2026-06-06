import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import {
  LOCKED_CLAUDE_CONFIG,
  NO_MCP_CLAUDE_CONFIG,
  buildLockedProofCommands,
  lockedConfigPath,
  lockedRepeatCommand,
  noMcpConfigPath,
  probeClaudeBin,
  resolveClaudeOnPath,
} from "../ab/adapters/claudeCliSupport.js";
import { loadContextManifest } from "../context/loadContext.js";
import { getGraphStatus } from "../graph/queryGraph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function line(label: string, value: string): void {
  console.log(`${label}: ${value}`);
}

function main(): void {
  const args = parseCliArgs();
  const claudeBinArg = readStringArg(args, "claude-bin");

  const pathProbe = resolveClaudeOnPath();
  const defaultProbe = probeClaudeBin("claude");
  const customProbe = claudeBinArg ? probeClaudeBin(claudeBinArg) : undefined;

  const buildOk = fs.existsSync(path.join(ROOT, "dist/index.js"));
  const graph = getGraphStatus(ROOT);
  const contextManifest = loadContextManifest(ROOT);
  const capsuleCount = contextManifest?.capsuleCount ?? 0;
  const lockedConfig = lockedConfigPath(ROOT);
  const noMcpConfig = noMcpConfigPath(ROOT);
  const lockedConfigOk = fs.existsSync(lockedConfig);
  const noMcpConfigOk = fs.existsSync(noMcpConfig);

  const claudeReady = customProbe?.found === true || defaultProbe.found;
  const repoReady = buildOk && graph.exists && capsuleCount > 0 && lockedConfigOk && noMcpConfigOk;

  console.log("repo-context-mcp Claude doctor\n");

  line("Repo", ROOT);
  line("Claude on PATH", pathProbe.onPath ? `yes (${pathProbe.resolvedPath})` : "no — run: which claude");

  if (defaultProbe.found) {
    line("claude --version", defaultProbe.version ?? "unknown");
  } else {
    line("claude --version", `not available (${defaultProbe.error ?? "claude not found"})`);
  }

  if (claudeBinArg) {
    if (customProbe?.found) {
      line("--claude-bin probe", `ok (${customProbe.bin}) — ${customProbe.version ?? "version unknown"}`);
    } else {
      line("--claude-bin probe", `failed (${claudeBinArg}) — ${customProbe?.error ?? "not runnable"}`);
    }
  } else {
    line("--claude-bin probe", "not provided (optional: npm run ab:claude:doctor -- --claude-bin /absolute/path/to/claude)");
  }

  line("Locked config", lockedConfigOk ? `OK (${LOCKED_CLAUDE_CONFIG})` : `MISSING (${LOCKED_CLAUDE_CONFIG})`);
  line("No-MCP config", noMcpConfigOk ? `OK (${NO_MCP_CLAUDE_CONFIG})` : `MISSING (${NO_MCP_CLAUDE_CONFIG})`);
  line("Build", buildOk ? "OK (dist/index.js)" : "MISSING — run: npm run build");
  line(
    "Graph cache",
    graph.exists ? `OK (${graph.nodeCount} nodes, ${graph.edgeCount} edges)` : "MISSING — run: npm run graph:build",
  );
  line(
    "Context capsules",
    capsuleCount > 0 ? `OK (${capsuleCount} capsules)` : "MISSING — run: npm run context:build",
  );

  console.log("");
  line("Ready for locked proof", claudeReady && repoReady ? "yes" : "no");
  if (!claudeReady) {
    line("Claude blocker", "Install Claude Code CLI or pass --claude-bin /absolute/path/to/claude");
  }
  if (!repoReady) {
    line("Repo blocker", "Run npm run build && npm run graph:build && npm run context:build");
  }

  console.log("\nClaude savings are NOT proven.");
  console.log("\nExact command to run locked repeats:");
  console.log(lockedRepeatCommand(ROOT, claudeBinArg));

  console.log("\nFull proof pipeline:");
  console.log("npm run ab:claude:plan");
  for (const command of buildLockedProofCommands(ROOT, claudeBinArg)) {
    console.log(command);
  }

  process.exit(claudeReady && repoReady ? 0 : 1);
}

main();
