import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { getContextStatus } from "../context/broker.js";
import { logContextQuery } from "../queries/logger.js";
import { buildClaudeSkillPack, buildSkillPack, CLAUDE_PACK_DEFAULT_BUDGET, estimateTokensFromText } from "./skillPack.js";
import { formatSkillMarkdown } from "./formatSkillMarkdown.js";
import type { SkillMarkdownProfile } from "./formatSkillMarkdown.js";
import { formatClaudeMarkdown } from "./formatClaudeMarkdown.js";
import {
  formatInstallSummary,
  installAssistant,
  type AssistantTarget,
  type InstallOptions,
} from "./install.js";
import { commandSetup } from "./setup.js";
import {
  cliCommandName,
  formatHelp,
  formatMcpHelp,
  invokedBinary,
  printRenameNoticeIfLegacy,
  type InvokedBinary,
} from "./branding.js";
import type { ContextMode } from "../context/types.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_COMMANDS = new Set([
  "index",
  "query",
  "pack",
  "status",
  "mcp",
  "install",
  "setup",
  "help",
]);

export function isCliInvocation(argv = process.argv): boolean {
  const command = argv[2];
  if (!command) return true;
  if (command === "--help" || command === "-h") return true;
  return CLI_COMMANDS.has(command);
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

function runPackageBuilder(relDistPath: string, root: string): number {
  const script = path.join(PACKAGE_ROOT, relDistPath);
  const result = spawnSync(process.execPath, [script, root], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function asMode(value: string | undefined): ContextMode {
  const modes: ContextMode[] = ["discovery", "edit", "test", "debug", "impact"];
  return modes.includes(value as ContextMode) ? (value as ContextMode) : "discovery";
}

function usagePrefix(binary: InvokedBinary): string {
  return cliCommandName(binary);
}

function commandIndex(argv: string[], binary: InvokedBinary): number {
  const flags = parseCliArgs(argv.slice(2));
  const root = path.resolve(readStringArg(flags, "root") ?? argv[3] ?? process.cwd());
  const graphStatus = runPackageBuilder("dist/graph/buildGraph.js", root);
  if (graphStatus !== 0) return graphStatus;
  return runPackageBuilder("dist/context/buildContext.js", root);
}

function commandQuery(argv: string[], binary: InvokedBinary): number {
  const task = collectPositionalTask(argv);
  const cmd = usagePrefix(binary);
  if (!task) {
    console.error(`Usage: ${cmd} query "<question>" [--root path] [--budget 500]`);
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

function resolveMarkdownProfile(profile: string, format: string): SkillMarkdownProfile {
  if (profile === "ultra" || profile === "minimal") return profile === "minimal" ? "minimal" : "ultra";
  if (format === "minimal") return "minimal";
  if (format === "ultra") return "ultra";
  return "standard";
}

function commandPack(argv: string[], binary: InvokedBinary): number {
  const task = collectPositionalTask(argv);
  const cmd = usagePrefix(binary);
  if (!task) {
    console.error(
      `Usage: ${cmd} pack "<question>" [--budget 500] [--profile default|ultra|claude] [--format markdown|json] [--out path] [--root path]`,
    );
    return 1;
  }
  const flags = parseCliArgs(argv.slice(2));
  const root = readStringArg(flags, "root") ?? process.cwd();
  const profile = (readStringArg(flags, "profile") ?? "default").toLowerCase();
  const isClaudeProfile = profile === "claude";
  const budget = readNumberArg(flags, "budget") ?? (isClaudeProfile ? CLAUDE_PACK_DEFAULT_BUDGET : 500);
  const format = (readStringArg(flags, "format") ?? "markdown").toLowerCase();
  const out = readStringArg(flags, "out");
  const mode = asMode(readStringArg(flags, "mode"));

  const pack = isClaudeProfile
    ? buildClaudeSkillPack({ task, root, mode, budgetTokens: budget })
    : buildSkillPack({ task, root, mode, budgetTokens: budget });
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
      source: "scopekit:pack",
    },
    root,
  );

  const markdownProfile = resolveMarkdownProfile(profile, format);
  const output =
    format === "json"
      ? `${JSON.stringify(pack, null, 2)}\n`
      : isClaudeProfile
        ? formatClaudeMarkdown(pack, { root })
        : formatSkillMarkdown(pack, markdownProfile);

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

function commandInstall(argv: string[], binary: InvokedBinary): number {
  const target = argv[3] as AssistantTarget | undefined;
  const cmd = usagePrefix(binary);
  if (!target || !["cursor", "codex", "claude", "mcp"].includes(target)) {
    console.error(`Usage: ${cmd} install <cursor|claude|codex|mcp> [--root path] [--dry-run] [--yes]`);
    return 1;
  }
  const flags = parseCliArgs(argv.slice(2));
  const root = path.resolve(readStringArg(flags, "root") ?? process.cwd());
  const options: InstallOptions = { root, dryRun: Boolean(flags["dry-run"]) };
  const results = installAssistant(target, options);

  console.log("Configured:");
  for (const line of formatInstallSummary(results)) {
    console.log(line);
  }

  if (options.dryRun) {
    console.log("\n(dry-run: no files were written)");
    return 0;
  }

  console.log("\nNext:");
  if (target === "claude") {
    console.log('  scopekit pack "Your task" --profile claude');
  } else if (target === "codex") {
    console.log('  scopekit pack "Your task" --profile ultra');
  } else if (target === "cursor") {
    console.log('  scopekit pack "Your task" --profile claude');
  } else {
    console.log("  Paste `.scopekit/mcp-config.example.json` into your assistant MCP config and run `scopekit mcp`.");
  }
  return 0;
}

function commandHelp(binary: InvokedBinary): number {
  console.log(formatHelp(binary));
  return 0;
}

export async function runCli(argv = process.argv): Promise<number> {
  const binary = invokedBinary(argv);
  const command = argv[2];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    if (binary === "repo-context-mcp" && !command) {
      console.log(formatMcpHelp(binary));
      return 0;
    }
    printRenameNoticeIfLegacy(binary);
    return commandHelp(binary);
  }

  if (command !== "mcp") {
    printRenameNoticeIfLegacy(binary);
  }

  switch (command) {
    case "index":
      return commandIndex(argv, binary);
    case "query":
      return commandQuery(argv, binary);
    case "pack":
      return commandPack(argv, binary);
    case "status":
      return commandStatus(argv);
    case "setup":
      return commandSetup(argv);
    case "install":
      return commandInstall(argv, binary);
    case "mcp":
      return 0;
    default:
      console.error(`Unknown command: ${command}`);
      return commandHelp(binary) === 0 ? 1 : 1;
  }
}
