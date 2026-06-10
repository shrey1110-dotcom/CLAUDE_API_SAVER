import { spawnSync } from "node:child_process";
import { getConfig } from "../config.js";
import { clampBudgetTokens, capByBudget } from "../shared/budget.js";
import { getGraphStatus, loadGraph, queryGraph } from "../graph/queryGraph.js";
import { getProjectCommands } from "../tools/getProjectCommands.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { getGraphCachePaths } from "../graph/paths.js";
import { findCapsuleForTask, loadCapsules, loadContextManifest } from "./loadContext.js";
import { rankMultimodalForTask } from "./multimodalRank.js";
import {
  AUTH_EXPANSIONS,
  collectImpactAnalysisAnchors,
  collectOnboardingAnchorFiles,
  collectRootManifestFiles,
  collectTestHarnessFiles,
  isImpactNoiseTestPath,
  detectTaskIntent,
  expandTaskTerms,
  extractTaskConcepts,
  isLowValuePackPath,
  multimodalLimits,
  normalizeTerms,
  shouldUseAuthCapsuleFilter,
  type TaskIntent,
} from "./taskIntent.js";
import { compactContextStatus, isProofMinimalMode, slimSkillProofPack } from "./proofMinimalPack.js";
import type { ContextMode, ContextPackResult, ContextStatus, ImpactPackResult } from "./types.js";

function shouldBoostAuthFiles(intent: TaskIntent): boolean {
  return intent === "auth_focus" || intent === "impact_analysis" || intent === "session_edit";
}

function authSemanticBucket(path: string): "login_flow" | "session_flow" | "api_auth" | "api_session" | "frontend" | "other" {
  const p = path.toLowerCase();
  if (/\.(tsx|jsx)$/.test(p) && /login|signin|sign-in|auth/i.test(p)) return "frontend";
  if (/(controller|route|handler|endpoint)/.test(p) && /auth|login|signin|sign-in|access/i.test(p)) return "api_auth";
  if (/(service|store|repository)/.test(p) && /session|token|jwt/i.test(p)) return "api_session";
  if (/session|token|jwt|cookie/i.test(p)) return "session_flow";
  if (/login|signin|sign-in|auth|access/i.test(p)) return "login_flow";
  return "other";
}

