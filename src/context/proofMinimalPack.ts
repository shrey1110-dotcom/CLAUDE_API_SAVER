import { getConfig } from "../config.js";
import { capByBudget } from "../shared/budget.js";
import {
  collectAuthFixtureAnchorFiles,
  collectImpactAnalysisAnchors,
  collectOnboardingAnchorFiles,
  collectRootManifestFiles,
  collectTestHarnessFiles,
  isImpactNoiseTestPath,
  type TaskIntent,
} from "./taskIntent.js";
import type { ContextPackResult, ContextStatus } from "./types.js";

const PROOF_NOISE_PATH_RE = /(?:^docs\/|^src\/ab\/|^src\/taskProfiles\/|\/proofs\/|edge-symbols-project)/i;

export type AuthSemanticCategory =
  | "auth_login_flow"
  | "session_store_or_validation"
  | "api_auth_entrypoint"
  | "api_session_entrypoint"
  | "frontend_login_ui";

export interface AuthSelectionTrace {
  path: string;
  category: AuthSemanticCategory | "normal_ranking";
  matchedSignals: string[];
  score: number;
  selectedBy: "category_coverage" | "normal_ranking";
  beforeBudgetCap: boolean;
}

export interface FileSignalContext {
  path: string;
  pathLower: string;
  basename: string;
  symbols: Array<{ name: string; kind?: string }>;
  reason: string;
}

interface SemanticCategoryDef {
  id: AuthSemanticCategory;
  reason: string;
  minScore: number;
  score: (ctx: FileSignalContext) => { score: number; signals: string[] };
}

const AUTH_SEMANTIC_CATEGORIES: SemanticCategoryDef[] = [
  {
    id: "auth_login_flow",
    reason: "login/authentication flow",
    minScore: 14,
    score: (ctx) => {
      const signals: string[] = [];
      let score = 0;
      if (/login|signin|sign-in|authenticate|authorize|auth|access/i.test(ctx.path)) {
        score += 22;
        signals.push("path:login/auth terms");
      }
      if (/\/auth\//i.test(ctx.path)) {
        score += 14;
        signals.push("path:auth directory");
      }
      for (const sym of ctx.symbols) {
        if (/login|signin|authenticate|authorize|auth/i.test(sym.name)) {
          score += 12;
          signals.push(`symbol:${sym.name}`);
        }
      }
      if (/password|credential|user authentication|token creation/i.test(ctx.reason)) {
        score += 8;
        signals.push("reason:auth content hint");
      }
      return { score, signals };
    },
  },
  {
    id: "session_store_or_validation",
    reason: "session/token persistence or validation",
    minScore: 14,
    score: (ctx) => {
      const signals: string[] = [];
      let score = 0;
      if (/session|token|jwt|cookie/i.test(ctx.path)) {
        score += 22;
        signals.push("path:session/token terms");
      }
      for (const sym of ctx.symbols) {
        if (/session|token|validate|createSession|getSession|jwt|cookie/i.test(sym.name)) {
          score += 12;
          signals.push(`symbol:${sym.name}`);
        }
      }
      if (/session persistence|session validation|token store/i.test(ctx.reason)) {
        score += 8;
        signals.push("reason:session content hint");
      }
      return { score, signals };
    },
  },
  {
    id: "api_auth_entrypoint",
    reason: "API auth route/controller entry",
    minScore: 16,
    score: (ctx) => {
      const signals: string[] = [];
      let score = 0;
      const apiShape = /controller|route|handler|endpoint|middleware/i.test(ctx.path);
      const authShape = /auth|login|signin|sign-in|access/i.test(ctx.path);
      if (apiShape && authShape) {
        score += 28;
        signals.push("path:api-shape+auth");
      } else if (apiShape && ctx.symbols.some((s) => /auth|login|signin|access/i.test(s.name))) {
        score += 20;
        signals.push("path:api-shape+auth symbol");
      }
      if (/packages\/api|\/api\//i.test(ctx.path) && authShape) {
        score += 10;
        signals.push("path:api package");
      }
      return { score, signals };
    },
  },
  {
    id: "api_session_entrypoint",
    reason: "API session/token service entry",
    minScore: 16,
    score: (ctx) => {
      const signals: string[] = [];
      let score = 0;
      const apiShape = /controller|route|handler|service|endpoint/i.test(ctx.path);
      const sessionShape = /session|token|jwt/i.test(ctx.path);
      if (apiShape && sessionShape) {
        score += 28;
        signals.push("path:api-shape+session");
      } else if (/service|store/i.test(ctx.path) && sessionShape) {
        score += 22;
        signals.push("path:service+session");
      }
      for (const sym of ctx.symbols) {
        if (/session|token|validate/i.test(sym.name) && apiShape) {
          score += 10;
          signals.push(`symbol:${sym.name}`);
        }
      }
      return { score, signals };
    },
  },
  {
    id: "frontend_login_ui",
    reason: "frontend login/sign-in UI component",
    minScore: 14,
    score: (ctx) => {
      const signals: string[] = [];
      let score = 0;
      if (/\.(tsx|jsx)$/i.test(ctx.path)) {
        score += 12;
        signals.push("path:tsx/jsx component");
      }
      if (/login|signin|sign-in|auth/i.test(ctx.path)) {
        score += 18;
        signals.push("path:login UI terms");
      }
      for (const sym of ctx.symbols) {
        if (/login|signin|auth|page|view|component/i.test(sym.name)) {
          score += 10;
          signals.push(`symbol:${sym.name}`);
        }
        if (sym.kind && /component|function/i.test(sym.kind)) {
          score += 4;
          signals.push(`kind:${sym.kind}`);
        }
      }
      return { score, signals };
    },
  },
];

