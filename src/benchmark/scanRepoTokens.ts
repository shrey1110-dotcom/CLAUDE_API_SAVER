import fs from "node:fs";
import path from "node:path";
import {
  GRAPH_EXCLUDE_DIRS,
  GRAPH_SKIP_FILE_NAMES,
  GRAPH_SKIP_SUFFIXES,
  MAX_GRAPH_FILES,
} from "../graph/constants.js";
import { resolveRoot } from "../pathSafety.js";

export const TOKEN_CHARS_DIVISOR = 4;

export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / TOKEN_CHARS_DIVISOR);
}

export function estimateTokensFromFile(filePath: string): number {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return estimateTokensFromChars(Buffer.byteLength(data, "utf8"));
  } catch {
    return 0;
  }
}

function shouldSkipFile(name: string): boolean {
  if (GRAPH_SKIP_FILE_NAMES.has(name)) return true;
  return GRAPH_SKIP_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function isBinaryBuffer(buf: Buffer): boolean {
  return buf.includes(0);
}

export function listIncludedRepoFiles(root: string): string[] {
  const resolved = resolveRoot(root);
  const files: string[] = [];

  function walk(dir: string): void {
    if (files.length >= MAX_GRAPH_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_GRAPH_FILES) break;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (GRAPH_EXCLUDE_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (shouldSkipFile(entry.name)) continue;
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          const sample = Buffer.alloc(Math.min(512, stat.size));
          const fd = fs.openSync(fullPath, "r");
          const read = fs.readSync(fd, sample, 0, sample.length, 0);
          fs.closeSync(fd);
          if (isBinaryBuffer(sample.subarray(0, read))) continue;
        } catch {
          continue;
        }
        files.push(path.relative(resolved, fullPath).split(path.sep).join("/"));
      }
    }
  }

  walk(resolved);
  return files;
}

export function sumRepoFileTokens(root: string, relativePaths: string[]): number {
  const resolved = resolveRoot(root);
  let total = 0;
  for (const rel of relativePaths) {
    total += estimateTokensFromFile(path.join(resolved, rel));
  }
  return total;
}

export function scanFullRepoTokens(root: string): { fileCount: number; fullRawRepoTokens: number } {
  const files = listIncludedRepoFiles(root);
  return {
    fileCount: files.length,
    fullRawRepoTokens: sumRepoFileTokens(root, files),
  };
}

export function scanRelevantFileTokens(root: string, relativePaths: string[]): number {
  const resolved = resolveRoot(root);
  const existing = relativePaths.filter((rel) => fs.existsSync(path.join(resolved, rel)));
  return sumRepoFileTokens(root, existing);
}
