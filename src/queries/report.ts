import fs from "node:fs";
import { ensureQueriesDir, getQueriesDir, getQueriesLogPath } from "./paths.js";
import type { ContextQueryLogEntry } from "./types.js";

function readEntries(root?: string): ContextQueryLogEntry[] {
  const logPath = getQueriesLogPath(root);
  if (!fs.existsSync(logPath)) return [];
  const entries: ContextQueryLogEntry[] = [];
  for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as ContextQueryLogEntry);
    } catch {
      // skip malformed
    }
  }
  return entries;
}

function main(): void {
  const entries = readEntries();
  ensureQueriesDir();
  const reportPath = `${getQueriesDir()}/report.md`;
  const totalTokens = entries.reduce((sum, e) => sum + e.estimatedOutputTokens, 0);
  const lines = [
    "# Context query report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Total queries: ${entries.length}`,
    `- Total estimated output tokens: ${totalTokens}`,
    `- Average estimated output tokens: ${entries.length ? Math.round(totalTokens / entries.length) : 0}`,
    "",
    "## Recent queries",
    "",
    "| Time | Task | Mode | Files | Docs | Assets | Est. tokens | Source |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...entries
      .slice(-20)
      .map(
        (e) =>
          `| ${e.timestamp} | ${e.task.slice(0, 40)} | ${e.mode} | ${e.fileCount} | ${e.docCount} | ${e.assetCount} | ${e.estimatedOutputTokens} | ${e.source} |`,
      ),
    "",
    "Note: query logs store metadata only — no source file contents.",
    "",
  ];
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`Query report written to ${reportPath}`);
  console.log(`Total queries logged: ${entries.length}`);
}

main();
