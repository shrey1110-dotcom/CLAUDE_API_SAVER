import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const LOCKED_CODEX_CONFIG = "examples/codex/ab/context-broker-locked.config.toml";

export interface CodexProbeResult {
  bin: string;
  found: boolean;
  onPath: boolean;
  version?: string;
  error?: string;
}

export function printCodexNotFoundHints(codexBin: string): void {
  console.error("Codex CLI was not found.");
  console.error(`Attempted binary: ${codexBin}`);
  console.error("Run: which codex");
  console.error("Or pass: --codex-bin /absolute/path/to/codex");
  console.error("You must run this on a machine with Codex CLI installed.");
}

export function isCodexSpawnError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function resolveCodexOnPath(): { onPath: boolean; resolvedPath?: string } {
  const which = spawnSync("which", ["codex"], { encoding: "utf8" });
  if (which.status === 0) {
    const resolvedPath = which.stdout.trim();
    if (resolvedPath.length > 0) {
      return { onPath: true, resolvedPath };
    }
  }
  return { onPath: false };
}

export function probeCodexBin(bin: string): CodexProbeResult {
  const trimmed = bin.trim();
  if (!trimmed) {
    return { bin: trimmed, found: false, onPath: false, error: "empty binary path" };
  }

  const hasPathSep = trimmed.includes("/") || trimmed.includes("\\");
  if (hasPathSep && !fs.existsSync(trimmed)) {
    return { bin: trimmed, found: false, onPath: false, error: `path does not exist: ${trimmed}` };
  }

  const versionRun = spawnSync(trimmed, ["--version"], { encoding: "utf8", timeout: 15_000 });
  if (versionRun.error && isCodexSpawnError(versionRun.error)) {
    return { bin: trimmed, found: false, onPath: false, error: "ENOENT" };
  }
  if (versionRun.status !== 0) {
    const detail = `${versionRun.stderr ?? ""}${versionRun.stdout ?? ""}`.trim() || `exit ${versionRun.status}`;
    return { bin: trimmed, found: false, onPath: false, error: detail };
  }

  const version = `${versionRun.stdout ?? ""}${versionRun.stderr ?? ""}`.trim() || "unknown";
  const onPath = resolveCodexOnPath().resolvedPath === trimmed || (!hasPathSep && trimmed === "codex" && resolveCodexOnPath().onPath);
  return { bin: trimmed, found: true, onPath, version };
}

export function lockedRepeatCommand(repoRoot = process.cwd(), codexBin?: string): string {
  const binFlag = codexBin ? ` --codex-bin ${codexBin}` : "";
  return `AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes${binFlag}`;
}

export function buildLockedProofCommands(repoRoot: string, codexBin?: string): string[] {
  const binFlag = codexBin ? ` --codex-bin ${codexBin}` : "";
  return [
    `cd ${repoRoot}`,
    "npm run build",
    "npm run graph:build",
    "npm run context:build",
    "npm run telemetry:clean",
    `AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes${binFlag}`,
    "npm run telemetry:report",
    "npm run ab:ingest-codex",
    "npm run ab:report",
    "npm run ab:compare",
    "npm run ab:proof-report",
    "npm run ab:real-check",
  ];
}

export function lockedConfigPath(repoRoot: string): string {
  return path.join(repoRoot, LOCKED_CODEX_CONFIG);
}
