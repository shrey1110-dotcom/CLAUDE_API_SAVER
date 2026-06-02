import fs from "node:fs";
import path from "node:path";
import type { AbRunResult, AbTestPlan } from "./types.js";

export const AB_DIR = ".mcp-ab-tests";
export const AB_PLANS_DIR = path.join(AB_DIR, "plans");
export const AB_RESULTS_DIR = path.join(AB_DIR, "results");
export const AB_REPORTS_DIR = path.join(AB_DIR, "reports");
export const AB_CURRENT_PLAN_FILE = path.join(AB_DIR, "current-plan.json");
export const AB_LATEST_REPORT_FILE = path.join(AB_REPORTS_DIR, "latest-ab-report.md");
export const AB_LATEST_COMPARISON_FILE = path.join(AB_REPORTS_DIR, "latest-ab-comparison.json");
export const AB_COMMAND_ADAPTER_CONFIG = path.join(AB_DIR, "client-adapter.json");
export const AB_CODEX_ADAPTER_CONFIG = path.join(AB_DIR, "codex-adapter.json");
export const AB_CODEX_RUNS_DIR = path.join(AB_DIR, "codex-runs");

export function resolveAbPath(relPath: string): string {
  return path.resolve(relPath);
}

export function ensureAbDirectories(): void {
  fs.mkdirSync(resolveAbPath(AB_PLANS_DIR), { recursive: true });
  fs.mkdirSync(resolveAbPath(AB_RESULTS_DIR), { recursive: true });
  fs.mkdirSync(resolveAbPath(AB_REPORTS_DIR), { recursive: true });
  fs.mkdirSync(resolveAbPath(AB_CODEX_RUNS_DIR), { recursive: true });
}

export function writeJsonFile(relPath: string, value: unknown): void {
  const fullPath = resolveAbPath(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJsonFile<T>(relPath: string): T | null {
  const fullPath = resolveAbPath(relPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

export function readCurrentPlan(): AbTestPlan | null {
  return readJsonFile<AbTestPlan>(AB_CURRENT_PLAN_FILE);
}

export function writeCurrentPlan(plan: AbTestPlan): void {
  writeJsonFile(AB_CURRENT_PLAN_FILE, plan);
}

export function planFilePath(planId: string): string {
  return path.join(AB_PLANS_DIR, `${planId}.json`);
}

export function resultFilePath(planId: string, mode: string): string {
  return path.join(AB_RESULTS_DIR, `${planId}--${mode}.json`);
}

export function readPlanResults(planId: string): AbRunResult[] {
  const resultsDir = resolveAbPath(AB_RESULTS_DIR);
  if (!fs.existsSync(resultsDir)) {
    return [];
  }

  const results: AbRunResult[] = [];
  for (const name of fs.readdirSync(resultsDir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const fullPath = path.join(resultsDir, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8")) as AbRunResult;
      if (parsed.planId === planId) {
        results.push(parsed);
      }
    } catch {
      // Skip malformed result files.
    }
  }

  return results.sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
}
