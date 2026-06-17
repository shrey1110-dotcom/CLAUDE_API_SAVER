import path from "node:path";

export const PRODUCT_NAME = "ScopeKit";
export const PRODUCT_TAGLINE = "task-complete context packs for AI coding agents";
export const LEGACY_NAMES = ["repo-context", "repo-context-mcp"] as const;

export const RENAME_NOTICE =
  "repo-context has been renamed to ScopeKit. Use `scopekit ...` going forward.";

export type InvokedBinary = "scopekit" | "repo-context" | "repo-context-mcp" | "node-dev";

export function invokedBinary(argv = process.argv): InvokedBinary {
  const base = path.basename(argv[1] ?? "");
  if (base === "scopekit") return "scopekit";
  if (base === "repo-context-mcp") return "repo-context-mcp";
  if (base === "repo-context") return "repo-context";
  return "node-dev";
}

export function isLegacyBinary(binary: InvokedBinary): boolean {
  return binary === "repo-context" || binary === "repo-context-mcp";
}

export function cliCommandName(binary: InvokedBinary): string {
  if (binary === "repo-context" || binary === "repo-context-mcp") return "repo-context";
  return "scopekit";
}

export function printRenameNoticeIfLegacy(binary: InvokedBinary): void {
  if (isLegacyBinary(binary)) {
    console.error(RENAME_NOTICE);
  }
}

export function formatHelp(binary: InvokedBinary): string {
  const cmd = cliCommandName(binary);
  const lines = [
    `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
    "",
    "Usage:",
    `  ${cmd} setup [--dry-run] [--yes] [--cursor] [--claude] [--codex] [--mcp] [--all]`,
    `  ${cmd} index [path]                 Build graph + context cache`,
    `  ${cmd} status                      Cache status`,
    `  ${cmd} query "<question>"          Compact query answer`,
    `  ${cmd} pack "<question>"           Task-specific context pack`,
    `  ${cmd} install <cursor|claude|codex|mcp>`,
    `  ${cmd} mcp                         Start MCP server (stdio)`,
    "",
    "Examples:",
    `  ${cmd} setup`,
    `  ${cmd} index .`,
    `  ${cmd} pack "Find auth/session logic" --profile claude`,
    `  ${cmd} query "Where is auth handled?"`,
    `  ${cmd} install cursor`,
    "",
    "Pack profiles:",
    "  default   balanced markdown pack",
    "  ultra     smallest context (Codex-style workflows)",
    "  claude    richer relationships and risks (Claude/Cursor)",
    "",
    "Pack options:",
    "  --budget 900 --format markdown|json --out path --root path --mode discovery",
    "",
    "Backward compatibility:",
    "  repo-context and repo-context-mcp remain available as deprecated aliases.",
    "",
    "MCP is optional. CLI/skill mode is the default workflow.",
  ];
  if (isLegacyBinary(binary)) {
    lines.push("", RENAME_NOTICE);
  }
  return lines.join("\n");
}

export function formatMcpHelp(binary: InvokedBinary): string {
  const lines = [
    `${PRODUCT_NAME} MCP server (stdio)`,
    "",
    "Start with:",
    "  scopekit mcp",
    "",
    "Example MCP config snippet (save to your assistant config):",
    JSON.stringify(
      {
        mcpServers: {
          scopekit: {
            command: "scopekit",
            args: ["mcp"],
          },
        },
      },
      null,
      2,
    ),
    "",
    "Or run `scopekit install mcp` in a repo to write `.scopekit/mcp-config.example.json`.",
    "Restart your assistant after adding MCP config.",
  ];
  if (isLegacyBinary(binary)) {
    lines.push("", RENAME_NOTICE);
  }
  return lines.join("\n");
}
