#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = [
  ".mcp-benchmarks/",
  "graphify-out/",
  "node_modules/",
  "coverage/",
  ".env",
  ".npmrc",
];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe", ...opts });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

console.log("pack:check — build");
const build = run("npm", ["run", "build"]);
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(1);
}

console.log("pack:check — test:all");
const tests = run("npm", ["run", "test:all"], { stdio: "inherit" });
if (tests.status !== 0) process.exit(tests.status);

console.log("pack:check — cli:smoke");
const smoke = run("npm", ["run", "cli:smoke"]);
if (smoke.status !== 0) {
  console.error(smoke.stdout);
  console.error(smoke.stderr);
  process.exit(1);
}

console.log("pack:check — npm pack --dry-run");
const pack = run("npm", ["pack", "--dry-run", "--json"]);
if (pack.status !== 0) {
  console.error(pack.stderr);
  process.exit(1);
}

let files = [];
try {
  const parsed = JSON.parse(pack.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  files = entry?.files?.map((f) => f.path) ?? [];
} catch {
  files = pack.stdout.split("\n").filter((line) => line.trim().length > 0);
}

const violations = [];
for (const file of files) {
  for (const forbidden of FORBIDDEN) {
    if (file.includes(forbidden.replace(/\/$/, ""))) {
      violations.push(`${file} matches forbidden ${forbidden}`);
    }
  }
}

const required = ["package.json", "dist/index.js", "README.md"];
for (const req of required) {
  if (!files.some((f) => f === req || f.endsWith(`/${req}`))) {
    violations.push(`missing required file: ${req}`);
  }
}

if (violations.length > 0) {
  console.error("pack:check FAILED — package contents:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(`pack:check passed (${files.length} files in tarball, no forbidden artifacts)`);
