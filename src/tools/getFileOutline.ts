import fs from "node:fs";
import { isCompactMode } from "../config.js";
import { MAX_OUTLINE_FILE_BYTES } from "../constants.js";
import { assertReadableFile, resolveRoot, resolveSafePath, toRelativePath } from "../pathSafety.js";

export interface OutlineSymbol {
  name: string;
  line: number;
  kind: string;
}

export interface FileOutline {
  filePath: string;
  imports: string[] | OutlineSymbol[];
  exports: string[] | OutlineSymbol[];
  topLevel: string[] | OutlineSymbol[];
  importsTotal?: number;
  symbolsTotal?: number;
  truncated?: boolean;
}

const COMPACT_IMPORT_LIMIT = 20;
const COMPACT_SYMBOL_LIMIT = 40;

const IMPORT_FROM = /from\s+['"]([^'"]+)['"]/;
const IMPORT_SIDE = /^import\s+['"]([^'"]+)['"]/;
const REQUIRE = /require\(\s*['"]([^'"]+)['"]\s*\)/;

const EXPORT_PATTERNS: Array<{ pattern: RegExp; kind: string; nameIndex?: number }> = [
  { pattern: /^export\s+default\s+(?:async\s+)?function\s+(\w+)/, kind: "default-export-function", nameIndex: 1 },
  { pattern: /^export\s+default\s+class\s+(\w+)/, kind: "default-export-class", nameIndex: 1 },
  { pattern: /^export\s+default\s+/, kind: "default-export" },
  { pattern: /^export\s+(?:async\s+)?function\s+(\w+)/, kind: "function", nameIndex: 1 },
  { pattern: /^export\s+class\s+(\w+)/, kind: "class", nameIndex: 1 },
  { pattern: /^export\s+(?:const|let|var)\s+(\w+)/, kind: "const", nameIndex: 1 },
  { pattern: /^export\s+interface\s+(\w+)/, kind: "interface", nameIndex: 1 },
  { pattern: /^export\s+type\s+(\w+)/, kind: "type", nameIndex: 1 },
];

const TOP_LEVEL_PATTERNS: Array<{ pattern: RegExp; kind: string; nameIndex: number }> = [
  { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function", nameIndex: 1 },
  { pattern: /^(?:export\s+)?class\s+(\w+)/, kind: "class", nameIndex: 1 },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/, kind: "const", nameIndex: 1 },
  { pattern: /^def\s+(\w+)\s*\(/, kind: "function", nameIndex: 1 },
  { pattern: /^async\s+def\s+(\w+)\s*\(/, kind: "function", nameIndex: 1 },
];

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

export function getFileOutline(filePath: string, root?: string): FileOutline {
  const resolvedRoot = resolveRoot(root);
  const resolvedPath = resolveSafePath(resolvedRoot, filePath);
  assertReadableFile(resolvedPath, MAX_OUTLINE_FILE_BYTES);

  const content = fs.readFileSync(resolvedPath, "utf8");
  const lines = content.split(/\r?\n/);
  const compact = isCompactMode();

  const imports = new Map<string, OutlineSymbol>();
  const exports = new Map<string, OutlineSymbol>();
  const topLevel = new Map<string, OutlineSymbol>();

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
      imports.set(importModule, { name: importModule, line: lineNumber, kind: "import" });
    } else if (!compact && /^(import|from|require)/.test(line)) {
      imports.set(line, { name: line, line: lineNumber, kind: "import" });
    }

    for (const entry of EXPORT_PATTERNS) {
      const match = line.match(entry.pattern);
      if (match) {
        const name = entry.nameIndex ? match[entry.nameIndex] : "default";
        exports.set(`${name}:${lineNumber}`, { name, line: lineNumber, kind: entry.kind });
        break;
      }
    }

    if (depth <= 1) {
      for (const entry of TOP_LEVEL_PATTERNS) {
        const match = line.match(entry.pattern);
        if (match?.[entry.nameIndex]) {
          const name = match[entry.nameIndex];
          topLevel.set(name, { name, line: lineNumber, kind: entry.kind });
        }
      }
    }
  }

  const importValues = [...imports.values()];
  const exportValues = [...exports.values()];
  const topLevelValues = [...topLevel.values()];
  const symbolsTotal = exportValues.length + topLevelValues.length;

  if (compact) {
    const cappedImports = importValues.slice(0, COMPACT_IMPORT_LIMIT).map((item) => item.name);
    const symbolBudget = COMPACT_SYMBOL_LIMIT;
    const cappedExports = exportValues.slice(0, symbolBudget);
    const remaining = Math.max(0, symbolBudget - cappedExports.length);
    const cappedTopLevel = topLevelValues.slice(0, remaining);

    return {
      filePath: toRelativePath(resolvedRoot, resolvedPath),
      imports: cappedImports,
      exports: cappedExports,
      topLevel: cappedTopLevel,
      importsTotal: importValues.length,
      symbolsTotal,
      truncated:
        importValues.length > COMPACT_IMPORT_LIMIT ||
        exportValues.length + topLevelValues.length > COMPACT_SYMBOL_LIMIT,
    };
  }

  const toList = (map: Map<string, OutlineSymbol>) =>
    [...map.values()].slice(0, 100).map((item) => `${item.name} (${item.kind}, line ${item.line})`);

  return {
    filePath: toRelativePath(resolvedRoot, resolvedPath),
    imports: toList(imports),
    exports: toList(exports),
    topLevel: toList(topLevel),
  };
}
