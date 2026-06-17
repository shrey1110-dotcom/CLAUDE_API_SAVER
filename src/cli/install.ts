import fs from "node:fs";
import path from "node:path";

export const SCOPEKIT_MARK_BEGIN = "<!-- scopekit:begin -->";
export const SCOPEKIT_MARK_END = "<!-- scopekit:end -->";

export type InstallAction = "created" | "updated" | "skipped" | "dry-run";

export interface InstallFileResult {
  path: string;
  relativePath: string;
  action: InstallAction;
}

export interface InstallOptions {
  root: string;
  dryRun?: boolean;
}

const CURSOR_RULE_BODY = `---
description: Use ScopeKit for task-specific repository context.
alwaysApply: false
---

Before broad repository search, run:

\`\`\`bash
scopekit pack "<task>" --profile claude
\`\`\`

Use ScopeKit output as the primary context. If context is insufficient, state what is missing.
`;

const CLAUDE_SECTION = `# ScopeKit

Before large repo-navigation, debugging, architecture, onboarding, or edit-planning tasks, use ScopeKit to generate task-specific context.

Run:

\`\`\`bash
scopekit pack "<task>" --profile claude
\`\`\`

Use the supplied ScopeKit context first. Only scan the broader repo if the ScopeKit context is insufficient, and say what was missing.
`;

const AGENTS_SECTION = `# ScopeKit

For repo-navigation, debugging, architecture, onboarding, or edit-planning tasks, first generate a compact task pack:

\`\`\`bash
scopekit pack "<task>" --profile ultra
\`\`\`

Use the supplied context before broad repo search.
`;

const SCOPEKIT_README = `# ScopeKit (local)

Repo-local ScopeKit instructions installed by \`scopekit setup\`.

## Quick commands

\`\`\`bash
scopekit index .
scopekit pack "<task>" --profile claude
scopekit query "<question>"
\`\`\`

See \`examples.md\` for profile guidance.
`;

const SCOPEKIT_EXAMPLES = `# ScopeKit examples

\`\`\`bash
scopekit pack "Find auth/session logic" --profile claude
scopekit pack "Plan a safe edit" --profile ultra --budget 500
scopekit pack "Explain architecture" --profile claude --out .scopekit/architecture.md
\`\`\`
`;

const MCP_CONFIG_EXAMPLE = {
  mcpServers: {
    scopekit: {
      command: "scopekit",
      args: ["mcp"],
    },
  },
};

function relativeToRoot(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/g, "/") || target;
}

function upsertMarkedSection(existing: string, begin: string, end: string, body: string): string {
  const block = `${begin}\n${body.trim()}\n${end}`;
  const start = existing.indexOf(begin);
  const stop = existing.indexOf(end);
  if (start >= 0 && stop > start) {
    return `${existing.slice(0, start)}${block}${existing.slice(stop + end.length)}`;
  }
  const separator = existing.trim().length > 0 && !existing.endsWith("\n") ? "\n\n" : existing.length > 0 ? "\n" : "";
  return `${existing}${separator}${block}\n`;
}

function writeFileResult(
  root: string,
  target: string,
  content: string,
  options: InstallOptions,
): InstallFileResult {
  const relativePath = relativeToRoot(root, target);
  const existed = fs.existsSync(target);
  if (options.dryRun) {
    return { path: target, relativePath, action: "dry-run" };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return { path: target, relativePath, action: existed ? "updated" : "created" };
}

function mergeFileResult(
  root: string,
  target: string,
  defaultContent: string,
  body: string,
  options: InstallOptions,
): InstallFileResult {
  const relativePath = relativeToRoot(root, target);
  const existed = fs.existsSync(target);
  const existing = existed ? fs.readFileSync(target, "utf8") : defaultContent;
  const next = upsertMarkedSection(existing, SCOPEKIT_MARK_BEGIN, SCOPEKIT_MARK_END, body);
  if (options.dryRun) {
    return { path: target, relativePath, action: "dry-run" };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, next, "utf8");
  return { path: target, relativePath, action: existed ? "updated" : "created" };
}

export function installCursorRule(options: InstallOptions): InstallFileResult {
  const target = path.join(options.root, ".cursor", "rules", "scopekit.mdc");
  const block = `${SCOPEKIT_MARK_BEGIN}\n${CURSOR_RULE_BODY.trim()}\n${SCOPEKIT_MARK_END}\n`;
  return writeFileResult(options.root, target, block, options);
}

export function installClaudeInstructions(options: InstallOptions): InstallFileResult {
  const target = path.join(options.root, "CLAUDE.md");
  return mergeFileResult(options.root, target, "# Project instructions\n", CLAUDE_SECTION, options);
}

export function installCodexAgents(options: InstallOptions): InstallFileResult {
  const candidates = [
    path.join(options.root, "AGENTS.md"),
    path.join(options.root, "docs", "agent-instructions", "AGENTS.md"),
  ];
  const target = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  return mergeFileResult(options.root, target, "# AGENTS\n", AGENTS_SECTION, options);
}

export function installScopeKitLocalDocs(options: InstallOptions): InstallFileResult[] {
  const readme = path.join(options.root, ".scopekit", "README.md");
  const examples = path.join(options.root, ".scopekit", "examples.md");
  return [
    writeFileResult(options.root, readme, `${SCOPEKIT_README}\n`, options),
    writeFileResult(options.root, examples, `${SCOPEKIT_EXAMPLES}\n`, options),
  ];
}

export function installMcpSnippet(options: InstallOptions): InstallFileResult {
  const target = path.join(options.root, ".scopekit", "mcp-config.example.json");
  const content = `${JSON.stringify(MCP_CONFIG_EXAMPLE, null, 2)}\n`;
  return writeFileResult(options.root, target, content, options);
}

export type AssistantTarget = "cursor" | "codex" | "claude" | "mcp";

export function installAssistant(target: AssistantTarget, options: InstallOptions): InstallFileResult[] {
  switch (target) {
    case "cursor":
      return [installCursorRule(options)];
    case "codex":
      return [installCodexAgents(options)];
    case "claude":
      return [installClaudeInstructions(options)];
    case "mcp":
      return [installMcpSnippet(options)];
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

export function formatInstallSummary(results: InstallFileResult[]): string[] {
  return results.map((result) => {
    const prefix = result.action === "dry-run" ? "○" : "✓";
    const verb =
      result.action === "created"
        ? "created"
        : result.action === "updated"
          ? "updated"
          : result.action === "dry-run"
            ? "would write"
            : "skipped";
    return `${prefix} ${verb}: ${result.relativePath}`;
  });
}
