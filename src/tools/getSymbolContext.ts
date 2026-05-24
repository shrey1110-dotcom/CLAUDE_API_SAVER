import fs from "node:fs";
import { MAX_SYMBOL_BLOCK_LINES } from "../constants.js";
import { buildSymbolPatterns, getContextLines, searchCode } from "../ripgrep.js";
import { resolveRoot, resolveSafePath } from "../pathSafety.js";

export interface SymbolContextMatch {
  filePath: string;
  symbolLine: number;
  block: string[];
}

export function getSymbolContext(symbol: string, root?: string, maxResults = 5): { symbol: string; matches: SymbolContextMatch[] } {
  if (!symbol.trim()) {
    throw new Error("symbol is required");
  }

  const resolvedRoot = resolveRoot(root);
  const patterns = buildSymbolPatterns(symbol);
  const seen = new Set<string>();
  const matches: SymbolContextMatch[] = [];

  for (const pattern of patterns) {
    if (matches.length >= maxResults) {
      break;
    }

    const searchMatches = searchCode({
      root: resolvedRoot,
      query: pattern,
      maxResults: maxResults * 2,
    });

    for (const match of searchMatches) {
      if (matches.length >= maxResults) {
        break;
      }

      const key = `${match.filePath}:${match.lineNumber}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const absolutePath = resolveSafePath(resolvedRoot, match.filePath);
      const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
      const block = extractSymbolBlock(lines, match.lineNumber - 1);

      matches.push({
        filePath: match.filePath,
        symbolLine: match.lineNumber,
        block,
      });
    }
  }

  return { symbol, matches };
}

function extractSymbolBlock(lines: string[], lineIndex: number): string[] {
  const start = findBlockStart(lines, lineIndex);
  const end = findBlockEnd(lines, start);
  const blockLines = lines.slice(start, end + 1);

  if (blockLines.length <= MAX_SYMBOL_BLOCK_LINES) {
    return blockLines.map((line, index) => `${start + index + 1}: ${line}`);
  }

  const centeredStart = Math.max(start, lineIndex - Math.floor(MAX_SYMBOL_BLOCK_LINES / 2));
  const centeredEnd = Math.min(end, centeredStart + MAX_SYMBOL_BLOCK_LINES - 1);
  return lines.slice(centeredStart, centeredEnd + 1).map((line, index) => `${centeredStart + index + 1}: ${line}`);
}

function findBlockStart(lines: string[], lineIndex: number): number {
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i].trim();
    if (/^(export\s+)?(async\s+)?(function|class|const|let|var)\b/.test(line) || /^def\s+\w+/.test(line)) {
      return i;
    }
  }
  return Math.max(0, lineIndex - 5);
}

function findBlockEnd(lines: string[], start: number): number {
  const startLine = lines[start] ?? "";
  if (/^def\s+\w+/.test(startLine.trim())) {
    return findPythonBlockEnd(lines, start);
  }

  let braceCount = 0;
  let started = false;
  for (let i = start; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === "{") {
        braceCount += 1;
        started = true;
      } else if (char === "}") {
        braceCount -= 1;
      }
    }
    if (started && braceCount <= 0) {
      return i;
    }
  }

  return Math.min(lines.length - 1, start + MAX_SYMBOL_BLOCK_LINES - 1);
}

function findPythonBlockEnd(lines: string[], start: number): number {
  const indent = lines[start]?.match(/^\s*/)?.[0].length ?? 0;
  let end = start;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      end = i;
      continue;
    }
    const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;
    if (currentIndent <= indent) {
      break;
    }
    end = i;
  }
  return end;
}

export { getContextLines };
