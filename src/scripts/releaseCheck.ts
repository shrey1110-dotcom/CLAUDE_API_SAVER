import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = path.join(ROOT, ".mcp-telemetry", "release-check.md");

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

function readText(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

const pkg = JSON.parse(readText("package.json")) as Record<string, unknown>;
const readme = exists("README.md") ? readText("README.md") : "";
const gitignore = exists(".gitignore") ? readText(".gitignore") : "";

add("package.json valid", true, `${pkg.name}@${pkg.version}`);
add("package bin", Boolean(pkg.bin), JSON.stringify(pkg.bin ?? "missing"));
add("package files", Boolean(pkg.files), JSON.stringify(pkg.files ?? "missing"));
add("package license", pkg.license === "MIT", String(pkg.license));
add("LICENSE file", exists("LICENSE"), exists("LICENSE") ? "present" : "missing");
add("dist/index.js", exists("dist/index.js"), exists("dist/index.js") ? "built" : "run npm run build");
add(
  "dist shebang",
  exists("dist/index.js") && readText("dist/index.js").startsWith("#!/usr/bin/env node"),
  "node shebang on entry",
);
add("README install section", /npm install/i.test(readme) && /graph:build/i.test(readme), "quick start");
add("CHANGELOG", exists("CHANGELOG.md"), exists("CHANGELOG.md") ? "present" : "missing");
add(
  "client docs",
  ["cursor.md", "codex.md", "claude-code.md", "claude-desktop.md", "generic-stdio.md"].every((f) =>
    exists(`docs/client-configs/${f}`),
  ),
  "5 client configs",
);
add("examples", exists("examples/generic-stdio/mcp-server.json"), "generic stdio example");
add("A/B docs", exists("docs/ab-testing.md"), "docs/ab-testing.md");
add("codex local proof doc", exists("docs/codex-local-proof.md"), "docs/codex-local-proof.md");
add(
  "codex local proof mentions --codex-bin",
  exists("docs/codex-local-proof.md") && readText("docs/codex-local-proof.md").includes("--codex-bin"),
  "docs/codex-local-proof.md",
);
add("A/B test file", exists("tests/ab.test.ts"), "tests/ab.test.ts");
const scripts = (pkg.scripts ?? {}) as Record<string, string>;
add(
  "A/B scripts",
  ["ab:create", "ab:prompt", "ab:record", "ab:report", "ab:compare", "ab:real-check", "ab:codex", "ab:codex:plan"].every(
    (name) => Boolean(scripts[name]),
  ),
  "package.json scripts",
);
add(
  "Claude A/B scripts",
  [
    "ab:claude",
    "ab:claude:doctor",
    "ab:claude:plan",
    "ab:claude:ingest",
    "ab:claude:report",
    "ab:claude:real-check",
  ].every((name) => Boolean(scripts[name])),
  "package.json scripts",
);
add(
  "Claude locked config",
  exists("examples/claude-code/ab/context-broker-locked.mcp.json") &&
    readText("examples/claude-code/ab/context-broker-locked.mcp.json").includes("MCP_TOOL_PROFILE"),
  "examples/claude-code/ab/context-broker-locked.mcp.json",
);
add(
  "Claude proof doc",
  exists("docs/proofs/claude-auth-discovery-locked.md"),
  "docs/proofs/claude-auth-discovery-locked.md",
);
add(
  "Claude docs disclaim savings",
  exists("docs/client-configs/claude-code.md") &&
    readText("docs/client-configs/claude-code.md").toLowerCase().includes("not proven"),
  "docs/client-configs/claude-code.md",
);
add("Claude usage tests", exists("tests/claudeUsage.test.ts"), "tests/claudeUsage.test.ts");
add("Claude adapter tests", exists("tests/claudeAdapter.test.ts"), "tests/claudeAdapter.test.ts");
add(
  "compression benchmark script",
  Boolean(scripts["benchmark:compression"]),
  "package.json scripts",
);
add(
  "compression benchmark tests",
  exists("tests/compressionBenchmark.test.ts"),
  "tests/compressionBenchmark.test.ts",
);
add(
  "graphify head-to-head protocol",
  exists("docs/benchmarks/graphify-head-to-head.md"),
  "docs/benchmarks/graphify-head-to-head.md",
);
add(
  "skill head-to-head protocol",
  exists("docs/benchmarks/skill-head-to-head.md"),
  "docs/benchmarks/skill-head-to-head.md",
);
add(
  "repo-context CLI bin alias",
  readText("package.json").includes('"repo-context": "dist/index.js"'),
  "package.json bin.repo-context",
);
add(
  "skill head-to-head script",
  readText("package.json").includes("benchmark:skill-head-to-head"),
  "package.json scripts",
);
add(
  "benchmarks doc distinguishes metrics",
  exists("docs/benchmarks.md") &&
    readText("docs/benchmarks.md").toLowerCase().includes("diagnostic compression") &&
    readText("docs/benchmarks.md").toLowerCase().includes("real a/b"),
  "docs/benchmarks.md",
);
add(
  "no Graphify superiority claim",
  !readText("docs/product-status.md").toLowerCase().match(/beat graphify|better than graphify/),
  "docs/product-status.md",
);
add("telemetry context test script", Boolean(scripts["telemetry:context-test"]), "package.json scripts");
add("codex doctor script", Boolean(scripts["codex:doctor"]), "package.json scripts");
add("codex proof instructions script", Boolean(scripts["codex:proof:locked:instructions"]), "package.json scripts");
add("analyze failed codex script", Boolean(scripts["analyze:failed-codex"]), "package.json scripts");
add("codex failure postmortem", exists("docs/postmortems/codex-full-context-failure.md"), "docs/postmortems/codex-full-context-failure.md");
add("safety doc", exists("docs/safety.md"), "docs/safety.md");
add("doctor script", exists("dist/scripts/doctor.js"), "dist/scripts/doctor.js");
add("smoke script", exists("dist/scripts/smokeMcp.js"), "dist/scripts/smokeMcp.js");
add(".repo-context-graph ignored", gitignore.includes(".repo-context-graph"), "gitignore");
add(".mcp-telemetry ignored", gitignore.includes(".mcp-telemetry"), "gitignore");
add(".mcp-ab-tests ignored", gitignore.includes(".mcp-ab-tests"), "gitignore");
add(".mcp-benchmarks ignored", gitignore.includes(".mcp-benchmarks"), "gitignore");
const publishedFiles = (pkg.files ?? []) as string[];
add(
  "A/B generated artifacts not published",
  !publishedFiles.some((entry) => entry.includes(".mcp-ab-tests")),
  JSON.stringify(publishedFiles),
);

const noAbsPathsInExamples = !readText("examples/generic-stdio/mcp-server.json").match(/\/Users\//);
add("no user paths in examples", noAbsPathsInExamples, "placeholder paths only");

const coreSrc = walkTs(path.join(ROOT, "src"));
const noHardcodedClientConfigPath = !coreSrc.match(/mcp-server\.json/);
add("core has no hardcoded client config path", noHardcodedClientConfigPath, "no hardcoded client config paths in src");

function walkTs(dir: string): string {
  let out = "";
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "scripts") continue;
      out += walkTs(full);
    } else if (entry.name.endsWith(".ts")) {
      out += fs.readFileSync(full, "utf8");
    }
  }
  return out;
}

