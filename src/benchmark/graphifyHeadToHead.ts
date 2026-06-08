import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { COMPRESSION_OUTPUT_DIR } from "./compressionReport.js";

const REPORT_PATH = path.join(COMPRESSION_OUTPUT_DIR, "graphify-head-to-head-report.md");
const PROTOCOL_PATH = "docs/benchmarks/graphify-head-to-head.md";

function which(bin: string): string | undefined {
  const run = spawnSync("which", [bin], { encoding: "utf8" });
  if (run.status === 0) {
    const resolved = run.stdout.trim();
    return resolved.length > 0 ? resolved : undefined;
  }
  return undefined;
}

function main(): void {
  const root = process.cwd();
  const graphifyPath = which("graphify");
  const lines: string[] = [
    "# Graphify head-to-head run report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Status",
    "",
  ];

  if (!graphifyPath) {
    lines.push("**Graphify run: NOT_RUN**");
    lines.push("");
    lines.push("Graphify CLI was not found on PATH.");
    lines.push(`Protocol only: \`${PROTOCOL_PATH}\``);
    lines.push("");
    lines.push("Install Graphify and re-run:");
    lines.push("");
    lines.push("```bash");
    lines.push("npm run benchmark:graphify-head-to-head");
    lines.push("```");
  } else {
    lines.push("**Graphify run: ATTEMPTED**");
    lines.push("");
    lines.push(`Binary: ${graphifyPath}`);
    const help = spawnSync(graphifyPath, ["--help"], { encoding: "utf8", timeout: 30_000 });
    const helpText = `${help.stdout}\n${help.stderr}`.trim();
    lines.push("");
    lines.push("### graphify --help (excerpt)");
    lines.push("");
    lines.push("```text");
    lines.push(helpText.split("\n").slice(0, 40).join("\n") || "(no help output)");
    lines.push("```");
    lines.push("");
    lines.push(
      "No automated Graphify auth-discovery query was executed because command semantics vary by install. Follow the manual protocol in docs/benchmarks/graphify-head-to-head.md and record tokens there.",
    );
    lines.push("");
    lines.push("Do not claim repo-context-mcp beat Graphify without same-repo same-task measured results.");
  }

  lines.push("");
  lines.push("## Protocol");
  lines.push("");
  lines.push(`See [${PROTOCOL_PATH}](${PROTOCOL_PATH}).`);
  lines.push("");
  lines.push("## Non-claims");
  lines.push("");
  lines.push("- Diagnostic compression ≠ real agent billing savings");
  lines.push("- Codex PROVEN_SAVINGS_STABLE does not imply Graphify superiority");
  lines.push("- Head-to-head required before any comparative claim");

  const outDir = path.resolve(COMPRESSION_OUTPUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const reportFile = path.join(outDir, "graphify-head-to-head-report.md");
  fs.writeFileSync(reportFile, `${lines.join("\n")}\n`, "utf8");

  console.log(`Graphify head-to-head report: ${reportFile}`);
  console.log(graphifyPath ? "Graphify found — protocol report written (manual run required)." : "Graphify NOT_RUN — protocol only.");
  if (!graphifyPath) {
    console.log(`Protocol: ${path.join(root, PROTOCOL_PATH)}`);
  }
}

main();
