import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SelfIterateAnalysis, SelfIterateRecommendation } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_DIR = path.join(ROOT, ".mcp-self-improve");

export function recommendFromAnalysis(analysis: SelfIterateAnalysis): SelfIterateRecommendation[] {
  const recommendations: SelfIterateRecommendation[] = [];

  for (const finding of analysis.findings) {
    if (finding.id === "tool-loop-failure" || finding.id === "broker-tool-loop") {
      recommendations.push({
        id: "use-locked-mode",
        class: "do_not_auto_apply",
        title: "Use context_broker_locked for Codex proof",
        detail: "Do not expose graph/search/symbol tools to Codex for savings proof.",
      });
      recommendations.push({
        id: "analyze-failed-codex",
        class: "safe_auto",
        title: "Keep failed-run analyzer enabled",
        detail: "Run npm run analyze:failed-codex after full-context failures.",
        action: "document_only",
      });
    }
    if (finding.id === "fallback-overuse") {
      recommendations.push({
        id: "tighten-prompt-caps",
        class: "needs_review",
        title: "Review context_broker prompt fallback budgets",
        detail: "Fallback tools are dominating telemetry.",
      });
    }
    if (finding.id === "locked-quality-miss") {
      recommendations.push({
        id: "auth-synonyms",
        class: "safe_auto",
        title: "Expand auth task synonym mappings",
        detail: "Add login/session/auth synonyms to querySynonyms config for ranking.",
        action: "update_query_synonyms",
      });
      recommendations.push({
        id: "auth-fixture-test",
        class: "safe_auto",
        title: "Keep auth-discovery fixture tests",
        detail: "Ensure benchmark:context-locked checks 5/5 expected files.",
        action: "document_only",
      });
    }
    if (finding.id === "locked-proof-incomplete") {
      recommendations.push({
        id: "run-local-locked-proof",
        class: "do_not_auto_apply",
        title: "Complete locked Codex proof locally",
        detail: "Run npm run codex:proof:locked:instructions where Codex CLI is installed.",
      });
    }
    if (finding.id === "high-mcp-output") {
      recommendations.push({
        id: "tighten-output-caps",
        class: "needs_review",
        title: "Review MCP output caps",
        detail: "Telemetry MCP output exceeded compact target.",
      });
    }
  }

  recommendations.push({
    id: "no-fake-proof",
    class: "do_not_auto_apply",
    title: "Never claim savings without real A/B proof",
    detail: "ab:real-check and ab:proof-report must pass with 3 locked repeats.",
  });

  return recommendations;
}

export function writeRecommendations(
  analysis: SelfIterateAnalysis,
  recommendations: SelfIterateRecommendation[],
  root = ROOT,
): { mdPath: string; jsonPath: string } {
  const outDir = path.join(root, ".mcp-self-improve");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "recommendations.json");
  const mdPath = path.join(outDir, "recommendations.md");

  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ analysis, recommendations }, null, 2)}\n`,
    "utf8",
  );

  const lines = [
    "# Self-improvement recommendations",
    "",
    `Generated: ${analysis.generatedAt}`,
    "",
    "## Findings",
    "",
    ...analysis.findings.map((f) => `- [${f.severity}] ${f.category}: ${f.message}${f.evidence ? ` (${f.evidence})` : ""}`),
    "",
    "## Recommendations",
    "",
    ...recommendations.map(
      (r) => `### ${r.title} (${r.class})\n\n${r.detail}${r.action ? `\n\nAction: ${r.action}` : ""}`,
    ),
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return { mdPath, jsonPath };
}
