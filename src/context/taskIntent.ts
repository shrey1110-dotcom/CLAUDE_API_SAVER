import fs from "node:fs";
import path from "node:path";
import { IMPORTANT_CONFIG_FILES } from "../constants.js";
import { loadGraph } from "../graph/queryGraph.js";
import { resolveRoot } from "../pathSafety.js";
import type { ContextMode } from "./types.js";

export type TaskIntent = "auth_focus" | "session_edit" | "onboarding" | "general";

export const AUTH_TERMS = ["auth", "authentication", "login", "session"];
export const AUTH_EXPANSIONS = [
  "user session",
  "auth controller",
  "session service",
  "login page",
  "validate login",
  "create session",
];

const SESSION_EDIT_EXPANSIONS = [
  "refresh token",
  "token expiration",
  "session",
  "login",
  "auth",
  "smallest safe change",
  "tests",
  "risk",
];

const ONBOARDING_EXPANSIONS = [
  "onboarding",
  "major areas",
  "configs",
  "test commands",
  "npm run",
  "contributor",
  "context broker",
  "graph build",
  "telemetry",
];

const ONBOARDING_ANCHOR_PATHS = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "src/index.ts",
  "src/context/broker.ts",
  "src/graph/buildGraph.ts",
];

const TEST_HARNESS_PATTERNS = [/^tests\/[^/]+\.test\.ts$/];

export function normalizeTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function detectTaskIntent(task: string, mode?: ContextMode): TaskIntent {
  const lower = task.toLowerCase();
  if (/\bonboarding\b|new contributor|major areas|where a new contributor/.test(lower)) {
    return "onboarding";
  }
  if (
    mode === "edit" &&
    (/\brefresh[\s-]?token\b|\bexpiration\b|\bexpiry\b/.test(lower) || /\btoken\b/.test(lower))
  ) {
    return "session_edit";
  }
  const terms = normalizeTerms(task);
  if (terms.some((term) => AUTH_TERMS.includes(term))) {
    return "auth_focus";
  }
  return "general";
}

export function expandTaskTerms(task: string, intent: TaskIntent): string[] {
  const base = normalizeTerms(task);
  const phrases = extractTaskPhrases(task);
  const extra =
    intent === "auth_focus"
      ? AUTH_EXPANSIONS
      : intent === "session_edit"
        ? SESSION_EDIT_EXPANSIONS
        : intent === "onboarding"
          ? ONBOARDING_EXPANSIONS
          : [];
  return [...new Set([...base, ...phrases.flatMap((p) => normalizeTerms(p)), ...extra.flatMap((p) => normalizeTerms(p)), ...phrases])];
}

export function extractTaskPhrases(task: string): string[] {
  const phrases: string[] = [];
  const lower = task.toLowerCase();
  if (/refresh[\s-]?token/.test(lower)) phrases.push("refresh token");
  if (/auth\/session/.test(lower)) phrases.push("auth/session flow");
  if (/smallest safe change/.test(lower)) phrases.push("smallest safe change");
  if (/test commands/.test(lower)) phrases.push("test commands");
  if (/major areas/.test(lower)) phrases.push("major areas");
  if (/\bonboarding\b/.test(lower)) phrases.push("onboarding");
  if (/\bexpiration\b|\bexpiry\b/.test(lower)) phrases.push("expiration");
  return phrases;
}

export function extractTaskConcepts(task: string): Array<{ name: string; reason: string; score: number }> {
  return extractTaskPhrases(task).map((name) => ({
    name,
    reason: "task phrase",
    score: 90,
  }));
}

export function shouldUseAuthCapsuleFilter(intent: TaskIntent): boolean {
  return intent === "auth_focus";
}

export function collectOnboardingAnchorFiles(
  root?: string,
): Array<{ path: string; reason: string; score: number }> {
  const resolved = resolveRoot(root);
  const anchors = [...ONBOARDING_ANCHOR_PATHS];
  for (const config of IMPORTANT_CONFIG_FILES) {
    if (!anchors.includes(config)) anchors.push(config);
  }
  const selected: Array<{ path: string; reason: string; score: number }> = [];
  for (const rel of anchors) {
    if (!fs.existsSync(path.join(resolved, rel))) continue;
    const score = rel === "README.md" || rel === "package.json" ? 98 : rel.startsWith("src/") ? 92 : 88;
    selected.push({ path: rel, reason: "onboarding-anchor", score });
  }
  return selected;
}

export function collectTestHarnessFiles(
  task: string,
  root?: string,
): Array<{ path: string; reason: string; score: number }> {
  if (!/\btests?\b/i.test(task)) return [];
  const graph = loadGraph(root);
  if (!graph) return [];

  const selected: Array<{ path: string; reason: string; score: number }> = [];
  for (const node of graph.nodes) {
    if (node.type !== "file" || !node.path) continue;
    if (!TEST_HARNESS_PATTERNS.some((pattern) => pattern.test(node.path!))) continue;
    selected.push({ path: node.path, reason: "test-harness", score: 80 });
  }
  return selected.sort((a, b) => b.score - a.score).slice(0, 4);
}

export function isLowValuePackPath(filePath: string): boolean {
  const p = filePath.toLowerCase();
  if (p === "." || p === "docs" || p === "changelog.md") return true;
  if (p.startsWith("docs/ab-test-templates/")) return true;
  if (p.startsWith("docs/benchmarks/") && !p.includes("readme")) return true;
  if (p.includes("edge-symbols-project")) return true;
  return false;
}

export function multimodalLimits(intent: TaskIntent): { docs: number; assets: number; concepts: number } {
  if (intent === "onboarding") return { docs: 2, assets: 1, concepts: 4 };
  if (intent === "session_edit") return { docs: 1, assets: 0, concepts: 4 };
  if (intent === "auth_focus") return { docs: 3, assets: 2, concepts: 4 };
  return { docs: 5, assets: 4, concepts: 5 };
}