let lastAuthSelectionTrace: AuthSelectionTrace[] = [];

export function getLastAuthProofSelectionTrace(): AuthSelectionTrace[] {
  return lastAuthSelectionTrace.map((entry) => ({ ...entry }));
}

export function clearAuthProofSelectionTrace(): void {
  lastAuthSelectionTrace = [];
}

function buildFileSignalContext(
  file: ContextPackResult["files"][number],
  symbols: ContextPackResult["symbols"],
): FileSignalContext {
  const pathValue = file.path;
  const basename = pathValue.split("/").pop() ?? pathValue;
  return {
    path: pathValue,
    pathLower: pathValue.toLowerCase(),
    basename,
    symbols: symbols.filter((symbol) => symbol.path === pathValue).map((symbol) => ({ name: symbol.name, kind: symbol.kind })),
    reason: file.reason,
  };
}

export function scoreFileSemanticCategories(
  file: ContextPackResult["files"][number],
  symbols: ContextPackResult["symbols"],
): Array<{ category: AuthSemanticCategory; score: number; signals: string[]; reason: string }> {
  const ctx = buildFileSignalContext(file, symbols);
  return AUTH_SEMANTIC_CATEGORIES.map((def) => {
    const result = def.score(ctx);
    return { category: def.id, score: result.score, signals: result.signals, reason: def.reason };
  }).sort((a, b) => b.score - a.score);
}

function bestCategoryForFile(
  file: ContextPackResult["files"][number],
  symbols: ContextPackResult["symbols"],
): { category: AuthSemanticCategory; score: number; signals: string[]; reason: string } | null {
  const ranked = scoreFileSemanticCategories(file, symbols);
  const best = ranked[0];
  const def = AUTH_SEMANTIC_CATEGORIES.find((entry) => entry.id === best.category);
  if (!best || !def || best.score < def.minScore) return null;
  return { category: best.category, score: best.score, signals: best.signals, reason: def.reason };
}

function semanticRelevanceScore(file: ContextPackResult["files"][number], symbols: ContextPackResult["symbols"]): number {
  const best = bestCategoryForFile(file, symbols);
  return best ? best.score + file.score * 0.25 : 0;
}

