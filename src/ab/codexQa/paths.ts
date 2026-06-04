import fs from "node:fs";
import path from "node:path";

export const CODEX_QA_DIR = ".mcp-ab-tests/codex-qa";
export const CODEX_QA_RUNS_DIR = path.join(CODEX_QA_DIR, "runs");
export const CODEX_QA_RESULTS_DIR = path.join(CODEX_QA_DIR, "results");
export const CODEX_QA_CURRENT_SUITE = path.join(CODEX_QA_DIR, "current-suite.json");
export const CODEX_QA_REPORT = ".mcp-ab-tests/reports/codex-multi-task-locked-report.md";
export const CODEX_QA_PROOF_DOC = "docs/proofs/codex-multi-task-locked.md";

export function ensureCodexQaDirs(): void {
  for (const dir of [CODEX_QA_DIR, CODEX_QA_RUNS_DIR, CODEX_QA_RESULTS_DIR, ".mcp-ab-tests/reports", ".context-packs", "docs/proofs"]) {
    fs.mkdirSync(path.resolve(dir), { recursive: true });
  }
}

export function suiteTaskDir(taskName: string): string {
  return path.join(CODEX_QA_RUNS_DIR, taskName);
}

export function suiteResultPath(taskName: string, mode: string): string {
  return path.join(CODEX_QA_RESULTS_DIR, taskName, `${mode}.json`);
}

export function writeJson(filePath: string, value: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson<T>(filePath: string): T | null {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, "utf8")) as T;
}

