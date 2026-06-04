import fs from "node:fs";
import path from "node:path";
import type { FileContextPlan, FileContextResult } from "./types.js";

export const FC_DIR = ".mcp-ab-tests";
export const FC_PLANS_DIR = path.join(FC_DIR, "file-context-plans");
export const FC_RESULTS_DIR = path.join(FC_DIR, "file-context-results");
export const FC_CURRENT_PLAN_FILE = path.join(FC_DIR, "file-context-current-plan.json");
export const FC_REPORT_FILE = path.join(FC_DIR, "reports", "file-context-ab-report.md");
export const FC_COMPARISON_FILE = path.join(FC_DIR, "reports", "file-context-ab-comparison.json");

export function resolveFcPath(relPath: string): string {
  return path.resolve(relPath);
}

export function ensureFcDirectories(): void {
  fs.mkdirSync(resolveFcPath(FC_PLANS_DIR), { recursive: true });
  fs.mkdirSync(resolveFcPath(FC_RESULTS_DIR), { recursive: true });
  fs.mkdirSync(resolveFcPath(path.dirname(FC_REPORT_FILE)), { recursive: true });
}

export function writeFcJson(relPath: string, value: unknown): void {
  const fullPath = resolveFcPath(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readFcJson<T>(relPath: string): T | null {
  const fullPath = resolveFcPath(relPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

export function readCurrentFileContextPlan(): FileContextPlan | null {
  return readFcJson<FileContextPlan>(FC_CURRENT_PLAN_FILE);
}

export function writeCurrentFileContextPlan(plan: FileContextPlan): void {
  writeFcJson(FC_CURRENT_PLAN_FILE, plan);
}

export function planFilePath(planId: string): string {
  return path.join(FC_PLANS_DIR, `${planId}.json`);
}

export function resultFilePath(planId: string, mode: string): string {
  return path.join(FC_RESULTS_DIR, `${planId}--${mode}.json`);
}

export function readPlanResults(planId: string): FileContextResult[] {
  const resultsDir = resolveFcPath(FC_RESULTS_DIR);
  if (!fs.existsSync(resultsDir)) {
    return [];
  }

  const results: FileContextResult[] = [];
  for (const name of fs.readdirSync(resultsDir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(resultsDir, name), "utf8")) as FileContextResult;
      if (parsed.planId === planId) {
        results.push(parsed);
      }
    } catch {
      // Skip malformed result files.
    }
  }

  return results.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}