function authPathScore(path: string, text: string): number {
  const p = path.toLowerCase();
  let score = 0;
  if (/\/auth\//.test(p)) score += 35;
  if (/login|signin|sign-in|session|auth|token|access/i.test(p)) score += 30;
  if (/controller|service|handler|route|endpoint/i.test(p)) score += 12;
  if (/\.(tsx|jsx)$/.test(p) && /login|signin|sign-in|auth/i.test(p)) score += 18;
  if (/auth|login|session|token|signin|authenticate/i.test(text)) score += 8;
  return score;
}

function collectAuthGraphFiles(
  task: string,
  root: string | undefined,
  maxFiles: number,
  intent: TaskIntent,
): Array<{ path: string; reason: string; score: number }> {
  const graph = loadGraph(root);
  if (!graph) return [];

  const terms = expandTaskTerms(task, intent);
  const authTerms = [...terms, ...AUTH_EXPANSIONS.flatMap((item) => normalizeTerms(item))];
  const termSet = new Set(authTerms);
  const candidates = graph.nodes
    .filter((node) => node.type === "file" && typeof node.path === "string")
    .map((node) => {
      const path = node.path!;
      const text = `${node.name} ${node.summary ?? ""} ${(node.tags ?? []).join(" ")}`.toLowerCase();
      const termHits = authTerms.reduce((count, term) => (text.includes(term) || path.toLowerCase().includes(term) ? count + 1 : count), 0);
      const score = authPathScore(path, text) + Math.min(termHits * 5, 25);
      return { path, score, reason: "auth-graph" as const };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ path: string; reason: string; score: number }> = [];
  const seen = new Set<string>();
  const areaLimits: Record<ReturnType<typeof authSemanticBucket>, number> = {
    login_flow: 2,
    session_flow: 2,
    api_auth: 2,
    api_session: 2,
    frontend: 2,
    other: maxFiles,
  };
  const areaCounts: Record<ReturnType<typeof authSemanticBucket>, number> = {
    login_flow: 0,
    session_flow: 0,
    api_auth: 0,
    api_session: 0,
    frontend: 0,
    other: 0,
  };

  for (const candidate of candidates) {
    const area = authSemanticBucket(candidate.path);
    if (seen.has(candidate.path) || areaCounts[area] >= areaLimits[area]) continue;
    if (
      !candidate.path.toLowerCase().includes("auth") &&
      !candidate.path.toLowerCase().includes("login") &&
      !candidate.path.toLowerCase().includes("session") &&
      [...termSet].every((term) => !candidate.path.toLowerCase().includes(term))
    ) {
      continue;
    }
    seen.add(candidate.path);
    areaCounts[area] += 1;
    selected.push(candidate);
    if (selected.length >= maxFiles) break;
  }

  if (selected.length < maxFiles) {
    for (const candidate of candidates) {
      if (seen.has(candidate.path)) continue;
      seen.add(candidate.path);
      selected.push(candidate);
      if (selected.length >= maxFiles) break;
    }
  }

  return selected;
}

export function getContextStatus(root?: string): ContextStatus {
  const graph = getGraphStatus(root);
  const manifest = loadContextManifest(root);
  const capsules = loadCapsules(root);
  const suggestedCommands: string[] = [];

  if (!graph.exists) suggestedCommands.push("npm run graph:build");
  if (!capsules?.length) suggestedCommands.push("npm run context:build");

  const status: ContextStatus = {
    graphExists: graph.exists,
    capsulesExist: Boolean(capsules?.length),
    capsuleCount: capsules?.length ?? 0,
    lastBuildTime: manifest?.generatedAt,
    graphNodeCount: graph.nodeCount,
    graphEdgeCount: graph.edgeCount,
    suggestedCommands,
  };
  return compactContextStatus(status);
}

export function buildContextPack(input: {
  task: string;
  root?: string;
  mode?: ContextMode;
  budgetTokens?: number;
}): ContextPackResult {
  const mode = input.mode ?? "discovery";
  const cfg = getConfig();
  const defaultBudget = isProofMinimalMode() ? cfg.contextPackBudgetTokens : 1000;
  const budgetTokens = clampBudgetTokens(input.budgetTokens, 300, 2500, defaultBudget);
  const files: ContextPackResult["files"] = [];
  const symbols: ContextPackResult["symbols"] = [];
  const seenFiles = new Set<string>();
  const seenSymbols = new Set<string>();
  const intent = detectTaskIntent(input.task, mode);
  const authCapsuleFilter = shouldUseAuthCapsuleFilter(intent);
  const maxFiles = isProofMinimalMode() && intent === "auth_focus"
    ? cfg.contextPackMaxFiles
    : intent === "auth_focus"
      ? 8
      : intent === "impact_analysis"
        ? 10
        : intent === "onboarding"
          ? 10
          : 12;
  const maxSymbols = isProofMinimalMode() && intent === "auth_focus"
    ? cfg.contextPackMaxSymbols
    : intent === "auth_focus" || intent === "impact_analysis"
      ? 10
      : 15;
  const graphTask = expandTaskTerms(input.task, intent).join(" ");

  const capsules = loadCapsules(input.root);
  const capsule = capsules ? findCapsuleForTask(capsules, input.task) : null;

  if (capsule) {
    for (const file of capsule.files) {
      if (authCapsuleFilter && !/(auth|login|session|controller|service|page)/i.test(file)) continue;
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      files.push({ path: file, reason: `capsule:${capsule.topic}`, score: 85 });
    }
    for (const sym of capsule.symbols) {
      const [name, filePath] = sym.includes("@") ? sym.split("@") : [sym, undefined];
      const key = `${name}:${filePath ?? ""}`;
      if (seenSymbols.has(key)) continue;
      seenSymbols.add(key);
      symbols.push({ name, path: filePath, reason: `capsule:${capsule.topic}` });
    }
  }

  const graphQuery = queryGraph(graphTask, {
    root: input.root,
    maxResults: shouldBoostAuthFiles(intent) ? 16 : intent === "onboarding" ? 10 : 8,
    budgetTokens: Math.floor(budgetTokens / 2),
  });

  for (const result of graphQuery.results) {
    if (result.path && !seenFiles.has(result.path) && !isLowValuePackPath(result.path)) {
      seenFiles.add(result.path);
      files.push({ path: result.path, reason: result.reason, score: result.score });
    }
    if (["function", "class", "symbol", "interface", "type", "constant"].includes(result.type)) {
      const key = `${result.name}:${result.path ?? ""}`;
      if (!seenSymbols.has(key)) {
        seenSymbols.add(key);
        symbols.push({
          name: result.name,
          kind: result.type,
          path: result.path,
          line: result.line,
          reason: result.reason,
        });
      }
    }
  }

  if (shouldBoostAuthFiles(intent)) {
    for (const candidate of collectAuthGraphFiles(input.task, input.root, maxFiles, intent)) {
      if (seenFiles.has(candidate.path) || isLowValuePackPath(candidate.path)) continue;
      seenFiles.add(candidate.path);
      files.push(candidate);
    }
  }

  if (intent === "onboarding") {
    for (const candidate of collectOnboardingAnchorFiles(input.root)) {
      if (seenFiles.has(candidate.path)) continue;
      seenFiles.add(candidate.path);
      files.push(candidate);
    }
    for (const authCandidate of collectAuthGraphFiles(input.task, input.root, 4, "auth_focus")) {
      if (seenFiles.has(authCandidate.path) || isLowValuePackPath(authCandidate.path)) continue;
      seenFiles.add(authCandidate.path);
      files.push({ ...authCandidate, score: 75, reason: "onboarding-auth-flow" });
    }
  }

  if (intent === "impact_analysis") {
    for (const candidate of collectImpactAnalysisAnchors(input.root)) {
      if (seenFiles.has(candidate.path)) continue;
      seenFiles.add(candidate.path);
      files.push(candidate);
    }
    for (const candidate of collectRootManifestFiles(input.task, input.root)) {
      if (seenFiles.has(candidate.path)) continue;
      seenFiles.add(candidate.path);
      files.push(candidate);
    }
  }

  if (intent === "impact_analysis" || intent === "session_edit") {
    for (const candidate of collectTestHarnessFiles(input.task, input.root)) {
      if (seenFiles.has(candidate.path)) continue;
      seenFiles.add(candidate.path);
      files.push(candidate);
    }
  }

  if (files.length < 3) {
    const search = searchCodeTool(graphTask.split(/\s+/)[0] ?? input.task, input.root, 5);
    for (const match of search.matches) {
      if (!seenFiles.has(match.filePath) && !isLowValuePackPath(match.filePath)) {
        seenFiles.add(match.filePath);
        files.push({ path: match.filePath, reason: "search fallback", score: 40 });
      }
    }
  }

  const cmdResult = getProjectCommands(input.root);
  const commandBlock: ContextPackResult["commands"] = {};
  if (cmdResult.likelyTest) commandBlock.test = cmdResult.likelyTest;
  if (cmdResult.likelyLint) commandBlock.lint = cmdResult.likelyLint;
  if (cmdResult.likelyDev) commandBlock.dev = cmdResult.likelyDev;

  const limits =
    isProofMinimalMode() && intent === "auth_focus"
      ? { docs: 0, assets: 0, concepts: 0 }
      : multimodalLimits(intent);
  const multimodal = rankMultimodalForTask(graphTask, input.root);
  const taskConcepts = extractTaskConcepts(input.task);
  const mergedConcepts = [...taskConcepts, ...multimodal.concepts]
    .filter((item, index, arr) => arr.findIndex((other) => other.name === item.name) === index)
    .sort((a, b) => b.score - a.score)
    .slice(0, limits.concepts);
  const docs = multimodal.docs.length > 0 ? multimodal.docs.slice(0, limits.docs) : undefined;
  const assets = multimodal.assets.length > 0 ? multimodal.assets.slice(0, limits.assets) : undefined;
  const concepts = mergedConcepts.length > 0 ? mergedConcepts : undefined;

  const needsFullFileRead =
    mode === "edit" ||
    (symbols.length > 0 && files.some((f) => /auth|login|session/i.test(f.path)) && symbols.length < 2);

  const nextSteps = [
    "Review listed files and symbols before opening full files.",
    needsFullFileRead
      ? "Use get_symbol_context for exact implementation details."
      : "context_pack should be enough for discovery.",
    graphQuery.results.length === 0 ? "Run npm run graph:build if the graph is missing." : "Use graph_query only if more nodes are needed.",
  ];

  const docNote = docs?.length ? `, ${docs.length} docs` : "";
  const assetNote = assets?.length ? `, ${assets.length} assets` : "";
  const summary = `Context for "${input.task}" (${mode}): ${files.length} files, ${symbols.length} symbols${docNote}${assetNote}.`;

  const pack: ContextPackResult = {
    task: input.task,
    mode,
    budgetTokens,
    summary,
    files: files
      .filter((file) => !isLowValuePackPath(file.path))
      .filter(
        (file) =>
          (intent !== "impact_analysis" && intent !== "session_edit") || !isImpactNoiseTestPath(file.path),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles),
    symbols: symbols
      .filter((symbol) => intent !== "impact_analysis" || !symbol.path?.includes("edge-symbols-project"))
      .slice(0, maxSymbols),
    docs,
    assets,
    concepts,
    commands: Object.keys(commandBlock).length ? commandBlock : undefined,
    nextSteps,
    needsFullFileRead,
    truncated: false,
    generatedAt: new Date().toISOString(),
  };

  let result: ContextPackResult;
  if (isProofMinimalMode()) {
    result = slimSkillProofPack(pack, intent, input.task, input.root, pack.files);
    result.estimatedOutputTokens =
      result.estimatedOutputTokens ?? Math.ceil(JSON.stringify(result).length / 4);
  } else {
    const capped = capByBudget(pack, budgetTokens);
    result = { ...(capped.payload as ContextPackResult), truncated: capped.truncated };
    result.estimatedOutputTokens = Math.ceil(capped.charCount / 4);
  }
  return result;
}

function gitChangedFiles(root: string): string[] {
  const result = spawnSync("git", ["-C", root, "diff", "--name-only", "HEAD"], {
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    const staged = spawnSync("git", ["-C", root, "diff", "--name-only", "--cached"], { encoding: "utf8" });
    if (staged.status === 0 && staged.stdout.trim()) {
      return staged.stdout.trim().split("\n").filter(Boolean);
    }
    return [];
  }
  return result.stdout.trim().split("\n").filter(Boolean);
}

export function buildImpactPack(input: {
  changedFiles?: string[];
  root?: string;
  budgetTokens?: number;
}): ImpactPackResult {
  const budgetTokens = clampBudgetTokens(input.budgetTokens, 300, 2500, 1000);
  const { root: resolvedRoot } = getGraphCachePaths(input.root);
  const changedFiles = input.changedFiles?.length ? input.changedFiles : gitChangedFiles(resolvedRoot);

  const likelyDependents = new Set<string>();
  const relatedTests = new Set<string>();
  const relatedCommands = new Set<string>();

  for (const file of changedFiles) {
    const pack = buildContextPack({
      task: file,
      root: input.root,
      mode: "impact",
      budgetTokens: Math.floor(budgetTokens / 2),
    });
    for (const f of pack.files) {
      if (f.path !== file) likelyDependents.add(f.path);
    }
    for (const sym of pack.symbols) {
      if (sym.path && sym.path !== file) likelyDependents.add(sym.path);
    }
    if (/test|spec/i.test(file)) relatedTests.add(file);
    else {
      const guess = file.replace(/\.(ts|js)x?$/, ".test.$1");
      if (guess !== file) relatedTests.add(guess);
    }
  }

  const cmds = getProjectCommands(input.root);
  if (cmds.likelyTest) relatedCommands.add(cmds.likelyTest);
  if (cmds.likelyLint) relatedCommands.add(cmds.likelyLint);

  const riskLevel: ImpactPackResult["riskLevel"] =
    changedFiles.length >= 5 ? "high" : changedFiles.length >= 2 ? "medium" : "low";

  const impact: ImpactPackResult = {
    changedFiles,
    likelyDependents: [...likelyDependents].slice(0, 15),
    relatedTests: [...relatedTests].slice(0, 10),
    relatedCommands: [...relatedCommands].slice(0, 5),
    riskLevel,
    nextSteps: [
      "Run related tests before merging.",
      "Inspect likely dependents for breaking changes.",
      changedFiles.length === 0 ? "Provide changedFiles or ensure git diff is available." : "Review impact list before editing.",
    ],
    truncated: false,
  };

  const capped = capByBudget(impact, budgetTokens);
  return { ...(capped.payload as ImpactPackResult), truncated: capped.truncated };
}
