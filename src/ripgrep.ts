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
