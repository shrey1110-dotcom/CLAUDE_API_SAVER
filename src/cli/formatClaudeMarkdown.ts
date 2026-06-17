import fs from "node:fs";
import path from "node:path";
import { loadGraph } from "../graph/queryGraph.js";
import { parseLocalImports } from "../context/taskIntent.js";
import { resolveRoot } from "../pathSafety.js";
import type { ContextPackResult } from "../context/types.js";

type FileRole = "implementation" | "tests" | "fixtures" | "config" | "docs" | "scripts" | "other";

const ROLE_ORDER: FileRole[] = ["implementation", "tests", "fixtures", "config", "docs", "scripts", "other"];

const ROLE_LABELS: Record<FileRole, string> = {
  implementation: "Implementation",
  tests: "Tests",
  fixtures: "Test fixtures",
  config: "Config / manifests",
  docs: "Docs",
  scripts: "Scripts",
  other: "Other",
};

function roleForPath(filePath: string): FileRole {
  const p = filePath.toLowerCase();
  if (p.startsWith("tests/fixtures/")) return "fixtures";
  if (/\.test\.tsx?$/.test(p) || p.startsWith("tests/")) return "tests";
  if (p.startsWith("src/scripts/") || p.startsWith("scripts/")) return "scripts";
  if (/^(package\.json|tsconfig|vitest|eslint|prettier|\.gitattributes)/.test(p) || /\.(toml|ya?ml)$/.test(p)) {
    return "config";
  }
  if (/\.mdc?$/.test(p) || p.startsWith("docs/") || p === "readme.md" || p === "license") return "docs";
  if (p.startsWith("src/")) return "implementation";
  return "other";
}

function symbolsForPath(pack: ContextPackResult, filePath: string): string[] {
  return pack.symbols.filter((sym) => sym.path === filePath).map((sym) => sym.name);
}

/**
 * Derive relationship notes between the selected files from graph edges.
 * Purely structural — no task-specific or hardcoded relationships.
 */
export function collectFileRelations(filePaths: string[], root?: string, limit = 12): string[] {
  const wanted = new Set(filePaths);
  const notes: string[] = [];
  const seen = new Set<string>();

  // Real import statements between the selected files (strongest signal).
  for (const filePath of filePaths) {
    if (!/\.(ts|tsx|js|mjs)$/.test(filePath)) continue;
    for (const target of parseLocalImports(filePath, root)) {
      if (!wanted.has(target)) continue;
      const key = `${filePath}|imports|${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push(`\`${filePath}\` imports \`${target}\``);
      if (notes.length >= limit) return notes;
    }
  }

  const graph = loadGraph(root);
  if (!graph) return notes;

  const nodeToFile = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.path && wanted.has(node.path)) {
      nodeToFile.set(node.id, node.path);
    }
  }

  for (const edge of graph.edges) {
    const fromFile = nodeToFile.get(edge.from);
    const toFile = nodeToFile.get(edge.to);
    if (!fromFile || !toFile || fromFile === toFile) continue;
    if (!["imports", "calls", "tests", "references", "configures", "documents"].includes(edge.type)) continue;
    const key = `${fromFile}|${edge.type}|${toFile}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(`\`${fromFile}\` ${edge.type} \`${toFile}\``);
    if (notes.length >= limit) break;
  }
  return notes;
}

export interface ClaudeMarkdownOptions {
  root?: string;
}

/**
 * Compact module map from the real filesystem: src/ subdirectories and their
 * files. Pure structure, generated for architecture/onboarding-style tasks.
 */
