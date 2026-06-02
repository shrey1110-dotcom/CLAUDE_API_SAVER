import fs from "node:fs";
import path from "node:path";
import { comparePlan } from "./compare.js";
import { AB_LATEST_REPORT_FILE, readCurrentPlan, readPlanResults, resolveAbPath } from "./paths.js";
import { getModePrompt } from "./prompts.js";
import type { AbMode, AbRunResult } from "./types.js";

export type RoutingVerdict = "correct_route" | "fallback_used" | "incorrect_route" | "inconclusive";

export interface RoutingAssessment {
  tools: string[];
  requiredToolUsed: boolean;
  forbiddenToolsUsed: string[];
  verdict: RoutingVerdict;
  note?: string;
}

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

function toolsFromResult(result: AbRunResult | undefined): string[] {
  const all = [...(result?.mcpToolsUsed ?? []), ...(result?.toolsUsed ?? [])];
  return [...new Set(all.map((tool) => tool.trim().toLowerCase()).filter((tool) => tool.length > 0))];
}

function hasAnyTool(tools: string[], names: string[]): boolean {
  return names.some((name) => tools.some((tool) => tool === name || tool.includes(name)));
}

function hasJustifiedFallback(result: AbRunResult | undefined): boolean {
  const notes = `${result?.notes ?? ""}`.toLowerCase();
  return /insufficient|missing|error|failed/.test(notes);
}

export function assessRouting(mode: AbMode, result: AbRunResult | undefined): RoutingAssessment {
  const tools = toolsFromResult(result);
  if (!result) {
    return { tools: [], requiredToolUsed: false, forbiddenToolsUsed: [], verdict: "inconclusive", note: "No run result." };
  }

  if (mode === "no_mcp") {
    const hasMcpTools = tools.length > 0;
    return {
      tools,
      requiredToolUsed: !hasMcpTools,
      forbiddenToolsUsed: hasMcpTools ? tools : [],
      verdict: hasMcpTools ? "fallback_used" : "correct_route",
      note: hasMcpTools ? "No-MCP baseline reported tool usage." : undefined,
    };
  }

  if (mode === "compact_search") {
    const requiredToolUsed = hasAnyTool(tools, ["repo_map", "search_code"]);
    const forbiddenToolsUsed = tools.filter((tool) =>
      ["context_pack", "graph_query", "graph_symbol", "graph_neighbors", "graph_paths"].some((bad) => tool.includes(bad)),
    );
    if (!requiredToolUsed) {
      return { tools, requiredToolUsed, forbiddenToolsUsed, verdict: "inconclusive", note: "Missing compact-search tool evidence." };
    }
    return {
      tools,
      requiredToolUsed,
      forbiddenToolsUsed,
      verdict: forbiddenToolsUsed.length > 0 ? "fallback_used" : "correct_route",
    };
  }

  if (mode === "graph") {
    const requiredToolUsed = hasAnyTool(tools, ["graph_query", "graph_symbol", "graph_status"]);
    const forbiddenToolsUsed = tools.filter((tool) => tool.includes("context_pack"));
    if (!requiredToolUsed) {
      return { tools, requiredToolUsed, forbiddenToolsUsed, verdict: "inconclusive", note: "Missing graph tool evidence." };
    }
    return {
      tools,
      requiredToolUsed,
      forbiddenToolsUsed,
      verdict: forbiddenToolsUsed.length > 0 ? "incorrect_route" : "correct_route",
    };
  }

  const hasContextStatus = hasAnyTool(tools, ["context_status"]);
  const hasContextPack = hasAnyTool(tools, ["context_pack"]);
  const requiredToolUsed = hasContextStatus && hasContextPack;
  const forbiddenToolsUsed = tools.filter((tool) => tool.includes("repo_map") || tool.includes("search_code"));
  if (!requiredToolUsed) {
    return {
      tools,
      requiredToolUsed,
      forbiddenToolsUsed,
      verdict: "incorrect_route",
      note: "context_status/context_pack not both present.",
    };
  }
  if (forbiddenToolsUsed.length === 0) {
    return { tools, requiredToolUsed, forbiddenToolsUsed, verdict: "correct_route" };
  }
  return {
    tools,
    requiredToolUsed,
    forbiddenToolsUsed,
    verdict: hasJustifiedFallback(result) ? "fallback_used" : "incorrect_route",
    note: hasJustifiedFallback(result) ? "Fallback justified in notes." : "Fallback tools used without justification.",
  };
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
      const routing = assessRouting(mode, result);
      return `| ${mode} | ${value(result?.clientTotalTokens)} | ${value(result?.mcpEstimatedOutputTokens)} | ${value(result?.combinedTotalTokens)} | ${value(result?.answerQuality)} | ${value(result?.foundExpectedFiles)} | ${list(routing.tools)} | ${routing.requiredToolUsed ? "yes" : "no"} | ${list(routing.forbiddenToolsUsed)} | ${routing.verdict} | ${list(result?.filesRead)} |`;
    })
    .join("\n");

  const routingWarnings = plan.modes
    .map((mode) => ({ mode, routing: assessRouting(mode, findByMode(results, mode)) }))
    .filter((entry) => entry.mode === "context_broker" && entry.routing.verdict !== "correct_route");

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

| Mode | Client total tokens | MCP estimated output tokens | Combined total tokens | Answer quality | Found expected files | Tools used | Required tool used | Forbidden tools used | Routing verdict | Files read |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
${rows}

## 3b. Routing warnings

${routingWarnings.length === 0 ? "- None" : routingWarnings.map((entry) => `- ${entry.mode}: ${entry.routing.verdict}${entry.routing.note ? ` (${entry.routing.note})` : ""}`).join("\n")}

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
- Context-broker mode is valid only if routing shows \`context_status\` + \`context_pack\` with no unjustified fallback.
`;

  const reportPath = resolveAbPath(AB_LATEST_REPORT_FILE);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown, "utf8");
  console.log(`A/B report written to ${reportPath}`);
}

main();
