import fs from "node:fs";
import path from "node:path";

const CURSOR_RULE_BEGIN = "<!-- repo-context:begin -->";
const CURSOR_RULE_END = "<!-- repo-context:end -->";
const AGENTS_BEGIN = "<!-- repo-context:begin -->";
const AGENTS_END = "<!-- repo-context:end -->";
const CLAUDE_BEGIN = "<!-- repo-context:begin -->";
const CLAUDE_END = "<!-- repo-context:end -->";

const CURSOR_RULE_BODY = `---
description: Use repo-context CLI for scoped repo questions before broad file reads.
globs:
alwaysApply: true
---

# repo-context skill (CLI-first)

repo-context is a coding-agent context skill. MCP is optional.

For repo questions, run:

\`\`\`bash
repo-context query "<question>"
\`\`\`

For compact markdown context:

\`\`\`bash
repo-context pack "<question>" --budget 500 --format markdown
\`\`\`

Prefer scoped repo-context output before broad raw file reads. Do not edit files unless asked. MCP is optional; CLI mode is the default.
`;

const AGENTS_SECTION = `## repo-context skill (CLI-first)

repo-context generates task-specific context packs for coding assistants. MCP is optional.

- Index once: \`repo-context index .\`
- Query: \`repo-context query "<question>"\`
- Pack: \`repo-context pack "<question>" --budget 500 --format markdown\`
- Status: \`repo-context status\`
- MCP (optional): \`repo-context mcp\`

Prefer repo-context scoped output before broad raw file reads. Do not edit files unless asked.
`;

const CLAUDE_SECTION = `## repo-context skill (CLI-first)

Use the repo-context CLI before broad repository reads:

\`\`\`bash
repo-context query "<question>"
repo-context pack "<question>" --budget 500 --format markdown --out .repo-context/context.md
\`\`\`

MCP is optional (\`repo-context mcp\`). CLI/skill mode is the default workflow.
`;

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

export function installCursorRule(repoRoot: string): string {
  const target = path.join(repoRoot, ".cursor", "rules", "repo-context.mdc");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const next = upsertMarkedSection(existing, CURSOR_RULE_BEGIN, CURSOR_RULE_END, CURSOR_RULE_BODY);
  fs.writeFileSync(target, next, "utf8");
  return target;
}

export function installCodexAgents(repoRoot: string): string {
  const candidates = [path.join(repoRoot, "AGENTS.md"), path.join(repoRoot, "docs", "agent-instructions", "AGENTS.md")];
  const target = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "# AGENTS\n";
  const next = upsertMarkedSection(existing, AGENTS_BEGIN, AGENTS_END, AGENTS_SECTION);
  fs.writeFileSync(target, next, "utf8");
  return target;
}

export function installClaudeInstructions(repoRoot: string): string {
  const target = path.join(repoRoot, "docs", "agent-instructions", "repo-context-claude.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "# repo-context for Claude Code\n";
  const next = upsertMarkedSection(existing, CLAUDE_BEGIN, CLAUDE_END, CLAUDE_SECTION);
  fs.writeFileSync(target, next, "utf8");
  return target;
}

export function installAssistant(target: "cursor" | "codex" | "claude", repoRoot: string): string {
  if (target === "cursor") return installCursorRule(repoRoot);
  if (target === "codex") return installCodexAgents(repoRoot);
  return installClaudeInstructions(repoRoot);
}
