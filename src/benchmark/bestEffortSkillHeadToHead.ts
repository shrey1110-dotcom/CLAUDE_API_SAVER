import fs from "node:fs";
import path from "node:path";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";
import { estimateTokensFromText } from "../cli/skillPack.js";
import {
  buildGraphifySkillPrompt,
  buildRepoContextSkillPrompt,
  DEFAULT_CODEX_BIN,
  runSuppliedContextCodexOnce,
  type SuppliedContextCodexRepeat,
} from "./codexSuppliedContext.js";
import { AUTH_DISCOVERY_TASK } from "./skillHeadToHead.js";

export const BEST_EFFORT_DIR = ".mcp-benchmarks/best-effort-skill-head-to-head";
export const GRAPHIFY_BEST_EFFORT_CONTEXT = ".mcp-benchmarks/graphify-best-effort/graphify-best-effort-context.txt";
export const REPO_CONTEXT_BEST_EFFORT_CONTEXT = ".mcp-benchmarks/repo-context-best-effort-context.txt";

const REQUIRED_REPEATS = 3;

export type BestEffortVerdict =
  | "SCOPED_BEST_EFFORT_SUPPORTS_REPO_CONTEXT"
  | "BEST_EFFORT_COMPLETE_NO_SUPERIORITY_CLAIM"
  | "BEST_EFFORT_INCOMPLETE";

export interface BestEffortSkillSummary {
  generatedAt: string;
  taskName: "auth-discovery";
  measuredClient: "codex";
  codexBin: string;
  noMcp: boolean;
  graphifyContextFile: string;
  repoContextContextFile: string;
  graphifyContextTokens: number;
  repoContextContextTokens: number;
  graphifyLocalScore: ReturnType<typeof scoreCodexQaText>;
  repoContextLocalScore: ReturnType<typeof scoreCodexQaText>;
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
  medianReductionPct: number | null;
  meanReductionPct: number | null;
  reductionLabel: "small" | "moderate" | "large" | "none" | "increase";
  supportsScopedClaim: boolean;
  scopedClaimReason: string;
  verdict: BestEffortVerdict;
  allowedClaim: string;
  incomplete: boolean;
  incompleteReason?: string;
}

function scoreLocalContext(text: string): ReturnType<typeof scoreCodexQaText> {
  const profile = getCodexQaTask("auth-discovery");
  if (!profile) throw new Error("auth-discovery profile missing");
  return scoreCodexQaText(profile, text);
}

function reductionLabel(pct: number | null): BestEffortSkillSummary["reductionLabel"] {
  if (pct === null) return "none";
  if (pct < 0) return "increase";
  if (pct < 10) return "small";
  if (pct < 25) return "moderate";
  return "large";
}

