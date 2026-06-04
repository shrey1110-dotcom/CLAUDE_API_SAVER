import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import {
  LOCKED_CODEX_CONFIG,
  buildLockedProofCommands,
  lockedConfigPath,
  lockedRepeatCommand,
  probeCodexBin,
  resolveCodexOnPath,
} from "../ab/adapters/codexCliSupport.js";
import { loadContextManifest } from "../context/loadContext.js";
import { getGraphStatus } from "../graph/queryGraph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function line(label: string, value: string): void {
  console.log(`${label}: ${value}`);
}

function main(): void {
  const args = parseCliArgs();
  const codexBinArg = readStringArg(args, "codex-bin");

  const pathProbe = resolveCodexOnPath();
  const defaultProbe = probeCodexBin("codex");
  const customProbe = codexBinArg ? probeCodexBin(codexBinArg) : undefined;

  const buildOk = fs.existsSync(path.join(ROOT, "dist/index.js"));
  const graph = getGraphStatus(ROOT);
  const contextManifest = loadContextManifest(ROOT);
  const capsuleCount = contextManifest?.capsuleCount ?? 0;
  const lockedConfig = lockedConfigPath(ROOT);
  const lockedConfigOk = fs.existsSync(lockedConfig);

  const codexReady = customProbe?.found === true || defaultProbe.found;
  const repoReady = buildOk && graph.exists && capsuleCount > 0 && lockedConfigOk;

  console.log("repo-context-mcp codex doctor\n");

  line("Repo", ROOT);
  line("Codex on PATH", pathProbe.onPath ? `yes (${pathProbe.resolvedPath})` : "no — run: which codex");

  if (defaultProbe.found) {
    line("codex --version", defaultProbe.version ?? "unknown");
  } else {
    line("codex --version", `not available (${defaultProbe.error ?? "codex not found"})`);
  }

  if (codexBinArg) {
    if (customProbe?.found) {
      line("--codex-bin probe", `ok (${customProbe.bin}) — ${customProbe.version ?? "version unknown"}`);
    } else {
      line("--codex-bin probe", `failed (${codexBinArg}) — ${customProbe?.error ?? "not runnable"}`);
    }
  } else {
    line("--codex-bin probe", "not provided (optional: npm run codex:doctor -- --codex-bin /absolute/path/to/codex)");
  }

  line("Locked config", lockedConfigOk ? `OK (${LOCKED_CODEX_CONFIG})` : `MISSING (${LOCKED_CODEX_CONFIG})`);
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
  line("Ready for locked proof", codexReady && repoReady ? "yes" : "no");
  if (!codexReady) {
    line("Codex blocker", "Install Codex CLI or pass --codex-bin /absolute/path/to/codex");
  }
  if (!repoReady) {
    line("Repo blocker", "Run npm run build && npm run graph:build && npm run context:build");
  }

  console.log("\nExact command to run locked repeats:");
  console.log(lockedRepeatCommand(ROOT, codexBinArg));

  console.log("\nFull proof pipeline:");
  console.log("npm run codex:proof:locked:instructions");
  if (codexBinArg) {
    console.log(`npm run codex:proof:locked:instructions -- --codex-bin ${codexBinArg}`);
  }

  console.log("\nAll proof commands:");
  for (const command of buildLockedProofCommands(ROOT, codexBinArg)) {
    console.log(command);
  }

  process.exit(codexReady && repoReady ? 0 : 1);
}

main();
