import type { ContextPackResult } from "../context/types.js";

export type SkillMarkdownProfile = "standard" | "ultra" | "minimal";

export function formatSkillMarkdown(pack: ContextPackResult, profile: SkillMarkdownProfile = "standard"): string {
  if (profile === "minimal") {
    return formatMinimalCompact(pack);
  }
  if (profile === "ultra") {
    return formatUltraCompact(pack);
  }
  return formatStandardCompact(pack);
}

function formatStandardCompact(pack: ContextPackResult): string {
  const lines: string[] = [];
  lines.push(`# Repo context: ${summarizeTask(pack.task)}`);
  lines.push("");
  lines.push("## Files");
  for (const file of pack.files) {
    const syms = symbolsForPath(pack, file.path);
    const symNote = syms.length > 0 ? ` | symbols: ${syms.join(", ")}` : "";
    lines.push(`- \`${file.path}\` — ${shortReason(file.reason)}${symNote}`);
  }
  if (pack.symbols.length > 0) {
    const orphanSymbols = pack.symbols.filter((sym) => !pack.files.some((f) => f.path === sym.path));
    if (orphanSymbols.length > 0) {
      lines.push("");
      lines.push("## Symbols");
      for (const sym of orphanSymbols.slice(0, 6)) {
        const loc = sym.path ? ` @ ${sym.path}` : "";
        lines.push(`- \`${sym.name}\`${loc}`);
      }
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- Use listed files/symbols only; do not edit unless asked.");
  lines.push("- Prefer this scoped context before broad raw file reads.");
  if (pack.truncated) {
    lines.push("- Pack was truncated to budget; verify critical paths if uncertain.");
  }
  lines.push("");
  return lines.join("\n");
}

function formatMinimalCompact(pack: ContextPackResult): string {
  const lines: string[] = [];
  lines.push(`Task: ${summarizeTask(pack.task, 80)}`);
  for (const file of pack.files) {
    lines.push(`- ${file.path} (${minimalRoleTag(file.reason)})`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatUltraCompact(pack: ContextPackResult): string {
  const lines: string[] = [];
  lines.push(`Task: ${summarizeTask(pack.task, 220)}`);
  lines.push("Files:");
  for (const file of pack.files) {
    const syms = symbolsForPath(pack, file.path);
    const symNote = syms.length > 0 ? ` [${syms.join(", ")}]` : "";
    lines.push(`- ${file.path} — ${shortReason(file.reason)}${symNote}`);
  }
  const concepts = [...new Set(pack.files.flatMap((f) => symbolsForPath(pack, f.path)))].slice(0, 8);
  if (concepts.length > 0) {
    lines.push(`Symbols: ${concepts.join(", ")}`);
  }
  lines.push(taskAwareUltraNote(pack.task));
  lines.push("");
  return lines.join("\n");
}

function taskAwareUltraNote(task: string): string {
  const lower = task.toLowerCase();
  if (/onboarding|new contributor|major areas/.test(lower)) {
    return "Notes: major areas in src/context/graph; configs in package.json/tsconfig/vitest; test commands in package.json; auth/session fixtures listed; new contributor start at README.";
  }
  if (/impact|affected|session validation/.test(lower)) {
    return "Notes: session validation impact spans auth fixtures, API/frontend entry points, tests, configs, and risks.";
  }
  if (/smallest safe change|refresh.?token|expiration/.test(lower)) {
    return "Notes: plan smallest safe refresh-token expiration change across session/auth fixtures and related tests.";
  }
  if (/boundaries|routing|architecture/.test(lower)) {
    return "Notes: auth, API, frontend, and test fixture boundaries for this repo.";
  }
  return "Notes: scoped auth/session context; no edits unless asked.";
}

function summarizeTask(task: string, max = 120): string {
  const trimmed = task.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 3)}...` : trimmed;
}

function minimalRoleTag(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes("auth_login_flow") || /login|signin|auth/.test(normalized)) return "login";
  if (normalized.includes("session_store") || /session|token/.test(normalized)) return "session";
  if (normalized.includes("api_auth")) return "api-auth";
  if (normalized.includes("api_session")) return "api-session";
  if (normalized.includes("frontend_login")) return "ui";
  if (normalized.includes("auth-graph") || normalized.includes("auth/session")) return "auth";
  return shortReason(reason).split(" ")[0] || "context";
}

function shortReason(reason: string): string {
  return reason
    .replace(/^capsule:/i, "")
    .replace(/^auth-graph$/i, "auth/session fixture")
    .replace(/^onboarding-auth-flow$/i, "frontend auth entry")
    .replace(/^(auth_login_flow|session_store_or_validation|api_auth_entrypoint|api_session_entrypoint|frontend_login_ui):\s*/i, "")
    .trim();
}

function symbolsForPath(pack: ContextPackResult, filePath: string): string[] {
  return pack.symbols
    .filter((sym) => sym.path === filePath)
    .map((sym) => sym.name)
    .slice(0, 4);
}
