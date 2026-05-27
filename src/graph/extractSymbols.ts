import fs from "node:fs";
import { MAX_OUTLINE_FILE_BYTES } from "../constants.js";
import { assertReadableFile, resolveSafePath, toRelativePath } from "../pathSafety.js";

export interface ExtractedSymbol {
  name: string;
  line: number;
  kind: string;
  isExport: boolean;
}

export interface ExtractedFileInfo {
  imports: string[];
  symbols: ExtractedSymbol[];
}

const IMPORT_FROM = /from\s+['"]([^'"]+)['"]/;
const IMPORT_SIDE = /^import\s+['"]([^'"]+)['"]/;
const REQUIRE = /require\(\s*['"]([^'"]+)['"]\s*\)/;

const EXPORT_PATTERNS: Array<{ pattern: RegExp; kind: string; nameIndex?: number }> = [
  { pattern: /^export\s+default\s+(?:async\s+)?function\s+(\w+)/, kind: "function", nameIndex: 1 },
  { pattern: /^export\s+default\s+class\s+(\w+)/, kind: "class", nameIndex: 1 },
  { pattern: /^export\s+default\s+/, kind: "constant" },
  { pattern: /^export\s+(?:async\s+)?function\s+(\w+)/, kind: "function", nameIndex: 1 },
  { pattern: /^export\s+class\s+(\w+)/, kind: "class", nameIndex: 1 },
  { pattern: /^export\s+(?:const|let|var)\s+(\w+)/, kind: "constant", nameIndex: 1 },
  { pattern: /^export\s+interface\s+(\w+)/, kind: "interface", nameIndex: 1 },
  { pattern: /^export\s+type\s+(\w+)/, kind: "type", nameIndex: 1 },
];

const TOP_LEVEL_PATTERNS: Array<{ pattern: RegExp; kind: string; nameIndex: number }> = [
  { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function", nameIndex: 1 },
  { pattern: /^(?:export\s+)?class\s+(\w+)/, kind: "class", nameIndex: 1 },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/, kind: "constant", nameIndex: 1 },
  { pattern: /^def\s+(\w+)\s*\(/, kind: "function", nameIndex: 1 },
  { pattern: /^async\s+def\s+(\w+)\s*\(/, kind: "function", nameIndex: 1 },
];

export function extractFileInfo(root: string, relativePath: string): ExtractedFileInfo | null {
  let absolutePath: string;
  try {
    absolutePath = resolveSafePath(root, relativePath);
    assertReadableFile(absolutePath, MAX_OUTLINE_FILE_BYTES);
  } catch {
    return null;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  if (content.includes("\0")) {
    return null;
  }

  const lines = content.split(/\r?\n/);
  const imports = new Set<string>();
  const symbols: ExtractedSymbol[] = [];
  let depth = 0;

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (!line || line.startsWith("//") || line.startsWith("#")) {
      continue;
    }

    depth += countBraces(rawLine);
    const importModule = parseImportModule(line);
    if (importModule) {
      imports.add(importModule);
    }

    for (const entry of EXPORT_PATTERNS) {
      const match = line.match(entry.pattern);
      if (match) {
        const name = entry.nameIndex ? match[entry.nameIndex] : "default";
        symbols.push({ name, line: lineNumber, kind: entry.kind, isExport: true });
        break;
      }
    }

    if (depth <= 1) {
      for (const entry of TOP_LEVEL_PATTERNS) {
        const match = line.match(entry.pattern);
        if (match?.[entry.nameIndex]) {
          const name = match[entry.nameIndex];
          if (!symbols.some((s) => s.name === name && s.line === lineNumber)) {
            symbols.push({ name, line: lineNumber, kind: entry.kind, isExport: line.includes("export") });
          }
        }
      }
    }
  }

  return { imports: [...imports], symbols };
}

function parseImportModule(line: string): string | null {
  return line.match(IMPORT_FROM)?.[1] ?? line.match(IMPORT_SIDE)?.[1] ?? line.match(REQUIRE)?.[1] ?? null;
}

function countBraces(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

export function symbolNodeId(filePath: string, symbolName: string): string {
  return `symbol:${filePath}:${symbolName}`;
}

export function fileNodeId(filePath: string): string {
  return `file:${filePath}`;
}

export function dirNodeId(dirPath: string): string {
  return `dir:${dirPath === "." ? "" : dirPath}`;
}

export function configNodeId(configPath: string): string {
  return `config:${configPath}`;
}

export function commandNodeId(commandName: string): string {
  return `command:${commandName}`;
}

export function detectLanguage(filePath: string): string | undefined {
  if (/\.tsx?$/.test(filePath)) return "typescript";
  if (/\.jsx?$/.test(filePath)) return "javascript";
  if (/\.py$/.test(filePath)) return "python";
  if (/\.go$/.test(filePath)) return "go";
  if (/\.rs$/.test(filePath)) return "rust";
  if (/\.rb$/.test(filePath)) return "ruby";
  if (/\.java$/.test(filePath)) return "java";
  return undefined;
}