export function evaluateBestEffort(summary: Omit<BestEffortSkillSummary, "verdict" | "allowedClaim" | "reductionLabel" | "medianReductionPct" | "meanReductionPct"> & {
  medianReductionPct?: number | null;
  meanReductionPct?: number | null;
  reductionLabel?: BestEffortSkillSummary["reductionLabel"];
}): Pick<BestEffortSkillSummary, "verdict" | "allowedClaim" | "supportsScopedClaim" | "scopedClaimReason" | "medianReductionPct" | "meanReductionPct" | "reductionLabel"> {
  const hasRepeats =
    summary.graphifyRepeats.length >= REQUIRED_REPEATS && summary.repoContextRepeats.length >= REQUIRED_REPEATS;
  const usageParsed =
    summary.graphifyClientTotals.length === REQUIRED_REPEATS &&
    summary.repoContextClientTotals.length === REQUIRED_REPEATS;
  const mcpClean =
    summary.graphifyRepeats.every((r) => !r.mcpToolsDetected) &&
    summary.repoContextRepeats.every((r) => !r.mcpToolsDetected);
  const noCross =
    summary.graphifyRepeats.every((r) => !r.crossContamination) &&
    summary.repoContextRepeats.every((r) => !r.crossContamination);

  const graphifyMedian = summary.graphifyStats?.median;
  const repoMedian = summary.repoContextStats?.median;
  const medianReductionPct =
    graphifyMedian && repoMedian && graphifyMedian > 0
      ? Math.round((1 - repoMedian / graphifyMedian) * 1000) / 10
      : null;
  const graphifyMean = summary.graphifyStats?.mean;
  const repoMean = summary.repoContextStats?.mean;
  const meanReductionPct =
    graphifyMean && repoMean && graphifyMean > 0
      ? Math.round((1 - repoMean / graphifyMean) * 1000) / 10
      : null;
  const label = reductionLabel(medianReductionPct);

  if (!hasRepeats || !usageParsed || !mcpClean || !noCross) {
    return {
      verdict: "BEST_EFFORT_INCOMPLETE",
      allowedClaim: "No scoped token-superiority claim is allowed.",
      supportsScopedClaim: false,
      scopedClaimReason: summary.incompleteReason ?? "Benchmark incomplete or contaminated.",
      medianReductionPct,
      meanReductionPct,
      reductionLabel: label,
    };
  }

  const graphifyMinQ = summary.graphifyMinQuality ?? 0;
  const repoMinQ = summary.repoContextMinQuality ?? 0;
  const tokensWin = (repoMedian ?? Number.POSITIVE_INFINITY) < (graphifyMedian ?? Number.POSITIVE_INFINITY);
  const qualityOk = repoMinQ >= graphifyMinQ;

  if (tokensWin && qualityOk) {
    const pct = medianReductionPct ?? 0;
    const tokenPhrase =
      label === "small"
        ? "slightly fewer median tokens"
        : `${pct}% fewer median tokens`;
    const qualityPhrase =
      repoMinQ > graphifyMinQ + 2
        ? "repo-context skill mode produced much higher quality with "
        : "repo-context skill mode used ";
    return {
      verdict: "SCOPED_BEST_EFFORT_SUPPORTS_REPO_CONTEXT",
      allowedClaim: `On auth-discovery in this repo, using Codex CLI with best-effort supplied context and no MCP tools, ${qualityPhrase}${tokenPhrase} than Graphify best-effort context with equal or better quality.`,
      supportsScopedClaim: true,
      scopedClaimReason: "repo-context median client tokens below Graphify with equal or better minimum quality.",
      medianReductionPct,
      meanReductionPct,
      reductionLabel: label,
    };
  }

  return {
    verdict: "BEST_EFFORT_COMPLETE_NO_SUPERIORITY_CLAIM",
    allowedClaim: "No scoped token-superiority claim is allowed.",
    supportsScopedClaim: false,
    scopedClaimReason: tokensWin
      ? "repo-context minimum quality is below Graphify minimum quality."
      : "repo-context median client tokens are not lower than Graphify best-effort.",
    medianReductionPct,
    meanReductionPct,
    reductionLabel: label,
  };
}

export async function runBestEffortSkillHeadToHead(options: {
  repoPath?: string;
  codexBin?: string;
  graphifyContextFile?: string;
  repoContextContextFile?: string;
  runsRoot?: string;
  repeats?: number;
}): Promise<BestEffortSkillSummary> {
  const repoPath = path.resolve(options.repoPath ?? process.cwd());
  const codexBin = options.codexBin ?? DEFAULT_CODEX_BIN;
  const runsRoot = path.resolve(repoPath, options.runsRoot ?? BEST_EFFORT_DIR);
  const repeats = options.repeats ?? REQUIRED_REPEATS;
  const graphifyFile = path.resolve(repoPath, options.graphifyContextFile ?? GRAPHIFY_BEST_EFFORT_CONTEXT);
  const repoContextFile = path.resolve(repoPath, options.repoContextContextFile ?? REPO_CONTEXT_BEST_EFFORT_CONTEXT);

  if (!fs.existsSync(graphifyFile)) throw new Error(`Graphify context missing: ${graphifyFile}`);
  if (!fs.existsSync(repoContextFile)) throw new Error(`repo-context context missing: ${repoContextFile}`);

  const graphifyContext = fs.readFileSync(graphifyFile, "utf8");
  const repoContextContext = fs.readFileSync(repoContextFile, "utf8");
  const graphifyContextTokens = estimateTokensFromText(graphifyContext);
  const repoContextContextTokens = estimateTokensFromText(repoContextContext);
  const graphifyLocalScore = scoreLocalContext(graphifyContext);
  const repoContextLocalScore = scoreLocalContext(repoContextContext);

  const graphifyRepeats: SuppliedContextCodexRepeat[] = [];
  const repoContextRepeats: SuppliedContextCodexRepeat[] = [];

  for (let index = 1; index <= repeats; index += 1) {
    console.log(`[best-effort] Graphify arm repeat ${index}/${repeats}`);
    graphifyRepeats.push(
      await runSuppliedContextCodexOnce({
        codexBin,
        repoPath,
        prompt: buildGraphifySkillPrompt(graphifyContext, AUTH_DISCOVERY_TASK, false),
        runDir: path.join(runsRoot, "graphify", `repeat-${index}`),
        repeat: index,
        arm: "graphify",
      }),
    );
  }
  for (let index = 1; index <= repeats; index += 1) {
    console.log(`[best-effort] repo-context arm repeat ${index}/${repeats}`);
    repoContextRepeats.push(
      await runSuppliedContextCodexOnce({
        codexBin,
        repoPath,
        prompt: buildRepoContextSkillPrompt(repoContextContext, AUTH_DISCOVERY_TASK, false),
        runDir: path.join(runsRoot, "repo-context", `repeat-${index}`),
        repeat: index,
        arm: "repo-context",
      }),
    );
  }

  const graphifyClientTotals = graphifyRepeats.map((r) => r.clientTotalTokens!);
  const repoContextClientTotals = repoContextRepeats.map((r) => r.clientTotalTokens!);

  const partial = {
    generatedAt: new Date().toISOString(),
    taskName: "auth-discovery" as const,
    measuredClient: "codex" as const,
    codexBin,
    noMcp: true,
    graphifyContextFile: graphifyFile,
    repoContextContextFile: repoContextFile,
    graphifyContextTokens,
    repoContextContextTokens,
    graphifyLocalScore,
    repoContextLocalScore,
    graphifyRepeats,
    repoContextRepeats,
    graphifyClientTotals,
    repoContextClientTotals,
    graphifyQualityScores: graphifyRepeats.map((r) => r.qualityScore),
    repoContextQualityScores: repoContextRepeats.map((r) => r.qualityScore),
    graphifyStats: calculateRepeatStats(graphifyClientTotals),
    repoContextStats: calculateRepeatStats(repoContextClientTotals),
    graphifyMinQuality: Math.min(...graphifyRepeats.map((r) => r.qualityScore)),
    repoContextMinQuality: Math.min(...repoContextRepeats.map((r) => r.qualityScore)),
    supportsScopedClaim: false,
    scopedClaimReason: "pending",
    incomplete: false,
  };

  const evaluated = evaluateBestEffort(partial);
  const summary: BestEffortSkillSummary = { ...partial, ...evaluated };
  writeBestEffortSummary(summary, runsRoot);
  return summary;
}

