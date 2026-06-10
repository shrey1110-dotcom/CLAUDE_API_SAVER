import fs from "node:fs";
import path from "node:path";
import { IMPORTANT_CONFIG_FILES } from "../constants.js";
import { loadGraph } from "../graph/queryGraph.js";
import { resolveRoot } from "../pathSafety.js";
import type { ContextMode } from "./types.js";

export type TaskIntent = "auth_focus" | "impact_analysis" | "session_edit" | "onboarding" | "general";

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

const IMPACT_ANALYSIS_EXPANSIONS = [
  "session validation",
  "impact",
  "affected files",
  "related tests",
  "test harness",
  "configs",
  "package scripts",
  "dependencies",
  "api",
  "frontend",
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

const IMPACT_TEST_ANCHORS = ["tests/context.test.ts", "tests/tools.test.ts"];

function scoreAuthFixtureRelativePath(rel: string): number {
  const p = rel.toLowerCase().replace(/\\/g, "/");
  if (!p.startsWith("tests/fixtures/")) return 0;
  if (/\/auth\/login\.(ts|tsx|js)$/.test(p)) return 98;
  if (/\/auth\/session\.(ts|tsx|js)$/.test(p)) return 98;
  if (/auth\.controller\.(ts|js)$/.test(p)) return 96;
  if (/session\.service\.(ts|js)$/.test(p)) return 96;
  if (/loginpage\.(tsx|jsx)$/.test(p)) return 94;
  return 0;
}

export function collectAuthFixtureAnchorFiles(
  root?: string,
): Array<{ path: string; reason: string; score: number }> {
  const resolved = resolveRoot(root);
  const fixturesRoot = path.join(resolved, "tests/fixtures");
  if (!fs.existsSync(fixturesRoot)) return [];

  const selected: Array<{ path: string; reason: string; score: number }> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(resolved, full).replace(/\\/g, "/");
      const score = scoreAuthFixtureRelativePath(rel);
      if (score > 0) {
        selected.push({ path: rel, reason: "auth-session-fixture", score });
      }
    }
  };
  walk(fixturesRoot);
  return selected.sort((a, b) => b.score - a.score);
}

const ROOT_MANIFEST_TASK_PATTERN =
  /\b(configs?|scripts?|dependencies|package manager|package\.json|test impact|related tests?|tools?)\b/i;

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
  if (
    mode === "impact" ||
    /\bimpact\b|\baffected\b|likely affected|related tests?|session validation behavior changes/.test(lower)
  ) {
    return "impact_analysis";
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
      : intent === "impact_analysis"
        ? IMPACT_ANALYSIS_EXPANSIONS
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
  if (/session validation/.test(lower)) phrases.push("session validation");
  if (/\bimpact\b|likely affected|affected files/.test(lower)) phrases.push("impact analysis");
  if (/related tests?/.test(lower)) phrases.push("related tests");
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

  const resolved = resolveRoot(root);
  const terms = expandTaskTerms(task, detectTaskIntent(task));
  const lowerTask = task.toLowerCase();
  const wantsConfig = ROOT_MANIFEST_TASK_PATTERN.test(task);

  const selected: Array<{ path: string; reason: string; score: number }> = [];
  for (const node of graph.nodes) {
    if (node.type !== "file" || !node.path) continue;
    if (!TEST_HARNESS_PATTERNS.some((pattern) => pattern.test(node.path!))) continue;
    const rel = node.path;
    const p = rel.toLowerCase();
    let text = `${node.name} ${node.summary ?? ""} ${(node.tags ?? []).join(" ")}`.toLowerCase();
    try {
      text += ` ${fs.readFileSync(path.join(resolved, rel), "utf8").slice(0, 80_000).toLowerCase()}`;
    } catch {
      // Graph metadata is enough when the file cannot be read.
    }
    const termHits = terms.reduce((count, term) => (text.includes(term.toLowerCase()) || p.includes(term.toLowerCase()) ? count + 1 : count), 0);
    let score = 72 + Math.min(termHits * 4, 32);
    if (/auth|login|session/.test(text)) score += 12;
    if (/context_pack|buildcontextpack|context broker/.test(text)) score += 10;
    if (/getprojectcommands|searchcodetool|repomap|toolsforprofile/.test(text)) score += 10;
    if (wantsConfig && /package\.json|config|vitest|command|script/.test(text)) score += 10;
    if (/^tests\/[^/]+\.test\.ts$/.test(p)) score += 6;
    if (/\bcontext\b|\btools?\b/.test(lowerTask) && /(context|tools)\.test\.ts$/.test(p)) score += 8;
    selected.push({ path: rel, reason: "related-test-harness", score });
  }
  return selected.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 6);
}

export function collectImpactAnalysisAnchors(
  root?: string,
): Array<{ path: string; reason: string; score: number }> {
  const resolved = resolveRoot(root);
  const selected: Array<{ path: string; reason: string; score: number }> = [];
  for (const rel of IMPACT_TEST_ANCHORS) {
    if (!fs.existsSync(path.join(resolved, rel))) continue;
    selected.push({ path: rel, reason: "impact-test-anchor", score: 99 });
  }
  return selected;
}

export function isImpactNoiseTestPath(filePath: string): boolean {
  const p = filePath.toLowerCase();
  if (p === "tests/multimodal.test.ts") return true;
  if (/tests\/(claude|codex)adapter\.test\.ts$/.test(p)) return true;
  if (p.includes("codexqa.test.ts")) return true;
  return false;
}

export function collectRootManifestFiles(
  task: string,
  root?: string,
): Array<{ path: string; reason: string; score: number }> {
  if (!ROOT_MANIFEST_TASK_PATTERN.test(task)) return [];
  const resolved = resolveRoot(root);
  const selected: Array<{ path: string; reason: string; score: number }> = [];
  for (const rel of IMPORTANT_CONFIG_FILES) {
    if (!fs.existsSync(path.join(resolved, rel))) continue;
    const score = rel === "package.json" ? 96 : /tsconfig|vite|vitest|eslint|prettier/.test(rel) ? 84 : 76;
    selected.push({ path: rel, reason: "root-manifest", score });
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
  if (intent === "impact_analysis") return { docs: 0, assets: 0, concepts: 4 };
  if (intent === "auth_focus") return { docs: 3, assets: 2, concepts: 4 };
  return { docs: 5, assets: 4, concepts: 5 };
}
