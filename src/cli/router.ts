import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { getContextStatus } from "../context/broker.js";
import { logContextQuery } from "../queries/logger.js";
import { buildSkillPack, estimateTokensFromText } from "./skillPack.js";
import { formatSkillMarkdown } from "./formatSkillMarkdown.js";
import { installAssistant } from "./install.js";
import type { ContextMode } from "../context/types.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_COMMANDS = new Set(["index", "query", "pack", "status", "mcp", "install", "help"]);

export function isCliInvocation(argv = process.argv): boolean {
  const command = argv[2];
  return Boolean(command && CLI_COMMANDS.has(command));
}

function collectPositionalTask(argv: string[], commandIndex = 2): string | undefined {
  const positional: string[] = [];
  for (let i = commandIndex + 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      if (!token.includes("=") && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;
      continue;
    }
    positional.push(token);
  }
  return positional.length > 0 ? positional.join(" ").trim() : undefined;
}

function runNpmScript(script: string, extraArgs: string[] = [], cwd = process.cwd()): number {
  const result = spawnSync("npm", ["run", script, "--", ...extraArgs], { cwd, encoding: "utf8", stdio: "inherit" });
  return result.status ?? 1;
}

function asMode(value: string | undefined): ContextMode {
  const modes: ContextMode[] = ["discovery", "edit", "test", "debug", "impact"];
  return modes.includes(value as ContextMode) ? (value as ContextMode) : "discovery";
}

function commandIndex(args: string[]): number {
  const root = readStringArg(parseCliArgs(args), "root") ?? args[3] ?? process.cwd();
  const resolved = path.resolve(root);
  const graphStatus = runNpmScript("graph:build", [], resolved);
  if (graphStatus !== 0) return graphStatus;
  const contextStatus = runNpmScript("context:build", [], resolved);
  return contextStatus;
}

function commandQuery(argv: string[]): number {
  const task = collectPositionalTask(argv);
  if (!task) {
    console.error('Usage: repo-context query "<question>" [--root path]');
    return 1;
  }
  const flags = parseCliArgs(argv.slice(2));
  const root = readStringArg(flags, "root") ?? process.cwd();
  const budget = readNumberArg(flags, "budget") ?? 500;
  const pack = buildSkillPack({ task, root, budgetTokens: budget });
  const lines = [
    `Task: ${task}`,
    `Files (${pack.files.length}):`,
    ...pack.files.map((f) => `- ${f.path} — ${f.reason}`),
  ];
  if (pack.symbols.length > 0) {
    lines.push(`Symbols (${pack.symbols.length}):`);
    lines.push(...pack.symbols.slice(0, 8).map((s) => `- ${s.name}${s.path ? ` @ ${s.path}` : ""}`));
  }
  lines.push(`Estimated tokens: ${pack.estimatedOutputTokens ?? estimateTokensFromText(JSON.stringify(pack))}`);
  console.log(lines.join("\n"));
  return 0;
}

function commandPack(argv: string[]): number {
  const task = collectPositionalTask(argv);
  if (!task) {
    console.error(
      'Usage: repo-context pack "<question>" [--budget 500] [--format markdown|json] [--out path] [--root path]',
    );
    return 1;
  }
  const flags = parseCliArgs(argv.slice(2));
  const root = readStringArg(flags, "root") ?? process.cwd();
  const budget = readNumberArg(flags, "budget") ?? 500;
  const format = (readStringArg(flags, "format") ?? "markdown").toLowerCase();
  const out = readStringArg(flags, "out");
  const mode = asMode(readStringArg(flags, "mode"));

  const pack = buildSkillPack({ task, root, mode, budgetTokens: budget });
  logContextQuery(
    {
      task,
      mode,
      budgetTokens: budget,
      fileCount: pack.files.length,
      symbolCount: pack.symbols.length,
      docCount: 0,
      assetCount: 0,
      conceptCount: 0,
      estimatedOutputTokens: pack.estimatedOutputTokens ?? 0,
      truncated: pack.truncated,
      source: "repo-context:pack",
    },
    root,
  );

  const markdownProfile =
    format === "minimal" ? "minimal" : format === "ultra" ? "ultra" : "standard";
  const output =
    format === "json" ? `${JSON.stringify(pack, null, 2)}\n` : formatSkillMarkdown(pack, markdownProfile);

  if (out) {
    const outPath = path.resolve(out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
    console.log(`Context pack written to ${outPath}`);
    console.log(`Estimated output tokens: ${pack.estimatedOutputTokens ?? estimateTokensFromText(output)}`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}

function commandStatus(argv: string[]): number {
  const flags = parseCliArgs(argv.slice(2));
  const root = readStringArg(flags, "root") ?? process.cwd();
  const status = getContextStatus(root);
  console.log(JSON.stringify(status, null, 2));
  return 0;
}

function commandInstall(argv: string[]): number {
  const target = argv[3];
  if (!target || !["cursor", "codex", "claude"].includes(target)) {
    console.error("Usage: repo-context install <cursor|codex|claude> [--root path]");
    return 1;
  }
  const flags = parseCliArgs(argv.slice(2));
  const root = readStringArg(flags, "root") ?? process.cwd();
  const written = installAssistant(target as "cursor" | "codex" | "claude", path.resolve(root));
  console.log(`Installed repo-context skill instructions: ${written}`);
  return 0;
}

function commandHelp(): number {
  console.log(`repo-context — coding-agent context skill + optional MCP

Usage:
  repo-context index [path]              Build graph + context cache
  repo-context query "<question>"        Compact query answer
  repo-context pack "<question>"         Task-specific context pack
  repo-context status                    Cache status
  repo-context install <cursor|codex|claude>
  repo-context mcp                       Start MCP server (optional)

Pack options:
  --budget 500 --format markdown|json --out path --root path

Default workflow is CLI/skill mode. MCP is optional.`);
  return 0;
}

export async function runCli(argv = process.argv): Promise<number> {
  const command = argv[2];
  if (!command) return commandHelp();

  switch (command) {
    case "index":
      return commandIndex(argv);
    case "query":
      return commandQuery(argv);
    case "pack":
      return commandPack(argv);
    case "status":
      return commandStatus(argv);
    case "install":
      return commandInstall(argv);
    case "help":
    case "--help":
    case "-h":
      return commandHelp();
    case "mcp":
      return 0;
    default:
      console.error(`Unknown command: ${command}`);
      return commandHelp() === 0 ? 1 : 1;
  }
}
