import fs from "node:fs";
import path from "node:path";
import { readJsonFile, readPackageScripts } from "../detect.js";
import { resolveRoot } from "../pathSafety.js";

interface CommandResult {
  scripts: Record<string, string>;
  likelyTest: string | null;
  likelyLint: string | null;
  likelyDev: string | null;
  sources: string[];
}

export function getProjectCommands(root?: string): CommandResult {
  const resolvedRoot = resolveRoot(root);
  const scripts: Record<string, string> = {};
  const sources: string[] = [];

  const packageScripts = readPackageScripts(resolvedRoot);
  if (Object.keys(packageScripts).length > 0) {
    Object.assign(scripts, packageScripts);
    sources.push("package.json");
  }

  const pyprojectPath = path.join(resolvedRoot, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    sources.push("pyproject.toml");
    const content = fs.readFileSync(pyprojectPath, "utf8");
    addIfMissing(scripts, "test", inferPyprojectCommand(content, ["pytest", "test"]));
    addIfMissing(scripts, "lint", inferPyprojectCommand(content, ["ruff check", "flake8", "pylint"]));
    addIfMissing(scripts, "dev", inferPyprojectCommand(content, ["uvicorn", "flask run", "django"]));
  }

  const makefilePath = path.join(resolvedRoot, "Makefile");
  if (fs.existsSync(makefilePath)) {
    sources.push("Makefile");
    const content = fs.readFileSync(makefilePath, "utf8");
    for (const target of ["test", "lint", "dev", "start"]) {
      const command = parseMakefileTarget(content, target);
      if (command) {
        addIfMissing(scripts, target, command);
      }
    }
  }

  const cargoPath = path.join(resolvedRoot, "Cargo.toml");
  if (fs.existsSync(cargoPath)) {
    sources.push("Cargo.toml");
    addIfMissing(scripts, "test", "cargo test");
    addIfMissing(scripts, "lint", "cargo clippy");
    addIfMissing(scripts, "dev", "cargo run");
  }

  const goModPath = path.join(resolvedRoot, "go.mod");
  if (fs.existsSync(goModPath)) {
    sources.push("go.mod");
    addIfMissing(scripts, "test", "go test ./...");
    addIfMissing(scripts, "lint", "golangci-lint run");
    addIfMissing(scripts, "dev", "go run .");
  }

  return {
    scripts,
    likelyTest: pickLikelyCommand(scripts, ["test", "test:unit", "test:ci", "pytest"]),
    likelyLint: pickLikelyCommand(scripts, ["lint", "lint:fix", "eslint", "ruff", "clippy"]),
    likelyDev: pickLikelyCommand(scripts, ["dev", "start:dev", "serve", "develop", "start"]),
    sources,
  };
}

function addIfMissing(scripts: Record<string, string>, key: string, value: string | null): void {
  if (value && !(key in scripts)) {
    scripts[key] = value;
  }
}

function pickLikelyCommand(scripts: Record<string, string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (scripts[candidate]) {
      return `${candidate}: ${scripts[candidate]}`;
    }
  }

  const fuzzy = Object.entries(scripts).find(([name]) => candidates.some((candidate) => name.includes(candidate)));
  return fuzzy ? `${fuzzy[0]}: ${fuzzy[1]}` : null;
}

function parseMakefileTarget(content: string, target: string): string | null {
  const regex = new RegExp(`^${target}\\s*:(.*?)(?=\\n\\S|$)`, "ms");
  const match = content.match(regex);
  if (!match) {
    return null;
  }

  const body = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("@"))
    .map((line) => line.replace(/^-?\t?/, ""))
    .join(" && ");

  return body || `make ${target}`;
}

function inferPyprojectCommand(content: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (content.includes(keyword)) {
      if (keyword === "pytest") return "pytest";
      if (keyword === "ruff check") return "ruff check .";
      if (keyword === "uvicorn") return "uvicorn main:app --reload";
      return keyword;
    }
  }
  return null;
}

export { readJsonFile };