export function buildModuleMap(root?: string, maxFilesPerDir = 8): string[] {
  const resolved = resolveRoot(root);
  const srcDir = path.join(resolved, "src");
  if (!fs.existsSync(srcDir)) return [];

  const lines: string[] = [];
  const entries = fs.readdirSync(srcDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const rootFiles = entries.filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name)).map((e) => e.name);
  if (rootFiles.length > 0) {
    lines.push(`- \`src/\` — ${rootFiles.slice(0, maxFilesPerDir).join(", ")}`);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(srcDir, entry.name);
    const files: string[] = [];
    const subdirs: string[] = [];
    for (const child of fs.readdirSync(sub, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.isDirectory()) subdirs.push(`${child.name}/`);
      else if (/\.(ts|tsx)$/.test(child.name)) files.push(child.name);
    }
    const shown = [...subdirs, ...files].slice(0, maxFilesPerDir);
    const extra = subdirs.length + files.length - shown.length;
    lines.push(`- \`src/${entry.name}/\` — ${shown.join(", ")}${extra > 0 ? ` (+${extra} more)` : ""}`);
  }
  return lines;
}

/**
 * Claude-optimized pack format: grouped file roles, per-file one-liners,
 * key symbols, structural relationship notes from the graph, related tests,
 * and validation commands. Richer than ultra, still compact.
 */
export function formatClaudeMarkdown(pack: ContextPackResult, options: ClaudeMarkdownOptions = {}): string {
  const lines: string[] = [];
  lines.push(`# Repo context (claude profile): ${pack.task.slice(0, 160)}${pack.task.length > 160 ? "…" : ""}`);
  lines.push("");

  const grouped = new Map<FileRole, ContextPackResult["files"]>();
  for (const file of pack.files) {
    const role = roleForPath(file.path);
    const list = grouped.get(role) ?? [];
    list.push(file);
    grouped.set(role, list);
  }

  for (const role of ROLE_ORDER) {
    const filesInRole = grouped.get(role);
    if (!filesInRole?.length) continue;
    lines.push(`## ${ROLE_LABELS[role]}`);
    for (const file of filesInRole) {
      const syms = symbolsForPath(pack, file.path).slice(0, 4);
      const symNote = syms.length > 0 ? ` | symbols: ${syms.join(", ")}` : "";
      lines.push(`- \`${file.path}\` — ${file.reason}${symNote}`);
    }
    lines.push("");
  }

  const orphanSymbols = pack.symbols.filter((sym) => !sym.path || !pack.files.some((f) => f.path === sym.path));
  if (orphanSymbols.length > 0) {
    lines.push("## Other symbols");
    for (const sym of orphanSymbols.slice(0, 6)) {
      lines.push(`- ${sym.name}${sym.path ? ` @ \`${sym.path}\`` : ""}`);
    }
    lines.push("");
  }

  if (/architecture|onboarding|structure|how (?:modules|they|files) relate|module map/i.test(pack.task)) {
    const moduleMap = buildModuleMap(options.root);
    if (moduleMap.length > 0) {
      lines.push("## Module map (src/)");
      lines.push(...moduleMap);
      lines.push("");
    }
  }

  const relations = collectFileRelations(
    pack.files.map((f) => f.path),
    options.root,
  );
  if (relations.length > 0) {
    lines.push("## How files relate (from repo graph)");
    for (const rel of relations) lines.push(`- ${rel}`);
    lines.push("");
  }

  if (pack.concepts?.length) {
    lines.push("## Task concepts");
    lines.push(pack.concepts.map((c) => c.name).join(", "));
    lines.push("");
  }

  if (pack.commands && Object.keys(pack.commands).length > 0) {
    lines.push("## Validation commands");
    if (pack.commands.test) lines.push(`- test: \`${pack.commands.test}\``);
    if (pack.commands.lint) lines.push(`- lint: \`${pack.commands.lint}\``);
    if (pack.commands.dev) lines.push(`- dev: \`${pack.commands.dev}\``);
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("- Use listed files/symbols as the primary source; do not edit unless asked.");
  lines.push("- Implementation files are the edit surface; tests listed above guard behavior.");
  const taskLower = pack.task.toLowerCase();
  if (/\bedit|chang|impact|modif|improv/.test(taskLower)) {
    lines.push(
      "- Risk: changes to implementation files above can break the listed tests; run the validation commands and keep quality/proof checks passing before merging.",
    );
  }
  if (pack.truncated) lines.push("- Pack was truncated to fit budget.");
  lines.push("");

  return lines.join("\n");
}
