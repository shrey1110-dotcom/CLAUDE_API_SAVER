import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessContextBrokerToolLoop } from "../ab/toolLoopPolicy.js";
import { analyzeFailedCodexLog } from "../telemetry/failedRunAnalyze.js";
import { readTelemetryEntries } from "../telemetry/reader.js";
import type { SelfIterateAnalysis, SelfIterateFinding } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveFailedCodexLog(root: string): string | null {
  const runtimeLog = path.join(root, ".mcp-ab-tests", "failed-runs", "codex-full-context-logs.jsonl");
  if (fs.existsSync(runtimeLog)) return runtimeLog;
  const fixtureLog = path.join(root, "tests/fixtures/codex-full-context-failure.jsonl");
  if (fs.existsSync(fixtureLog)) return fixtureLog;
  return null;
}

function readJsonDir(dir: string): unknown[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as unknown;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function analyzeSelfIteration(root = ROOT): SelfIterateAnalysis {
  const findings: SelfIterateFinding[] = [];

  const failedLog = resolveFailedCodexLog(root);
  if (failedLog) {
    const failed = analyzeFailedCodexLog(failedLog);
    if (failed.toolLoop.toolLoopFailure) {
      findings.push({
        id: "tool-loop-failure",
        category: "routing",
        severity: "failure",
        message: "Full context_broker Codex run entered a tool exploration loop.",
        evidence: `${failed.telemetry.totalCalls} MCP calls, ~${failed.telemetry.estimatedTotalTokens} MCP tokens`,
      });
    }
    if (failed.contextPackOverCalled) {
      findings.push({
        id: "context-pack-overcalled",
        category: "routing",
        severity: "warning",
        message: "context_pack called more than expected in failed full-context run.",
      });
    }
  }

  const telemetry = readTelemetryEntries(path.join(root, ".mcp-telemetry", "logs.jsonl"));
  if (telemetry.length > 0) {
    const fallbackTools = telemetry.filter((e) =>
      ["repo_map", "search_code", "graph_query", "graph_symbol", "get_symbol_context"].includes(e.tool),
    );
    if (fallbackTools.length > telemetry.length / 2) {
      findings.push({
        id: "fallback-overuse",
        category: "routing",
        severity: "warning",
        message: "Telemetry shows fallback tools dominating discovery route.",
        evidence: `${fallbackTools.length}/${telemetry.length} calls`,
      });
    }
    const totalMcpTokens = telemetry.reduce((sum, e) => sum + e.estimatedOutputTokens, 0);
    if (totalMcpTokens > 1500) {
      findings.push({
        id: "high-mcp-output",
        category: "budget",
        severity: "warning",
        message: "MCP output tokens exceed compact budget target.",
        evidence: `${totalMcpTokens} tokens`,
      });
    }
  }

  const results = readJsonDir(path.join(root, ".mcp-ab-tests", "results")) as Array<{
    mode?: string;
    foundExpectedFiles?: boolean;
    answerQuality?: number;
    mcpToolCallCounts?: Record<string, number>;
    combinedTotalTokens?: number;
    clientTotalTokens?: number;
  }>;

  for (const result of results) {
    if (result.mode === "context_broker_locked" && result.foundExpectedFiles === false) {
      findings.push({
        id: "locked-quality-miss",
        category: "quality",
        severity: "warning",
        message: "Locked mode did not find all expected auth-discovery files.",
      });
    }
    if (result.mode === "context_broker" && result.mcpToolCallCounts) {
      const loop = assessContextBrokerToolLoop({ counts: result.mcpToolCallCounts });
      if (loop.toolLoopFailure) {
        findings.push({
          id: "broker-tool-loop",
          category: "routing",
          severity: "failure",
          message: "context_broker result exceeds fallback tool budgets.",
        });
      }
    }
    if (
      result.mode === "context_broker_locked" &&
      typeof result.combinedTotalTokens === "number" &&
      typeof result.clientTotalTokens === "number" &&
      result.combinedTotalTokens > 300000
    ) {
      findings.push({
        id: "locked-high-usage",
        category: "usage",
        severity: "info",
        message: "Locked mode combined usage is high — investigate variance, do not claim savings.",
      });
    }
  }

  for (const result of results) {
    if (result.mode !== "context_broker_locked") continue;
    const repeats = (result as { clientTotalTokenRepeats?: number[] }).clientTotalTokenRepeats?.length ?? 1;
    if (repeats < 3) {
      findings.push({
        id: "locked-proof-incomplete",
        category: "proof",
        severity: "warning",
        message: "Locked Codex proof incomplete — fewer than 3 valid repeats.",
        evidence: `${repeats}/3`,
      });
      break;
    }
  }

  return { generatedAt: new Date().toISOString(), findings };
}
// ci uses committed fixture when runtime log missing
