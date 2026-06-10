import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCliArgs, readBooleanArg, readNumberArg, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";
import { buildSkillPack, estimateTokensFromText } from "../cli/skillPack.js";
import { formatSkillMarkdown, type SkillMarkdownProfile } from "../cli/formatSkillMarkdown.js";
import {
  buildGraphifySkillPrompt,
  buildRepoContextSkillPrompt,
  DEFAULT_CODEX_BIN,
  runSuppliedContextCodexOnce,
  type SuppliedContextCodexRepeat,
} from "./codexSuppliedContext.js";

export const SKILL_HEAD_TO_HEAD_DIR = ".mcp-benchmarks/skill-head-to-head";
export const GRAPHIFY_AUTH_OUTPUT = ".mcp-benchmarks/graphify-auth-output.txt";
export const REPO_CONTEXT_AUTH_OUTPUT = ".mcp-benchmarks/repo-context-auth-output.txt";
export const AUTH_DISCOVERY_TASK =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.";

const REQUIRED_REPEATS = 3;

export type SkillHeadToHeadVerdict =
  | "SCOPED_SKILL_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT"
  | "SKILL_HEAD_TO_HEAD_COMPLETE_NO_SUPERIORITY_CLAIM"
  | "SKILL_HEAD_TO_HEAD_INCOMPLETE";

export interface SkillHeadToHeadSummary {
  generatedAt: string;
  taskName: "auth-discovery";
  measuredClient: "codex";
  codexBin: string;
  noMcp: boolean;
  graphifyContextFile: string;
  repoContextContextFile: string;
  graphifyOutputTokens: number;
  repoContextOutputTokens: number;
  markdownProfile: SkillMarkdownProfile;
  compactPrompt: boolean;
  graphifyRepeats: SuppliedContextCodexRepeat[];
  repoContextRepeats: SuppliedContextCodexRepeat[];
  graphifyClientTotals: number[];
  repoContextClientTotals: number[];
  graphifyQualityScores: number[];
  repoContextQualityScores: number[];
  graphifyStats?: ReturnType<typeof calculateRepeatStats>;
  repoContextStats?: ReturnType<typeof calculateRepeatStats>;
  graphifyMinQuality: number | null;
  repoContextMinQuality: number | null;
  supportsScopedClaim: boolean;
  scopedClaimReason: string;
  verdict: SkillHeadToHeadVerdict;
  allowedClaim: string;
  incomplete: boolean;
  incompleteReason?: string;
}

export function writeRepoContextSkillOutput(
  repoPath: string,
  options: {
    task?: string;
    budget?: number;
    outPath?: string;
    markdownProfile?: SkillMarkdownProfile;
  } = {},
): { outPath: string; output: string; outputTokens: number; packQuality: ReturnType<typeof scoreCodexQaText> } {
  const task = options.task ?? AUTH_DISCOVERY_TASK;
  const budget = options.budget ?? 500;
  const outPath = path.resolve(repoPath, options.outPath ?? REPO_CONTEXT_AUTH_OUTPUT);
  const profile = getCodexQaTask("auth-discovery");
  if (!profile) throw new Error("auth-discovery profile missing");

  const pack = buildSkillPack({ task, root: repoPath, budgetTokens: budget });
  const markdown = formatSkillMarkdown(pack, options.markdownProfile ?? "standard");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, "utf8");
  const packQuality = scoreCodexQaText(profile, markdown);
  return { outPath, output: markdown, outputTokens: estimateTokensFromText(markdown), packQuality };
}

