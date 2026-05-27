import fs from "node:fs";
import { getConfig, isCompactMode } from "../config.js";
import { buildSymbolPatterns, searchCode } from "../ripgrep.js";
import { resolveRoot, resolveSafePath } from "../pathSafety.js";

export interface SymbolContextMatch {
  filePath: string;
  symbolLine: number;
  startLine: number;
  endLine: number;
  block: string[];
  truncated?: boolean;
}

export function getSymbolContext(
  symbol: string,
  root?: string,
  maxResults?: number,
): { symbol: string; matches: SymbolContextMatch[] } {
  if (!symbol.trim()) {
    throw new Error("symbol is required");
  }

  const config = getConfig();
  const resolvedRoot = resolveRoot(root);
  const limit = maxResults ?? config.defaultSymbolResults;
  const patterns = buildSymbolPatterns(symbol);
  const seen = new Set<string>();
  const matches: SymbolContextMatch[] = [];

  for (const pattern of patterns) {
    if (matches.length >= limit) {
      break;
    }

    const searchMatches = searchCode({
      root: resolvedRoot,
      query: pattern,
      maxResults: limit * 3,
      contextPadding: 0,
    });

    for (const match of searchMatches) {
      if (matches.length >= limit) {
        break;
      }

      const key = `${match.filePath}:${match.lineNumber}`;
      if (seen.has(key)) {
        continue;
      }

      const absolutePath = resolveSafePath(resolvedRoot, match.filePath);
      const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
      const lineText = lines[match.lineNumber - 1] ?? "";
      if (!isSymbolDefinitionLine(lineText, symbol)) {
        continue;
      }

      seen.add(key);
      const extracted = extractSymbolBlock(lines, match.lineNumber - 1, config.symbolContextLines, isCompactMode());

      matches.push({
        filePath: match.filePath,
        symbolLine: match.lineNumber,
        startLine: extracted.startLine,
        endLine: extracted.endLine,
        block: extracted.block,
        truncated: extracted.truncated,
      });
    }
  }

  return { symbol, matches };
}

function isSymbolDefinitionLine(line: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|\\s)(?:export\\s+)?(?:async\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b|^def\\s+${escaped}\\b|(?:const|let|var)\\s+${escaped}\\s*=`,
  ).test(line);
}

function extractSymbolBlock(
  lines: string[],
  lineIndex: number,
  maxLines: number,
  compact: boolean,
): {
  startLine: number;
  endLine: number;
  block: string[];
  truncated: boolean;
} {
  const start = findBlockStart(lines, lineIndex);
  const end = findBlockEnd(lines, start);
  const totalLines = end - start + 1;
  const truncated = totalLines > maxLines;

  if (!truncated) {
    return {
      startLine: start + 1,
      endLine: end + 1,
      block: lines.slice(start, end + 1).map((line, index) => `${start + index + 1}: ${line}`),
      truncated: false,
    };
  }

  if (compact) {
    const headEnd = Math.min(end, start + 3);
    const tailStart = Math.max(headEnd + 1, end - 3);
    const block = lines.slice(start, headEnd + 1).map((line, index) => `${start + index + 1}: ${line}`);

    if (tailStart <= end) {
      block.push("[truncated]");
      for (let i = tailStart; i <= end; i++) {
        block.push(`${i + 1}: ${lines[i]}`);
      }
    }

    return {
      startLine: start + 1,
      endLine: end + 1,
      block,
      truncated: true,
    };
  }

  let sliceStart = start;
  let sliceEnd = end;
  sliceStart = Math.max(start, lineIndex - Math.floor(maxLines / 2));
  sliceEnd = Math.min(end, sliceStart + maxLines - 1);

  const block = lines.slice(sliceStart, sliceEnd + 1).map((line, index) => {
    const currentLine = sliceStart + index + 1;
    return `${currentLine}: ${line}`;
  });
  block.push(`... [truncated: body exceeded ${maxLines} context lines]`);

  return {
    startLine: sliceStart + 1,
    endLine: sliceEnd + 1,
    block,
    truncated: true,
  };
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

  return Math.min(lines.length - 1, start + 40);
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