function ensureSemanticAuthCoverage(
  files: ContextPackResult["files"],
  pool: ContextPackResult["files"],
  symbols: ContextPackResult["symbols"],
  trace: AuthSelectionTrace[],
): ContextPackResult["files"] {
  const selected = [...files];
  const seen = new Set(selected.map((file) => file.path));
  const covered = new Set<AuthSemanticCategory>();

  for (const file of selected) {
    const best = bestCategoryForFile(file, symbols);
    if (best) covered.add(best.category);
  }

  for (const def of AUTH_SEMANTIC_CATEGORIES) {
    if (covered.has(def.id)) continue;
    const candidates = pool
      .filter((file) => !PROOF_NOISE_PATH_RE.test(file.path))
      .map((file) => {
        const ctx = buildFileSignalContext(file, symbols);
        const result = def.score(ctx);
        return { file, score: result.score, signals: result.signals };
      })
      .filter((entry) => entry.score >= def.minScore)
      .sort((a, b) => b.score - a.score);

    const candidate = candidates[0];
    if (candidate && !seen.has(candidate.file.path)) {
      seen.add(candidate.file.path);
      covered.add(def.id);
      selected.push({
        ...candidate.file,
        reason: `${def.id}: ${def.reason}`,
        score: Math.max(candidate.file.score, candidate.score, 80),
      });
      trace.push({
        path: candidate.file.path,
        category: def.id,
        matchedSignals: candidate.signals,
        score: candidate.score,
        selectedBy: "category_coverage",
        beforeBudgetCap: true,
      });
    }
  }

  return selected.sort((a, b) => b.score - a.score);
}

export function isProofMinimalMode(): boolean {
  return getConfig().contextPackMinimal;
}

export function compactContextStatus(status: ContextStatus): ContextStatus {
  if (!isProofMinimalMode()) return status;
  return {
    graphExists: status.graphExists,
    capsulesExist: status.capsulesExist,
    capsuleCount: status.capsuleCount,
    graphNodeCount: 0,
    graphEdgeCount: 0,
    suggestedCommands: status.suggestedCommands,
  };
}

function mergePoolFiles(
  pool: ContextPackResult["files"],
  additions: Array<{ path: string; reason: string; score: number }>,
): ContextPackResult["files"] {
  const merged = [...pool];
  const seen = new Set(merged.map((file) => file.path));
  for (const file of additions) {
    if (PROOF_NOISE_PATH_RE.test(file.path) || seen.has(file.path)) continue;
    seen.add(file.path);
    merged.push(file);
  }
  return merged;
}

function slimGeneralSkillProofPack(
  pack: ContextPackResult,
  intent: TaskIntent,
  task: string,
  root?: string,
  filePool?: ContextPackResult["files"],
): ContextPackResult {
  const config = getConfig();
  const maxFiles =
    intent === "onboarding"
      ? Math.max(config.contextPackMaxFiles, 9)
      : intent === "impact_analysis"
        ? Math.max(config.contextPackMaxFiles, 8)
        : intent === "session_edit"
          ? Math.max(config.contextPackMaxFiles, 7)
          : intent === "edit_planning"
            ? Math.max(config.contextPackMaxFiles, 8)
            : intent === "architecture"
              ? Math.max(config.contextPackMaxFiles, 10)
              : config.contextPackMaxFiles;
  let pool = (filePool ?? pack.files).filter(
    (file) => !PROOF_NOISE_PATH_RE.test(file.path) && !isImpactNoiseTestPath(file.path),
  );

  if (intent === "onboarding") {
    pool = mergePoolFiles(pool, collectOnboardingAnchorFiles(root));
    pool = mergePoolFiles(pool, collectAuthFixtureAnchorFiles(root));
  }
  if (intent === "impact_analysis") {
    pool = mergePoolFiles(pool, collectAuthFixtureAnchorFiles(root));
    pool = mergePoolFiles(pool, collectImpactAnalysisAnchors(root));
    pool = mergePoolFiles(pool, collectRootManifestFiles(task, root));
  }
  if (intent === "session_edit") {
    pool = mergePoolFiles(pool, collectAuthFixtureAnchorFiles(root));
    pool = mergePoolFiles(pool, collectImpactAnalysisAnchors(root));
    pool = pool.filter((file) => !/non-node-project|edge-symbols/i.test(file.path));
  }

  const files = pool.sort((a, b) => b.score - a.score).slice(0, maxFiles);
  const filePathSet = new Set(files.map((file) => file.path));
  const symbols = pack.symbols
    .filter((symbol) => symbol.path && filePathSet.has(symbol.path))
    .slice(0, config.contextPackMaxSymbols);

  const slim: ContextPackResult = {
    task: pack.task,
    mode: pack.mode,
    budgetTokens: config.contextPackBudgetTokens,
    summary: `Skill pack: ${files.length} files, ${symbols.length} symbols.`,
    files,
    symbols,
    nextSteps: ["Answer from listed files and symbols only."],
    needsFullFileRead: false,
    truncated: pack.truncated,
    generatedAt: pack.generatedAt,
  };
  const capped = capByBudget(slim, config.contextPackBudgetTokens);
  const result = { ...(capped.payload as ContextPackResult), truncated: capped.truncated || slim.truncated };
  result.estimatedOutputTokens = Math.ceil(capped.charCount / 4);
  return result;
}

