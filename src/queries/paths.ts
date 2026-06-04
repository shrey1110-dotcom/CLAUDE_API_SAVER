import fs from "node:fs";
import path from "node:path";
import { resolveRoot } from "../pathSafety.js";

export const QUERIES_DIR = ".repo-context-queries";
export const QUERIES_LOG_FILE = "queries.jsonl";
export const QUERIES_REPORT_FILE = "report.md";

export function getQueriesDir(root?: string): string {
  return path.join(resolveRoot(root), QUERIES_DIR);
}

export function getQueriesLogPath(root?: string): string {
  return path.join(getQueriesDir(root), QUERIES_LOG_FILE);
}

export function ensureQueriesDir(root?: string): string {
  const dir = getQueriesDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
