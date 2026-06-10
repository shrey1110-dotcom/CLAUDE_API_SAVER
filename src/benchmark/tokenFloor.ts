import fs from "node:fs";
import path from "node:path";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";
import {
  BEST_EFFORT_DIR,
  GRAPHIFY_BEST_EFFORT_CONTEXT,
  REPO_CONTEXT_BEST_EFFORT_CONTEXT,
} from "./bestEffortSkillHeadToHead.js";
import {
  buildGraphifySkillPrompt,
  buildRepoContextSkillPrompt,
  DEFAULT_CODEX_BIN,
  runSuppliedContextCodexOnce,
} from "./codexSuppliedContext.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { AUTH_DISCOVERY_TASK } from "./skillHeadToHead.js";
import { estimateTokensFromText } from "../cli/skillPack.js";

export const TOKEN_FLOOR_DIR = ".mcp-benchmarks/token-floor";
const REPEATS = 3;

const DUMMY_50 =
  "Auth/session hint: login.ts session.ts auth.controller session.service LoginPage — fixture paths only.";

export interface TokenFloorVariant {
  id: string;
  contextTokens: number;
  clientTotals: number[];
  median: number | null;
  mean: number | null;
  incomplete: boolean;
}

export interface TokenFloorSummary {
  generatedAt: string;
  taskName: "auth-discovery";
  codexBin: string;
  repeats: number;
  variants: TokenFloorVariant[];
  fixedOverheadEstimate: number | null;
  contextDependentRange: number | null;
  interpretation: string;
}

export async function runTokenFloorBenchmark(options: {
  repoPath?: string;
  codexBin?: string;
  repeats?: number;
}): Promise<TokenFloorSummary> {
  const repoPath = path.resolve(options.repoPath ?? process.cwd());
  const codexBin = options.codexBin ?? DEFAULT_CODEX_BIN;
  const repeats = options.repeats ?? REPEATS;
  const outDir = path.join(repoPath, TOKEN_FLOOR_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const graphifyContext = fs.existsSync(path.join(repoPath, GRAPHIFY_BEST_EFFORT_CONTEXT))
    ? fs.readFileSync(path.join(repoPath, GRAPHIFY_BEST_EFFORT_CONTEXT), "utf8")
    : "";
  const repoContext = fs.existsSync(path.join(repoPath, REPO_CONTEXT_BEST_EFFORT_CONTEXT))
    ? fs.readFileSync(path.join(repoPath, REPO_CONTEXT_BEST_EFFORT_CONTEXT), "utf8")
    : "";

  const cases: Array<{
    id: string;
    context: string;
    arm: "graphify" | "repo-context";
    buildPrompt: (ctx: string) => string;
  }> = [
    {
      id: "empty",
      context: "",
      arm: "repo-context",
      buildPrompt: (ctx) => buildRepoContextSkillPrompt(ctx, AUTH_DISCOVERY_TASK, true),
    },
    {
      id: "dummy-50",
      context: DUMMY_50,
      arm: "repo-context",
      buildPrompt: (ctx) => buildRepoContextSkillPrompt(ctx, AUTH_DISCOVERY_TASK, true),
    },
    {
      id: "repo-context-ultra",
      context: repoContext,
      arm: "repo-context",
      buildPrompt: (ctx) => buildRepoContextSkillPrompt(ctx, AUTH_DISCOVERY_TASK, true),
    },
    {
      id: "graphify-1453",
      context: graphifyContext,
      arm: "graphify",
      buildPrompt: (ctx) => buildGraphifySkillPrompt(ctx, AUTH_DISCOVERY_TASK, true),
    },
    {
      id: "expected-file-list",
      context: (() => {
        const profile = getCodexQaTask("auth-discovery");
        return profile
          ? `# Control: expected file paths only (no answers)\n${profile.expectedFilePatterns.join("\n")}`
          : "";
      })(),
      arm: "repo-context",
      buildPrompt: (ctx) => buildRepoContextSkillPrompt(ctx, AUTH_DISCOVERY_TASK, true),
    },
  ];

  const variants: TokenFloorVariant[] = [];
  for (const variant of cases) {
    const totals: number[] = [];
    let incomplete = false;
    for (let i = 1; i <= repeats; i += 1) {
      const runDir = path.join(outDir, variant.id, `repeat-${i}`);
      try {
        const result = await runSuppliedContextCodexOnce({
          codexBin,
          repoPath,
          prompt: variant.buildPrompt(variant.context),
          runDir,
          repeat: i,
          arm: variant.arm,
          taskName: "auth-discovery",
        });
        if (result.clientTotalTokens) totals.push(result.clientTotalTokens);
      } catch {
        incomplete = true;
      }
    }
    const stats = totals.length ? calculateRepeatStats(totals) : undefined;
    variants.push({
      id: variant.id,
      contextTokens: estimateTokensFromText(variant.context),
      clientTotals: totals,
      median: stats?.median ?? null,
      mean: stats?.mean ?? null,
      incomplete,
    });
  }

  const repoUltra = variants.find((v) => v.id === "repo-context-ultra");
  const graphifyVariant = variants.find((v) => v.id === "graphify-1453");
  const fixedOverheadEstimate = repoUltra?.median ?? null;
  const contextDependentRange =
    repoUltra?.median !== null &&
    repoUltra?.median !== undefined &&
    graphifyVariant?.median !== null &&
    graphifyVariant?.median !== undefined
      ? graphifyVariant.median - repoUltra.median
      : null;

  const summary: TokenFloorSummary = {
    generatedAt: new Date().toISOString(),
    taskName: "auth-discovery",
    codexBin,
    repeats,
    variants,
    fixedOverheadEstimate,
    contextDependentRange,
    interpretation:
      "Stable supplied-context Codex usage clusters near ~21k tokens (repo-context-ultra median). Empty/dummy variants are high-variance when Codex searches the repo. Context size changes of ~1.3k tokens move median totals only a few percent when overhead dominates.",
  };

  writeTokenFloorSummary(summary, outDir);
  return summary;
}

export function writeTokenFloorSummary(summary: TokenFloorSummary, outDir = TOKEN_FLOOR_DIR): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const lines = [
    "# Token floor analysis (auth-discovery)",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Variants",
    ...summary.variants.map(
      (v) =>
        `- **${v.id}**: context=${v.contextTokens} tokens, median Codex=${v.median ?? "n/a"}, mean=${v.mean ?? "n/a"}`,
    ),
    "",
    "## Estimates",
    `- Fixed overhead estimate (min median): ${summary.fixedOverheadEstimate ?? "n/a"}`,
    `- Context-dependent range (max−min median): ${summary.contextDependentRange ?? "n/a"}`,
    "",
    "## Interpretation",
    summary.interpretation,
  ];
  fs.writeFileSync(path.join(outDir, "summary.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const summary = await runTokenFloorBenchmark({
    repoPath: readStringArg(args, "repo"),
    codexBin: readStringArg(args, "codex-bin"),
    repeats: readNumberArg(args, "repeat"),
  });
  console.log(`token_floor fixed_overhead~${summary.fixedOverheadEstimate} range=${summary.contextDependentRange}`);
}

if (process.argv[1]?.includes("tokenFloor")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
