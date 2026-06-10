import fs from "node:fs";
import path from "node:path";
import { parseCliArgs, readBooleanArg } from "../ab/cli.js";
import { BEST_EFFORT_DIR } from "./bestEffortSkillHeadToHead.js";
import { estimateTokensFromText } from "../cli/skillPack.js";
import {
  loadGraphifyGeminiTokens,
  totalGeminiTokens,
  type GraphifyGeminiTokenBreakdown,
} from "./graphifyTokenLogs.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";

export const END_TO_END_AI_COST_DIR = ".mcp-benchmarks/end-to-end-ai-cost";

export interface EndToEndAiCostSummary {
  generatedAt: string;
  taskName: "auth-discovery";
  graphifyGemini: GraphifyGeminiTokenBreakdown & { total: number | null; clusteringOnlyTotal: number | null };
  graphifyContextTokens: number;
  repoContextContextTokens: number;
  graphifyCodexMedian: number | null;
  repoContextCodexMedian: number | null;
  codexOnly: {
    graphifyTotal: number | null;
    repoContextTotal: number | null;
    reductionPct: number | null;
  };
  endToEnd: {
    graphifyTotal: number | null;
    repoContextTotal: number | null;
    reductionPct: number | null;
    graphifyGeminiIncluded: boolean;
    graphifyPartialTotalClusteringOnly: number | null;
    partialReductionPctClusteringOnly: number | null;
  };
  repoContextExternalLlmIndexingTokens: 0;
  buildCostNote: string;
  allowedScopedVerdict: string;
  incomplete: boolean;
  incompleteReason?: string;
}

export function buildEndToEndAiCostSummary(repoPath: string, options?: { rerunGraphify?: boolean }): EndToEndAiCostSummary {
  const bestEffortPath = path.join(repoPath, BEST_EFFORT_DIR, "summary.json");
  if (!fs.existsSync(bestEffortPath)) {
    return {
      generatedAt: new Date().toISOString(),
      taskName: "auth-discovery",
      graphifyGemini: { ...loadGraphifyGeminiTokens(repoPath), total: null, clusteringOnlyTotal: null },
      graphifyContextTokens: 0,
      repoContextContextTokens: 0,
      graphifyCodexMedian: null,
      repoContextCodexMedian: null,
      codexOnly: { graphifyTotal: null, repoContextTotal: null, reductionPct: null },
      endToEnd: {
        graphifyTotal: null,
        repoContextTotal: null,
        reductionPct: null,
        graphifyGeminiIncluded: false,
        graphifyPartialTotalClusteringOnly: null,
        partialReductionPctClusteringOnly: null,
      },
      repoContextExternalLlmIndexingTokens: 0,
      buildCostNote:
        "Graphify Gemini build/cluster cost is first-run cost and may be amortized over many queries; still relevant for consumer setup cost.",
      allowedScopedVerdict: "Incomplete — best-effort summary missing.",
      incomplete: true,
      incompleteReason: "Missing .mcp-benchmarks/best-effort-skill-head-to-head/summary.json",
    };
  }

  const bestEffort = JSON.parse(fs.readFileSync(bestEffortPath, "utf8")) as {
    graphifyContextTokens: number;
    repoContextContextTokens: number;
    graphifyClientTotals: number[];
    repoContextClientTotals: number[];
    graphifyStats?: ReturnType<typeof calculateRepeatStats>;
    repoContextStats?: ReturnType<typeof calculateRepeatStats>;
  };

  const logDir = path.join(repoPath, END_TO_END_AI_COST_DIR);
  const gemini = loadGraphifyGeminiTokens(repoPath, { rerun: options?.rerunGraphify, logDir });
  const geminiTotal = totalGeminiTokens(gemini);
  const clusteringOnlyTotal =
    gemini.clusteringInputTokens !== null && gemini.clusteringOutputTokens !== null
      ? gemini.clusteringInputTokens + gemini.clusteringOutputTokens
      : null;
  const graphifyCodexMedian = bestEffort.graphifyStats?.median ?? null;
  const repoCodexMedian = bestEffort.repoContextStats?.median ?? null;

  const codexOnlyGraphify = graphifyCodexMedian;
  const codexOnlyRepo = repoCodexMedian;
  const codexReduction =
    codexOnlyGraphify && codexOnlyRepo && codexOnlyGraphify > 0
      ? Math.round((1 - codexOnlyRepo / codexOnlyGraphify) * 1000) / 10
      : null;

  const graphifyContextTokens = bestEffort.graphifyContextTokens;
  const repoContextTokens = bestEffort.repoContextContextTokens;

  const endGraphify =
    geminiTotal !== null && codexOnlyGraphify !== null
      ? geminiTotal + graphifyContextTokens + codexOnlyGraphify
      : null;
  const endGraphifyPartialClustering =
    clusteringOnlyTotal !== null && codexOnlyGraphify !== null
      ? clusteringOnlyTotal + graphifyContextTokens + codexOnlyGraphify
      : null;
  const endRepo = codexOnlyRepo !== null ? repoContextTokens + codexOnlyRepo : null;
  const endReduction =
    endGraphify && endRepo && endGraphify > 0 ? Math.round((1 - endRepo / endGraphify) * 1000) / 10 : null;
  const partialReduction =
    endGraphifyPartialClustering && endRepo && endGraphifyPartialClustering > 0
      ? Math.round((1 - endRepo / endGraphifyPartialClustering) * 1000) / 10
      : null;

  const geminiComplete = gemini.unknownFields.length === 0;
  let verdict = "Incomplete — Graphify Gemini token logs partially unknown.";
  if (endReduction !== null && endReduction > 50 && geminiComplete) {
    verdict =
      "On first-run auth-discovery in this repo, repo-context skill mode required no LLM indexing step and used substantially fewer total AI tokens than Graphify Gemini best-effort, while producing higher-quality answers.";
  } else if (codexReduction !== null) {
    verdict = `Codex-only median reduction ${codexReduction}% (limited by Codex fixed overhead). End-to-end advantage depends on verified Graphify Gemini build tokens.`;
  }

  return {
    generatedAt: new Date().toISOString(),
    taskName: "auth-discovery",
    graphifyGemini: { ...gemini, total: geminiTotal, clusteringOnlyTotal },
    graphifyContextTokens,
    repoContextContextTokens: repoContextTokens,
    graphifyCodexMedian,
    repoContextCodexMedian: repoCodexMedian,
    codexOnly: {
      graphifyTotal: codexOnlyGraphify,
      repoContextTotal: codexOnlyRepo,
      reductionPct: codexReduction,
    },
    endToEnd: {
      graphifyTotal: endGraphify,
      repoContextTotal: endRepo,
      reductionPct: endReduction,
      graphifyGeminiIncluded: geminiTotal !== null,
      graphifyPartialTotalClusteringOnly: endGraphifyPartialClustering,
      partialReductionPctClusteringOnly: partialReduction,
    },
    repoContextExternalLlmIndexingTokens: 0,
    buildCostNote:
      "Graphify Gemini build/cluster cost is first-run cost and may be amortized over many queries; still relevant for consumer setup cost.",
    allowedScopedVerdict: verdict,
    incomplete: geminiTotal === null || codexOnlyGraphify === null || codexOnlyRepo === null,
    incompleteReason:
      geminiTotal === null
        ? `Unknown Gemini fields: ${gemini.unknownFields.join(", ")}`
        : undefined,
  };
}

