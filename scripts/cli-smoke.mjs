#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(ROOT, "dist/index.js");

function run(args) {
  const result = spawnSync(process.execPath, [ENTRY, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

if (!fs.existsSync(ENTRY)) {
  console.error("dist/index.js missing — run npm run build first");
  process.exit(1);
}

const shebang = fs.readFileSync(ENTRY, "utf8").startsWith("#!/usr/bin/env node");
check("dist shebang", shebang);

const help = run(["--help"]);
check("scopekit --help", help.status === 0 && help.stdout.includes("ScopeKit"));

const setupDry = run(["setup", "--dry-run", "--yes"]);
check("setup --dry-run", setupDry.status === 0 && setupDry.stdout.includes("would write"));

for (const target of ["cursor", "claude", "codex", "mcp"]) {
  const out = run(["install", target, "--dry-run", "--root", ROOT]);
  check(`install ${target} --dry-run`, out.status === 0 && out.stdout.includes("would write"));
}

const pack = run([
  "pack",
  "Find auth/session logic",
  "--profile",
  "claude",
  "--budget",
  "900",
  "--format",
  "markdown",
  "--root",
  ROOT,
]);
check("pack claude profile", pack.status === 0 && pack.stdout.includes("Repo context (claude profile)"));

const status = run(["status", "--root", ROOT]);
check("status", status.status === 0 && status.stdout.includes("graphExists"));

const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.error(`\ncli:smoke failed (${failed.length}/${checks.length})`);
  process.exit(1);
}
console.log(`\ncli:smoke passed (${checks.length} checks)`);