export function writeBestEffortSummary(summary: BestEffortSkillSummary, runsRoot = BEST_EFFORT_DIR): {
  jsonPath: string;
  mdPath: string;
} {
  const jsonPath = path.join(runsRoot, "summary.json");
  const mdPath = path.join(runsRoot, "summary.md");
  const lines = [
    "# Best-effort skill head-to-head (auth-discovery)",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Context sources",
    `- Graphify: ${summary.graphifyContextFile} (~${summary.graphifyContextTokens} tokens)`,
    `- repo-context: ${summary.repoContextContextFile} (~${summary.repoContextContextTokens} tokens)`,
    "",
    "## Local context scoring (before Codex)",
    `- Graphify files: ${summary.graphifyLocalScore.matchedFiles.length}/5, quality ${summary.graphifyLocalScore.qualityScore}/10`,
    `- repo-context files: ${summary.repoContextLocalScore.matchedFiles.length}/5, quality ${summary.repoContextLocalScore.qualityScore}/10`,
    "",
    "## Graphify Codex arm",
    ...summary.graphifyRepeats.map(
      (r) => `- R${r.repeat}: client=${r.clientTotalTokens} quality=${r.qualityScore}/10 files=${r.matchedFiles.length}/5`,
    ),
    summary.graphifyStats
      ? `- Graphify mean/median: ${summary.graphifyStats.mean} / ${summary.graphifyStats.median}`
      : "",
    "",
    "## repo-context Codex arm",
    ...summary.repoContextRepeats.map(
      (r) => `- R${r.repeat}: client=${r.clientTotalTokens} quality=${r.qualityScore}/10 files=${r.matchedFiles.length}/5`,
    ),
    summary.repoContextStats
      ? `- repo-context mean/median: ${summary.repoContextStats.mean} / ${summary.repoContextStats.median}`
      : "",
    "",
    "## Token comparison",
    `- Median reduction: ${summary.medianReductionPct ?? "n/a"}% (${summary.reductionLabel})`,
    `- Mean reduction: ${summary.meanReductionPct ?? "n/a"}%`,
    "",
    "## Verdict",
    `- Verdict: \`${summary.verdict}\``,
    `- Scoped claim allowed: ${summary.supportsScopedClaim ? "yes" : "no"}`,
    `- Reason: ${summary.scopedClaimReason}`,
    `- Allowed claim: ${summary.allowedClaim}`,
    "",
  ];
  fs.mkdirSync(runsRoot, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${lines.filter(Boolean).join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const summary = await runBestEffortSkillHeadToHead({
    repoPath: readStringArg(args, "repo"),
    codexBin: readStringArg(args, "codex-bin"),
    graphifyContextFile: readStringArg(args, "graphify-context-file"),
    repoContextContextFile: readStringArg(args, "repo-context-context-file"),
    repeats: readNumberArg(args, "repeat"),
  });
  console.log(`verdict=${summary.verdict}`);
  console.log(`allowed_claim=${summary.allowedClaim}`);
}

if (process.argv[1]?.includes("bestEffortSkillHeadToHead")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
