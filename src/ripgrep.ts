import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { EXCLUDE_DIRS, MAX_FILE_BYTES, MAX_WALK_FILES } from "./constants.js";
import { resolveSafePath, toRelativePath } from "./pathSafety.js";

export interface SearchMatch {
  filePath: string;
  lineNumber: number;
  line: string;
  context: string[];
}

export interface RipgrepOptions {
  root: string;
  query: string;
  maxResults: number;
  filePath?: string;
}

export function isRipgrepAvailable(): boolean {
  const result = spawnSync("rg", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

export function searchWithRipgrep(options: RipgrepOptions): SearchMatch[] {
  const args = [
    "--json",
    "-n",
    "--max-count",
    String(options.maxResults),
    "--glob",
    "!.git/*",
    ...[...EXCLUDE_DIRS].flatMap((dir) => ["--glob", `!${dir}/**`]),
  ];

  if (options.filePath) {
    args.push(resolveSafePath(options.root, options.filePath));
  } else {
    args.push(options.root);
  }

  args.push("--", options.query);

  const result = spawnSync("rg", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `ripgrep failed with exit code ${result.status}`);
  }

  return parseRipgrepJson(result.stdout, options.root);
}

export function searchWithNode(options: RipgrepOptions): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const searchRoot = options.filePath
    ? path.dirname(resolveSafePath(options.root, options.filePath))
    : options.root;

  const files = options.filePath
    ? [resolveSafePath(options.root, options.filePath)]
    : walkFiles(searchRoot, options.root);

  const regex = buildSearchRegex(options.query);

  for (const filePath of files) {
    if (matches.length >= options.maxResults) {
      break;
    }

    let content: string;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        continue;
      }
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    if (content.includes("\0")) {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= options.maxResults) {
        break;
      }
      if (regex.test(lines[i])) {
        matches.push({
          filePath: toRelativePath(options.root, filePath),
          lineNumber: i + 1,
          line: lines[i],
          context: getContextLines(lines, i, 2),
        });
      }
    }
  }

  return matches;
}

export function searchCode(options: RipgrepOptions): SearchMatch[] {
  if (isRipgrepAvailable()) {
    try {
      return searchWithRipgrep(options);
    } catch {
      return searchWithNode(options);
    }
  }
  return searchWithNode(options);
}

function parseRipgrepJson(output: string, root: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const linesByFile = new Map<string, string[]>();

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type !== "match" || !parsed.data?.path?.text || !parsed.data.line_number) {
      continue;
    }

    const absolutePath = parsed.data.path.text;
    const relativePath = toRelativePath(root, absolutePath);
     if (!linesByFile.has(absolutePath)) {
      try {
        linesByFile.set(absolutePath, fs.readFileSync(absolutePath, "utf8").split(/\r?\n/));
      } catch {
        linesByFile.set(absolutePath, []);
      }
    }

    const fileLines = linesByFile.get(absolutePath) ?? [];
    const lineIndex = parsed.data.line_number - 1;
    matches.push({
      filePath: relativePath,
      lineNumber: parsed.data.line_number,
      line: parsed.data.lines?.text?.replace(/\n$/, "") ?? fileLines[lineIndex] ?? "",
      context: getContextLines(fileLines, lineIndex, 2),
    });
  }

  return matches;
}
