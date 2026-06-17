import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import { getContextStatus } from "../context/broker.js";
import {
  formatInstallSummary,
  installAssistant,
  installScopeKitLocalDocs,
  type InstallFileResult,
  type InstallOptions,
} from "./install.js";
import { PRODUCT_NAME } from "./branding.js";

export interface SetupOptions {
  root: string;
  dryRun: boolean;
  yes: boolean;
  cursor: boolean;
  claude: boolean;
  codex: boolean;
  mcp: boolean;
}

function flagEnabled(flags: ReturnType<typeof parseCliArgs>, key: string): boolean {
  return flags[key] === true;
}

export async function resolveSetupTargets(argv: string[]): Promise<SetupOptions> {
  const flags = parseCliArgs(argv.slice(2));
  const root = path.resolve(readStringArg(flags, "root") ?? process.cwd());
  const dryRun = flagEnabled(flags, "dry-run");
  const yes = flagEnabled(flags, "yes");
  const all = flagEnabled(flags, "all");
  const explicit =
    flagEnabled(flags, "cursor") ||
    flagEnabled(flags, "claude") ||
    flagEnabled(flags, "codex") ||
    flagEnabled(flags, "mcp") ||
    all;

  const nonInteractive = yes || dryRun || process.env.CI === "true" || !process.stdin.isTTY;

  if (!explicit && !nonInteractive) {
    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question(
        "Configure ScopeKit for Cursor, Claude, and Codex in this repo? [Y/n] ",
      );
      const accepted = answer.trim().length === 0 || /^y(es)?$/i.test(answer.trim());
      return {
        root,
        dryRun,
        yes: false,
        cursor: accepted,
        claude: accepted,
        codex: accepted,
        mcp: false,
      };
    } finally {
      rl.close();
    }
  }

  const defaultAll = !explicit && nonInteractive;
  return {
    root,
    dryRun,
    yes: yes || nonInteractive,
    cursor: flagEnabled(flags, "cursor") || all || defaultAll,
    claude: flagEnabled(flags, "claude") || all || defaultAll,
    codex: flagEnabled(flags, "codex") || all || defaultAll,
    mcp: flagEnabled(flags, "mcp") || all,
  };
}

export function runSetup(options: SetupOptions): {
  results: InstallFileResult[];
  status: ReturnType<typeof getContextStatus>;
} {
  const installOpts: InstallOptions = { root: options.root, dryRun: options.dryRun };
  const results: InstallFileResult[] = [];

  if (options.cursor) results.push(...installAssistant("cursor", installOpts));
  if (options.claude) results.push(...installAssistant("claude", installOpts));
  if (options.codex) results.push(...installAssistant("codex", installOpts));
  if (options.mcp) results.push(...installAssistant("mcp", installOpts));

  if (options.cursor || options.claude || options.codex || options.mcp) {
    results.push(...installScopeKitLocalDocs(installOpts));
  }

  return { results, status: getContextStatus(options.root) };
}

export function printSetupReport(
  options: SetupOptions,
  results: InstallFileResult[],
  status: ReturnType<typeof getContextStatus>,
): void {
  console.log(`${PRODUCT_NAME} setup\n`);
  console.log(`Detected repo: ${options.root}\n`);

  if (results.length === 0) {
    console.log("No integrations selected. Use --cursor, --claude, --codex, --mcp, or --all.");
    return;
  }

  console.log("Configured:");
  for (const line of formatInstallSummary(results)) {
    console.log(line);
  }

  console.log("");
  console.log("ScopeKit cache status:");
  console.log(`  graph: ${status.graphExists ? "ready" : "missing"}`);
  console.log(`  capsules: ${status.capsulesExist ? "ready" : "missing"}`);
  if (status.suggestedCommands.length > 0) {
    console.log(`  suggested: ${status.suggestedCommands.join(", ")}`);
  }

  if (options.mcp) {
    console.log("");
    console.log("MCP: paste `.scopekit/mcp-config.example.json` into your assistant MCP config and restart.");
  } else {
    console.log("");
    console.log("MCP (optional): run `scopekit install mcp` to generate a config snippet.");
  }

  if (options.dryRun) {
    console.log("\n(dry-run: no files were written)");
    return;
  }

  console.log("\nNext:");
  console.log("  scopekit index .");
  console.log('  scopekit pack "Find auth/session logic" --profile claude');
}

export async function commandSetup(argv: string[]): Promise<number> {
  const options = await resolveSetupTargets(argv);
  const { results, status } = runSetup(options);
  printSetupReport(options, results, status);
  return 0;
}
