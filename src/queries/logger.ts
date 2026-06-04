import fs from "node:fs";
import { ensureQueriesDir, getQueriesLogPath } from "./paths.js";
import type { ContextQueryLogEntry } from "./types.js";

export function logContextQuery(entry: Omit<ContextQueryLogEntry, "timestamp">, root?: string): void {
  ensureQueriesDir(root);
  const record: ContextQueryLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(getQueriesLogPath(root), `${JSON.stringify(record)}\n`, "utf8");
}