function run(cmd: string, args: string[]): { ok: boolean; detail: string } {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  if (result.status === 0) {
    return { ok: true, detail: "exit 0" };
  }
  return { ok: false, detail: result.stderr?.slice(0, 200) || `exit ${result.status}` };
}

if (exists("dist/scripts/doctor.js")) {
  const doctor = run("node", ["dist/scripts/doctor.js"]);
  add("doctor runs", doctor.ok, doctor.detail);
}

if (exists("dist/scripts/smokeMcp.js")) {
  const smoke = run("node", ["dist/scripts/smokeMcp.js"]);
  add("smoke:mcp", smoke.ok, smoke.detail);
}

if (scripts["test:ab"]) {
  const abTests = run("npm", ["run", "test:ab"]);
  add("test:ab passes", abTests.ok, abTests.detail);
}

const manualCommands = [
  "npm run build",
  "npm run test:all",
  "npm run test:ab",
  "npm run telemetry:context-test",
  "npm run graph:build",
  "npm run context:build",
  "npm run ab:create -- --client cursor --repo . --task auth-discovery",
  "npm run benchmark:context",
  "npm run compat:report",
];

const failed = checks.filter((c) => !c.ok);
const report = `# Release check

Generated: ${new Date().toISOString()}

## Static checks

| Check | Status | Detail |
| --- | --- | --- |
${checks.map((c) => `| ${c.name} | ${c.ok ? "PASS" : "FAIL"} | ${c.detail} |`).join("\n")}

## Manual commands (run before publish)

${manualCommands.map((c) => `- \`${c}\``).join("\n")}

## Verdict

${failed.length === 0 ? "**Ready** — static checks passed. Run manual commands before npm publish." : `**Almost ready** — ${failed.length} static check(s) failed.`}
`;

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, report, "utf8");

console.log("Release check\n");
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
}
console.log(`\nReport: ${REPORT_PATH}`);
console.log(failed.length === 0 ? "\nVerdict: static checks passed" : `\nVerdict: ${failed.length} issue(s) — fix before release`);
process.exit(failed.length > 0 ? 1 : 0);