export function slimSkillProofPack(
  pack: ContextPackResult,
  intent: TaskIntent,
  task: string,
  root?: string,
  filePool?: ContextPackResult["files"],
): ContextPackResult {
  if (!isProofMinimalMode()) return pack;
  if (intent === "auth_focus") {
    return slimAuthProofPack(pack, intent, task, root, filePool);
  }
  return slimGeneralSkillProofPack(pack, intent, task, root, filePool);
}

export function slimAuthProofPack(
  pack: ContextPackResult,
  intent: TaskIntent,
  task: string,
  root?: string,
  filePool?: ContextPackResult["files"],
): ContextPackResult {
  if (!isProofMinimalMode() || intent !== "auth_focus") {
    return pack;
  }

  const config = getConfig();
  const maxFiles = config.contextPackMaxFiles;
  void task;
  void root;

  const trace: AuthSelectionTrace[] = [];
  const pool = (filePool ?? pack.files).filter((file) => !PROOF_NOISE_PATH_RE.test(file.path));
  const semanticPool = pool
    .map((file) => ({ file, relevance: semanticRelevanceScore(file, pack.symbols) }))
    .filter((entry) => entry.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);

  let files =
    semanticPool.length > 0
      ? semanticPool.slice(0, maxFiles).map((entry) => {
          const best = bestCategoryForFile(entry.file, pack.symbols);
          const reason = best ? `${best.category}: ${best.reason}` : entry.file.reason;
          trace.push({
            path: entry.file.path,
            category: best?.category ?? "normal_ranking",
            matchedSignals: best?.signals ?? [],
            score: entry.relevance,
            selectedBy: "normal_ranking",
            beforeBudgetCap: true,
          });
          return { ...entry.file, reason, score: Math.max(entry.file.score, entry.relevance) };
        })
      : pool
          .slice(0, maxFiles)
          .map((file) => {
            trace.push({
              path: file.path,
              category: "normal_ranking",
              matchedSignals: [],
              score: file.score,
              selectedBy: "normal_ranking",
              beforeBudgetCap: true,
            });
            return file;
          });

  files = ensureSemanticAuthCoverage(
    files.filter((file) => !PROOF_NOISE_PATH_RE.test(file.path)).sort((a, b) => b.score - a.score),
    pool,
    pack.symbols,
    trace,
  ).slice(0, maxFiles);

  lastAuthSelectionTrace = trace;

  const filePathSet = new Set(files.map((f) => f.path));
  const symbols = pack.symbols
    .filter((symbol) => symbol.path && filePathSet.has(symbol.path))
    .slice(0, config.contextPackMaxSymbols);

  const slim: ContextPackResult = {
    task: pack.task,
    mode: pack.mode,
    budgetTokens: config.contextPackBudgetTokens,
    summary: `Auth/session pack: ${files.length} files, ${symbols.length} symbols.`,
    files,
    symbols,
    nextSteps: ["Answer from listed files and symbols only."],
    needsFullFileRead: false,
    truncated: pack.truncated,
    generatedAt: pack.generatedAt,
  };

  const capped = capByBudget(slim, config.contextPackBudgetTokens);
  const result = { ...(capped.payload as ContextPackResult), truncated: capped.truncated || slim.truncated };
  result.estimatedOutputTokens = Math.ceil(capped.charCount / 4);
  return result;
}
