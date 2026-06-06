import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const LOCKED_CLAUDE_CONFIG = "examples/claude-code/ab/context-broker-locked.mcp.json";
export const NO_MCP_CLAUDE_CONFIG = "examples/claude-code/ab/no-mcp.mcp.json";

export interface ClaudeProbeResult {
  bin: string;
  found: boolean;
  onPath: boolean;
  version?: string;
  error?: string;
}

export function printClaudeNotFoundHints(claudeBin: string): void {
  console.error("Claude CLI was not found.");
  console.error(`Attempted binary: ${claudeBin}`);
  console.error("Run: which claude");
  console.error("Or pass: --claude-bin /absolute/path/to/claude");
  console.error("You must run this on a machine with Claude Code CLI installed.");
}

export function isClaudeSpawnError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function resolveClaudeOnPath(): { onPath: boolean; resolvedPath?: string } {
  const which = spawnSync("which", ["claude"], { encoding: "utf8" });
  if (which.status === 0) {
    const resolvedPath = which.stdout.trim();
    if (resolvedPath.length > 0) {
      return { onPath: true, resolvedPath };
    }
  }
  return { onPath: false };
}

export function probeClaudeBin(bin: string): ClaudeProbeResult {
  const trimmed = bin.trim();
  if (!trimmed) {
    return { bin: trimmed, found: false, onPath: false, error: "empty binary path" };
  }

  const hasPathSep = trimmed.includes("/") || trimmed.includes("\\");
  if (hasPathSep && !fs.existsSync(trimmed)) {
    return { bin: trimmed, found: false, onPath: false, error: `path does not exist: ${trimmed}` };
  }

  const versionRun = spawnSync(trimmed, ["--version"], { encoding: "utf8", timeout: 15_000 });
  if (versionRun.error && isClaudeSpawnError(versionRun.error)) {
    return { bin: trimmed, found: false, onPath: false, error: "ENOENT" };
  }
  if (versionRun.status !== 0) {
    const detail = `${versionRun.stderr ?? ""}${versionRun.stdout ?? ""}`.trim() || `exit ${versionRun.status}`;
    return { bin: trimmed, found: false, onPath: false, error: detail };
  }

  const version = `${versionRun.stdout ?? ""}${versionRun.stderr ?? ""}`.trim() || "unknown";
  const onPath =
    resolveClaudeOnPath().resolvedPath === trimmed || (!hasPathSep && trimmed === "claude" && resolveClaudeOnPath().onPath);
  return { bin: trimmed, found: true, onPath, version };
}

export function lockedRepeatCommand(repoRoot = process.cwd(), claudeBin?: string): string {
  const binFlag = claudeBin ? ` --claude-bin ${claudeBin}` : "";
  return `AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes${binFlag}`;
}

export function buildLockedProofCommands(repoRoot: string, claudeBin?: string): string[] {
  const binFlag = claudeBin ? ` --claude-bin ${claudeBin}` : "";
  return [
    `cd ${repoRoot}`,
    "npm run build",
    "npm run graph:build",
    "npm run context:build",
    "npm run telemetry:clean",
    `AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes${binFlag}`,
    "npm run telemetry:clean",
    `AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes${binFlag}`,
    "npm run telemetry:report",
    "npm run ab:claude:ingest",
    "npm run ab:claude:report",
    "npm run ab:claude:real-check",
  ];
}

export function lockedConfigPath(repoRoot: string): string {
  return path.join(repoRoot, LOCKED_CLAUDE_CONFIG);
}

export function noMcpConfigPath(repoRoot: string): string {
  return path.join(repoRoot, NO_MCP_CLAUDE_CONFIG);
}
