import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readBooleanArg } from "../ab/cli.js";
import { analyzeSelfIteration } from "./analyze.js";
import { recommendFromAnalysis, writeRecommendations } from "./recommend.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SYNONYMS_PATH = path.join(ROOT, "config", "querySynonyms.json");

const FORBIDDEN_APPLY_ACTIONS = new Set([
  "expose_locked_tools",
  "weaken_quality_threshold",
  "weaken_proof_threshold",
  "claim_savings",
  "edit_proof_results",
  "delete_failed_evidence",
]);

function loadSynonyms(): Record<string, string[]> {
  if (!fs.existsSync(SYNONYMS_PATH)) return { auth: ["login", "session", "authentication"] };
  try {
    return JSON.parse(fs.readFileSync(SYNONYMS_PATH, "utf8")) as Record<string, string[]>;
  } catch {
    return { auth: ["login", "session", "authentication"] };
  }
}

function applySafeRecommendation(action: string | undefined): string | null {
  if (!action || FORBIDDEN_APPLY_ACTIONS.has(action)) return null;
  if (action === "document_only") return "documented";
  if (action === "update_query_synonyms") {
    const synonyms = loadSynonyms();
    synonyms.auth = [...new Set([...(synonyms.auth ?? []), "signin", "sign-in", "user-session"])];
    fs.mkdirSync(path.dirname(SYNONYMS_PATH), { recursive: true });
    fs.writeFileSync(SYNONYMS_PATH, `${JSON.stringify(synonyms, null, 2)}\n`, "utf8");
    return `updated ${SYNONYMS_PATH}`;
  }
  return null;
}

function runValidation(): Array<{ command: string; ok: boolean; detail: string }> {
  const commands = [
    ["npm", ["run", "build"]],
    ["npm", ["run", "test:ab"]],
    ["npm", ["run", "benchmark:context-locked"]],
    ["npm", ["run", "release:check"]],
  ] as const;

  return commands.map(([command, args]) => {
    const result = spawnSync(command, [...args], { cwd: ROOT, encoding: "utf8" });
    return {
      command: `${command} ${args.join(" ")}`,
      ok: result.status === 0,
      detail: result.status === 0 ? "exit 0" : (result.stderr || result.stdout || "").slice(0, 200),
    };
  });
}

function main(): void {
  const args = parseCliArgs();
  const applySafe = readBooleanArg(args, "apply-safe") === true;
  const analysis = analyzeSelfIteration();
  const recommendations = recommendFromAnalysis(analysis);
  const { mdPath, jsonPath } = writeRecommendations(analysis, recommendations);

  const applied: string[] = [];
  if (applySafe) {
    for (const rec of recommendations.filter((r) => r.class === "safe_auto")) {
      const result = applySafeRecommendation(rec.action);
      if (result) applied.push(`${rec.id}: ${result}`);
    }
  }

  const validation = applySafe ? runValidation() : [];
  const reportPath = path.join(ROOT, ".mcp-self-improve", "iteration-report.md");
  const report = [
    "# Self-iteration report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Apply safe: ${applySafe ? "yes" : "no"}`,
    "",
    "## Applied safe changes",
    "",
    applied.length ? applied.map((a) => `- ${a}`).join("\n") : "- none",
    "",
    "## Validation",
    "",
    validation.length
      ? validation.map((v) => `- ${v.ok ? "PASS" : "FAIL"} ${v.command} — ${v.detail}`).join("\n")
      : "- skipped (use --apply-safe to run validation)",
    "",
    "## Recommendations",
    "",
    `- ${mdPath}`,
    `- ${jsonPath}`,
    "",
    "Guardrails: no proof edits, no locked tool exposure, no savings claims, no LLM calls.",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(`Recommendations: ${mdPath}`);
  console.log(`Iteration report: ${reportPath}`);
  if (applySafe) {
    const failed = validation.filter((v) => !v.ok);
    if (failed.length) process.exit(1);
  }
}

main();