export function ensureGraphifyOutput(repoPath: string, graphifyOutputFile: string): string {
  const resolved = path.resolve(repoPath, graphifyOutputFile);
  if (fs.existsSync(resolved) && fs.readFileSync(resolved, "utf8").trim().length > 0) {
    return resolved;
  }
  const graphifyBin = resolveGraphifyBin();
  if (!graphifyBin) {
    throw new Error("Graphify binary not found and graphify output file missing.");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const result = spawnSync(graphifyBin, ["query", AUTH_DISCOVERY_TASK], {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`graphify query failed: ${result.stderr || result.stdout}`);
  }
  fs.writeFileSync(resolved, result.stdout, "utf8");
  return resolved;
}

function resolveGraphifyBin(): string | undefined {
  const run = spawnSync("which", ["graphify"], { encoding: "utf8" });
  if (run.status === 0 && run.stdout.trim()) return run.stdout.trim();
  return undefined;
}

export function evaluateSkillHeadToHead(summary: Omit<SkillHeadToHeadSummary, "verdict" | "allowedClaim">): {
  verdict: SkillHeadToHeadVerdict;
  allowedClaim: string;
  supportsScopedClaim: boolean;
  scopedClaimReason: string;
} {
  const hasRepeats =
    summary.graphifyRepeats.length >= REQUIRED_REPEATS &&
    summary.repoContextRepeats.length >= REQUIRED_REPEATS;
  const usageParsed =
    summary.graphifyClientTotals.length === REQUIRED_REPEATS &&
    summary.repoContextClientTotals.length === REQUIRED_REPEATS;
  const mcpClean =
    summary.graphifyRepeats.every((r) => !r.mcpToolsDetected) &&
    summary.repoContextRepeats.every((r) => !r.mcpToolsDetected);
  const noCross =
    summary.graphifyRepeats.every((r) => !r.crossContamination) &&
    summary.repoContextRepeats.every((r) => !r.crossContamination);

  if (!hasRepeats || !usageParsed || !mcpClean || !noCross) {
    return {
      verdict: "SKILL_HEAD_TO_HEAD_INCOMPLETE",
      allowedClaim: "No scoped token-superiority claim is allowed.",
      supportsScopedClaim: false,
      scopedClaimReason: summary.incompleteReason ?? "Benchmark incomplete or contaminated.",
    };
  }

  const graphifyMedian = summary.graphifyStats?.median ?? Number.POSITIVE_INFINITY;
  const repoMedian = summary.repoContextStats?.median ?? Number.POSITIVE_INFINITY;
  const graphifyMinQ = summary.graphifyMinQuality ?? 0;
  const repoMinQ = summary.repoContextMinQuality ?? 0;
  const tokensWin = repoMedian < graphifyMedian;
  const qualityOk = repoMinQ >= graphifyMinQ;

  if (tokensWin && qualityOk) {
    const reduction = Math.round((1 - repoMedian / graphifyMedian) * 1000) / 10;
    return {
      verdict: "SCOPED_SKILL_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT",
      allowedClaim: `On auth-discovery in this repo, using Codex CLI with supplied context and no MCP tools, repo-context skill mode used ${reduction}% fewer median tokens than Graphify query output with equal or better quality.`,
      supportsScopedClaim: true,
      scopedClaimReason: "repo-context median client tokens below Graphify with equal or better minimum quality across 3 repeats.",
    };
  }

  let reason = "repo-context median client tokens are not lower than Graphify.";
  if (!qualityOk) reason = "repo-context minimum quality is below Graphify minimum quality.";

  return {
    verdict: "SKILL_HEAD_TO_HEAD_COMPLETE_NO_SUPERIORITY_CLAIM",
    allowedClaim: "No scoped token-superiority claim is allowed.",
    supportsScopedClaim: false,
    scopedClaimReason: reason,
  };
}

export async function runSkillHeadToHead(options: {
  repoPath?: string;
  codexBin?: string;
  graphifyOutputFile?: string;
  repoContextOutputFile?: string;
  runsRoot?: string;
  repeats?: number;
  markdownProfile?: SkillMarkdownProfile;
  compactPrompt?: boolean;
  skipCodex?: boolean;
}): Promise<SkillHeadToHeadSummary> {
  const repoPath = path.resolve(options.repoPath ?? process.cwd());
  const codexBin = options.codexBin ?? DEFAULT_CODEX_BIN;
  const runsRoot = path.resolve(repoPath, options.runsRoot ?? SKILL_HEAD_TO_HEAD_DIR);
  const repeats = options.repeats ?? REQUIRED_REPEATS;
  const markdownProfile = options.markdownProfile ?? "standard";
  const compactPrompt = options.compactPrompt ?? false;

  const graphifyFile = ensureGraphifyOutput(repoPath, options.graphifyOutputFile ?? GRAPHIFY_AUTH_OUTPUT);
  const graphifyOutput = fs.readFileSync(graphifyFile, "utf8");
  const graphifyOutputTokens = estimateTokensFromText(graphifyOutput);

  const repoWritten = writeRepoContextSkillOutput(repoPath, {
    outPath: options.repoContextOutputFile ?? REPO_CONTEXT_AUTH_OUTPUT,
    markdownProfile,
  });
  const repoContextOutput = repoWritten.output;
  const repoContextOutputTokens = repoWritten.outputTokens;

  const graphifyRepeats: SuppliedContextCodexRepeat[] = [];
  const repoContextRepeats: SuppliedContextCodexRepeat[] = [];

  if (!options.skipCodex) {
    for (let index = 1; index <= repeats; index += 1) {
      console.log(`[skill-head-to-head] Graphify arm repeat ${index}/${repeats}`);
      const graphifyPrompt = buildGraphifySkillPrompt(graphifyOutput, AUTH_DISCOVERY_TASK, compactPrompt);
      graphifyRepeats.push(
        await runSuppliedContextCodexOnce({
          codexBin,
          repoPath,
          prompt: graphifyPrompt,
          runDir: path.join(runsRoot, "graphify", `repeat-${index}`),
          repeat: index,
          arm: "graphify",
        }),
      );
    }
    for (let index = 1; index <= repeats; index += 1) {
      console.log(`[skill-head-to-head] repo-context arm repeat ${index}/${repeats}`);
      const repoPrompt = buildRepoContextSkillPrompt(repoContextOutput, AUTH_DISCOVERY_TASK, compactPrompt);
      repoContextRepeats.push(
        await runSuppliedContextCodexOnce({
          codexBin,
          repoPath,
          prompt: repoPrompt,
          runDir: path.join(runsRoot, "repo-context", `repeat-${index}`),
          repeat: index,
          arm: "repo-context",
        }),
      );
    }
  }

  const graphifyClientTotals = graphifyRepeats.filter((r) => r.usageParsed).map((r) => r.clientTotalTokens!);
  const repoContextClientTotals = repoContextRepeats.filter((r) => r.usageParsed).map((r) => r.clientTotalTokens!);
  const graphifyQualityScores = graphifyRepeats.map((r) => r.qualityScore);
  const repoContextQualityScores = repoContextRepeats.map((r) => r.qualityScore);

  let incomplete = Boolean(options.skipCodex);
  let incompleteReason: string | undefined;
  if (options.skipCodex) {
    incompleteReason = "Codex repeats skipped.";
  } else if (graphifyRepeats.length < repeats || repoContextRepeats.length < repeats) {
    incomplete = true;
    incompleteReason = "Missing Codex repeats.";
  } else if (graphifyClientTotals.length < repeats || repoContextClientTotals.length < repeats) {
    incomplete = true;
    incompleteReason = "Parsed usage missing for one or more repeats.";
  }

  const partial: Omit<SkillHeadToHeadSummary, "verdict" | "allowedClaim"> = {
    generatedAt: new Date().toISOString(),
    taskName: "auth-discovery",
    measuredClient: "codex",
    codexBin,
    noMcp: true,
    graphifyContextFile: graphifyFile,
    repoContextContextFile: repoWritten.outPath,
    graphifyOutputTokens,
    repoContextOutputTokens,
    markdownProfile,
    compactPrompt,
    graphifyRepeats,
    repoContextRepeats,
    graphifyClientTotals,
    repoContextClientTotals,
    graphifyQualityScores,
    repoContextQualityScores,
    graphifyStats: graphifyClientTotals.length ? calculateRepeatStats(graphifyClientTotals) : undefined,
    repoContextStats: repoContextClientTotals.length ? calculateRepeatStats(repoContextClientTotals) : undefined,
    graphifyMinQuality: graphifyQualityScores.length ? Math.min(...graphifyQualityScores) : null,
    repoContextMinQuality: repoContextQualityScores.length ? Math.min(...repoContextQualityScores) : null,
    supportsScopedClaim: false,
    scopedClaimReason: "pending",
    incomplete,
    incompleteReason,
  };

  const evaluated = evaluateSkillHeadToHead(partial);
  const summary: SkillHeadToHeadSummary = {
    ...partial,
    supportsScopedClaim: evaluated.supportsScopedClaim,
    scopedClaimReason: evaluated.scopedClaimReason,
    verdict: evaluated.verdict,
    allowedClaim: evaluated.allowedClaim,
  };

  writeSkillHeadToHeadSummary(summary, runsRoot);
  return summary;
}

export function writeSkillHeadToHeadSummary(summary: SkillHeadToHeadSummary, runsRoot = SKILL_HEAD_TO_HEAD_DIR): {
  jsonPath: string;
  mdPath: string;
} {
  const jsonPath = path.join(runsRoot, "summary.json");
  const mdPath = path.join(runsRoot, "summary.md");
  const lines = [
    "# Skill-mode head-to-head (auth-discovery)",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `- Task: ${summary.taskName}`,
    `- Measured client: ${summary.measuredClient}`,
    `- Codex binary: ${summary.codexBin}`,
    `- No MCP: ${summary.noMcp ? "yes" : "no"}`,
    `- Graphify context: ${summary.graphifyContextFile} (~${summary.graphifyOutputTokens} tokens)`,
    `- repo-context context: ${summary.repoContextContextFile} (~${summary.repoContextOutputTokens} tokens)`,
    `- Markdown profile: ${summary.markdownProfile}`,
    `- Compact Codex prompt: ${summary.compactPrompt ? "yes" : "no"}`,
    "",
    "## Graphify arm",
    "",
    "| Repeat | Client total | Quality | Files | MCP | Cross |",
    "| --- | ---: | ---: | --- | --- | --- |",
    ...summary.graphifyRepeats.map(
      (r) =>
        `| ${r.repeat} | ${r.clientTotalTokens ?? "n/a"} | ${r.qualityScore}/10 | ${r.matchedFiles.length}/5 | ${r.mcpToolsDetected ? "yes" : "no"} | ${r.crossContamination ? "yes" : "no"} |`,
    ),
    "",
    summary.graphifyStats
      ? `- Graphify mean/median client tokens: ${summary.graphifyStats.mean} / ${summary.graphifyStats.median}`
      : "- Graphify stats: n/a",
    summary.graphifyMinQuality !== null ? `- Graphify min quality: ${summary.graphifyMinQuality}/10` : "",
    "",
    "## repo-context arm",
    "",
    "| Repeat | Client total | Quality | Files | MCP | Cross |",
    "| --- | ---: | ---: | --- | --- | --- |",
    ...summary.repoContextRepeats.map(
      (r) =>
        `| ${r.repeat} | ${r.clientTotalTokens ?? "n/a"} | ${r.qualityScore}/10 | ${r.matchedFiles.length}/5 | ${r.mcpToolsDetected ? "yes" : "no"} | ${r.crossContamination ? "yes" : "no"} |`,
    ),
    "",
    summary.repoContextStats
      ? `- repo-context mean/median client tokens: ${summary.repoContextStats.mean} / ${summary.repoContextStats.median}`
      : "- repo-context stats: n/a",
    summary.repoContextMinQuality !== null ? `- repo-context min quality: ${summary.repoContextMinQuality}/10` : "",
    "",
    "## Verdict",
    "",
    `- Verdict: \`${summary.verdict}\``,
    `- Scoped claim allowed: ${summary.supportsScopedClaim ? "yes" : "no"}`,
    `- Reason: ${summary.scopedClaimReason}`,
    `- Allowed claim: ${summary.allowedClaim}`,
    "",
  ];
  fs.mkdirSync(runsRoot, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${lines.filter((l) => l !== undefined && l !== "").join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const summary = await runSkillHeadToHead({
    repoPath: readStringArg(args, "repo"),
    codexBin: readStringArg(args, "codex-bin"),
    graphifyOutputFile: readStringArg(args, "graphify-output-file"),
    repoContextOutputFile: readStringArg(args, "repo-context-output-file"),
    repeats: readNumberArg(args, "repeat"),
    markdownProfile: (readStringArg(args, "markdown-profile") as SkillMarkdownProfile | undefined) ?? "standard",
    compactPrompt: readBooleanArg(args, "compact-prompt") === true,
    skipCodex: readBooleanArg(args, "skip-codex") === true,
  });
  console.log(`verdict=${summary.verdict}`);
  console.log(`allowed_claim=${summary.allowedClaim}`);
  if (summary.incomplete || !summary.supportsScopedClaim) {
    process.exit(summary.incomplete ? 1 : 0);
  }
}

const invokedAsScript = process.argv[1]?.includes("skillHeadToHead");
if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
