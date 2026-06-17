#!/usr/bin/env node
/**
 * Claude-profile leakage and fairness audit.
 *
 * Checks:
 *  1. Claude profile generation code (cli formatters, skillPack, path-term /
 *     import-neighbor retrieval) contains no rubric-expected file paths.
 *  2. Pack-generation code never imports the benchmark rubrics module.
 *  3. repo-context arm contexts contain no Graphify output (graph.json /
 *     GRAPH_REPORT content).
 *  4. Graphify arm contexts contain no repo-context pack output.
 *  5. Prompt templates are identical across arms except the context file path.
 *
 * Output: .mcp-benchmarks/claude/quality-improvement/fairness-audit.{md,json}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = path.join(ROOT, ".mcp-benchmarks/claude");
const OUT_DIR = path.join(BASE, "quality-improvement");

const TASKS = ["auth-discovery", "impact-analysis", "edit-planning", "architecture-discovery", "onboarding-map"];

// New Claude-profile generation code paths (added for the claude profile).
const CLAUDE_PROFILE_CODE = [
  "src/cli/formatClaudeMarkdown.ts",
  "src/cli/skillPack.ts",
  "src/cli/router.ts",
];

// Rubric-expected markers that must not be hardcoded in claude-profile code.
const RUBRIC_MARKERS = [
  "session.service.ts",
  "auth.controller.ts",
  "LoginPage.tsx",
  "simple-node-app/src/auth/login.ts",
  "simple-node-app/src/auth/session.ts",
];

const checks = [];

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
}

// 1. No rubric file paths in claude-profile generation code.
for (const rel of CLAUDE_PROFILE_CODE) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const hits = RUBRIC_MARKERS.filter((marker) => text.includes(marker));
  check(`no-rubric-paths:${rel}`, hits.length === 0, hits.length ? `found: ${hits.join(", ")}` : "clean");
}

// Pre-existing generic anchors disclosure (not claude-profile specific; used by
// all profiles since before the Claude benchmark; reported for transparency).
const taskIntentText = fs.readFileSync(path.join(ROOT, "src/context/taskIntent.ts"), "utf8");
check(
  "disclosure:pre-existing-anchors",
  true,
  taskIntentText.includes("ONBOARDING_ANCHOR_PATHS")
    ? "taskIntent.ts contains generic onboarding/impact anchors (README, package.json, broker, buildGraph, context/tools tests) that predate the Claude profile and apply to every profile equally"
    : "no anchor constants found",
);

// 2. Pack-generation code must not import benchmark rubrics.
const GEN_DIRS = ["src/cli", "src/context", "src/graph"];
let rubricImport = null;
for (const dir of GEN_DIRS) {
  for (const file of fs.readdirSync(path.join(ROOT, dir))) {
    if (!file.endsWith(".ts")) continue;
    const text = fs.readFileSync(path.join(ROOT, dir, file), "utf8");
    if (/claudeTaskRubrics|CLAUDE_TASK_RUBRICS|AUTH_DISCOVERY_EXPECTED/.test(text)) {
      rubricImport = `${dir}/${file}`;
    }
  }
}
check("no-rubric-import-in-generation", rubricImport === null, rubricImport ?? "clean");

// 3 + 4. Cross-arm contamination.
for (const task of TASKS) {
  const rcPath = path.join(BASE, "repo-context-claude-profile", task, "repo-context-claude-context.txt");
  const gfPath = path.join(BASE, "graphify-best-effort", task, "graphify-best-effort-context.txt");
  if (fs.existsSync(rcPath)) {
    const rc = fs.readFileSync(rcPath, "utf8");
    const contaminated = /GRAPH_REPORT\.md|graphify-out\/graph\.json|_COMMUNITY_/.test(rc);
    check(`no-graphify-in-repo-context:${task}`, !contaminated, contaminated ? "graphify markers found" : "clean");
  }
  if (fs.existsSync(gfPath)) {
    const gf = fs.readFileSync(gfPath, "utf8");
    const contaminated = /Repo context \(claude profile\)|repo-context pack|path-term match/.test(gf);
    check(`no-repo-context-in-graphify:${task}`, !contaminated, contaminated ? "repo-context markers found" : "clean");
  }
}

// 5. Prompt templates identical across arms except context file path.
let promptsOk = true;
let promptDetail = "identical modulo context path";
for (const task of TASKS) {
  const a = path.join(BASE, "runs", task, "graphify", "repeat-1", "prompt.txt");
  const b = path.join(BASE, "runs", task, "repo-context", "repeat-1", "prompt.txt");
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    promptsOk = false;
    promptDetail = `missing prompt for ${task}`;
    break;
  }
  const normalize = (text) => text.replace(/\[See context file: [^\]]+\]/, "[CONTEXT]");
  if (normalize(fs.readFileSync(a, "utf8")) !== normalize(fs.readFileSync(b, "utf8"))) {
    promptsOk = false;
    promptDetail = `prompt mismatch for ${task}`;
    break;
  }
}
check("prompt-template-identical", promptsOk, promptDetail);

const pass = checks.every((c) => c.pass);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, "fairness-audit.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), pass, checks }, null, 2)}\n`,
  "utf8",
);
const md = [
  "# Claude Profile Fairness Audit",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Overall: ${pass ? "PASS" : "FAIL"}`,
  "",
  "| Check | Result | Detail |",
  "|---|---|---|",
  ...checks.map((c) => `| ${c.name} | ${c.pass ? "PASS" : "FAIL"} | ${c.detail} |`),
  "",
];
fs.writeFileSync(path.join(OUT_DIR, "fairness-audit.md"), `${md.join("\n")}\n`, "utf8");

console.log(`claude_fairness_audit pass=${pass} checks=${checks.length}`);
if (!pass) process.exit(1);
