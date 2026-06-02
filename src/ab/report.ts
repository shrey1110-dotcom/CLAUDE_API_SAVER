import fs from "node:fs";
import path from "node:path";
import { comparePlan } from "./compare.js";
import { AB_LATEST_REPORT_FILE, readCurrentPlan, readPlanResults, resolveAbPath } from "./paths.js";
import { getModePrompt } from "./prompts.js";
import type { AbMode, AbRunResult } from "./types.js";

function modeLabel(mode: AbMode): string {
  if (mode === "no_mcp") return "A: no_mcp";
  if (mode === "compact_search") return "B: compact_search";
  if (mode === "graph") return "C: graph";
  return "D: context_broker";
}

function findByMode(results: AbRunResult[], mode: AbMode): AbRunResult | undefined {
  return results.find((result) => result.mode === mode);
}

function list(items: string[] | undefined): string {
  return (items ?? []).length > 0 ? (items ?? []).join(", ") : "-";
}

function value(input: number | boolean | undefined): string {
  if (typeof input === "number") {
    return `${input}`;
  }
  if (typeof input === "boolean") {
    return input ? "true" : "false";
  }
  return "-";
}

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:create first.");
    process.exit(1);
  }
  const results = readPlanResults(plan.id);
  const outcome = comparePlan(plan, results);

  const promptsSection = plan.modes
    .map((mode) => `### ${modeLabel(mode)}\n\n\`\`\`text\n${getModePrompt(mode, plan.taskPrompt)}\n\`\`\``)
    .join("\n\n");

  const rows = plan.modes
    .map((mode) => {
      const result = findByMode(results, mode);
      return `| ${mode} | ${value(result?.clientTotalTokens)} | ${value(result?.mcpEstimatedOutputTokens)} | ${value(result?.combinedTotalTokens)} | ${value(result?.answerQuality)} | ${value(result?.foundExpectedFiles)} | ${list(result?.toolsUsed ?? result?.mcpToolsUsed)} | ${list(result?.filesRead)} |`;
    })
    .join("\n");

  const markdown = `# A/B Test Report

Generated: ${new Date().toISOString()}

## 1. Test setup

- Client: ${plan.client}
- Model: ${plan.model ?? "not provided"}
- Repo: ${plan.repoPath}
- Task: ${plan.taskName}
- Date: ${plan.createdAt}
- Modes tested: ${plan.modes.join(", ")}

## 2. Prompt used per mode

${promptsSection}

## 3. Result table

| Mode | Client total tokens | MCP estimated output tokens | Combined total tokens | Answer quality | Found expected files | Tools used | Files read |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
${rows}

## 4. Winner calculation

- Baseline mode: no_mcp
- Winner: ${outcome.report.winner ?? "none"}
- Comparison rule: quality parity first, then lowest combined tokens, then fewer files read, then fewer MCP tool calls.

## 5. Verdict

- Verdict: ${outcome.report.verdict}
- Summary: ${outcome.report.summary}

## 6. Recommendation

- ${outcome.recommendation}

## 7. Important note

- Benchmark savings are not the same as real client savings.
- Each client must be tested separately before claiming savings.
`;

  const reportPath = resolveAbPath(AB_LATEST_REPORT_FILE);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown, "utf8");
  console.log(`A/B report written to ${reportPath}`);
}

main();
