import { spawnSync } from "node:child_process";
import { clampBudgetTokens, capByBudget } from "../shared/budget.js";
import { getGraphStatus, queryGraph } from "../graph/queryGraph.js";
import { getProjectCommands } from "../tools/getProjectCommands.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { getGraphCachePaths } from "../graph/paths.js";
import { findCapsuleForTask, loadCapsules, loadContextManifest } from "./loadContext.js";
import type { ContextMode, ContextPackResult, ContextStatus, ImpactPackResult } from "./types.js";

export function getContextStatus(root?: string): ContextStatus {
  const graph = getGraphStatus(root);
  const manifest = loadContextManifest(root);
  const capsules = loadCapsules(root);
  const suggestedCommands: string[] = [];

  if (!graph.exists) suggestedCommands.push("npm run graph:build");
  if (!capsules?.length) suggestedCommands.push("npm run context:build");

  return {
    graphExists: graph.exists,
    capsulesExist: Boolean(capsules?.length),
    capsuleCount: capsules?.length ?? 0,
    lastBuildTime: manifest?.generatedAt,
    graphNodeCount: graph.nodeCount,
    graphEdgeCount: graph.edgeCount,
    suggestedCommands,
  };
}

export function buildContextPack(input: {
  task: string;
  root?: string;
  mode?: ContextMode;
  budgetTokens?: number;
}): ContextPackResult {
  const mode = input.mode ?? "discovery";
  const budgetTokens = clampBudgetTokens(input.budgetTokens, 300, 2500, 1000);
  const files: ContextPackResult["files"] = [];
  const symbols: ContextPackResult["symbols"] = [];
  const seenFiles = new Set<string>();
  const seenSymbols = new Set<string>();

  const capsules = loadCapsules(input.root);
  const capsule = capsules ? findCapsuleForTask(capsules, input.task) : null;

  if (capsule) {
    for (const file of capsule.files) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      files.push({ path: file, reason: `capsule:${capsule.topic}`, score: 90 });
    }
    for (const sym of capsule.symbols) {
      const [name, filePath] = sym.includes("@") ? sym.split("@") : [sym, undefined];
      const key = `${name}:${filePath ?? ""}`;
      if (seenSymbols.has(key)) continue;
      seenSymbols.add(key);
      symbols.push({ name, path: filePath, reason: `capsule:${capsule.topic}` });
    }
  }

  const graphQuery = queryGraph(input.task, {
    root: input.root,
    maxResults: 8,
    budgetTokens: Math.floor(budgetTokens / 2),
  });

  for (const result of graphQuery.results) {
    if (result.path && !seenFiles.has(result.path)) {
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

  if (files.length < 3) {
    const search = searchCodeTool(input.task.split(/\s+/)[0] ?? input.task, input.root, 5);
    for (const match of search.matches) {
      if (!seenFiles.has(match.filePath)) {
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

  const summary = `Context for "${input.task}" (${mode}): ${files.length} files, ${symbols.length} symbols.`;

  const pack: ContextPackResult = {
    task: input.task,
    mode,
    budgetTokens,
    summary,
    files: files.sort((a, b) => b.score - a.score).slice(0, 12),
    symbols: symbols.slice(0, 15),
    commands: Object.keys(commandBlock).length ? commandBlock : undefined,
    nextSteps,
    needsFullFileRead,
    truncated: false,
  };

  const capped = capByBudget(pack, budgetTokens);
  return { ...(capped.payload as ContextPackResult), truncated: capped.truncated };
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