export function writeEndToEndAiCostSummary(summary: EndToEndAiCostSummary, outDir = END_TO_END_AI_COST_DIR): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const md = [
    "# End-to-end AI-token cost (auth-discovery)",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Graphify Gemini (first-run indexing)",
    `- Extraction input: ${summary.graphifyGemini.extractionInputTokens ?? "unknown"}`,
    `- Extraction output: ${summary.graphifyGemini.extractionOutputTokens ?? "unknown"}`,
    `- Clustering input: ${summary.graphifyGemini.clusteringInputTokens ?? "unknown"}`,
    `- Clustering output: ${summary.graphifyGemini.clusteringOutputTokens ?? "unknown"}`,
    `- Gemini total (known parts): ${summary.graphifyGemini.total ?? "unknown"}`,
    `- Sources: ${summary.graphifyGemini.sources.join(", ") || "none"}`,
    summary.graphifyGemini.unknownFields.length
      ? `- Unknown fields: ${summary.graphifyGemini.unknownFields.join(", ")}`
      : "",
    "",
    "## Supplied context tokens",
    `- Graphify context: ${summary.graphifyContextTokens}`,
    `- repo-context context: ${summary.repoContextContextTokens}`,
    "",
    "## Codex-only (median client totals)",
    `- Graphify: ${summary.graphifyCodexMedian ?? "unknown"}`,
    `- repo-context: ${summary.repoContextCodexMedian ?? "unknown"}`,
    `- Reduction: ${summary.codexOnly.reductionPct ?? "unknown"}%`,
    "",
    "## End-to-end AI tokens (full Gemini + context + Codex median)",
    `- Graphify: ${summary.endToEnd.graphifyTotal ?? "unknown"}`,
    `- repo-context: ${summary.endToEnd.repoContextTotal ?? "unknown"} (external LLM indexing: 0)`,
    `- Reduction: ${summary.endToEnd.reductionPct ?? "unknown"}%`,
    "",
    "## Partial end-to-end (clustering Gemini only + context + Codex)",
    `- Graphify clustering subtotal: ${summary.graphifyGemini.clusteringOnlyTotal ?? "unknown"}`,
    `- Graphify partial total: ${summary.endToEnd.graphifyPartialTotalClusteringOnly ?? "unknown"}`,
    `- Partial reduction vs repo-context: ${summary.endToEnd.partialReductionPctClusteringOnly ?? "unknown"}%`,
    `- Extraction Gemini tokens: unknown (not estimated)`,
    "",
    "## Build cost note",
    summary.buildCostNote,
    "",
    "## Scoped verdict language",
    summary.allowedScopedVerdict,
    "",
    summary.incomplete ? `Incomplete: ${summary.incompleteReason ?? "see unknown fields"}` : "Complete.",
  ];
  fs.writeFileSync(path.join(outDir, "summary.md"), `${md.filter(Boolean).join("\n")}\n`, "utf8");
}

function main(): void {
  const args = parseCliArgs();
  const summary = buildEndToEndAiCostSummary(process.cwd(), { rerunGraphify: readBooleanArg(args, "rerun-graphify") });
  writeEndToEndAiCostSummary(summary);
  console.log(`end_to_end_ai_cost incomplete=${summary.incomplete} e2e_reduction=${summary.endToEnd.reductionPct ?? "unknown"}%`);
}

if (process.argv[1]?.includes("endToEndAiCost")) {
  main();
}
