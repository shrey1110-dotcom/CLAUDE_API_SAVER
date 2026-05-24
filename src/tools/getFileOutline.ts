import fs from "node:fs";
import { MAX_OUTLINE_FILE_BYTES } from "../constants.js";
import { assertReadableFile, resolveRoot, resolveSafePath, toRelativePath } from "../pathSafety.js";

export interface FileOutline {
  filePath: string;
  imports: string[];
  exports: string[];
  topLevel: string[];
}

const IMPORT_PATTERNS = [
  /^import\s+.+from\s+['"].+['"]/,
  /^import\s+['"].+['"]/,
  /^import\s+\{?.+\}?\s+from\s+['"].+['"]/,
  /require\s*\(\s*['"].+['"]\s*\)/,
  /^from\s+.+\s+import\s+/,
  /^import\s+\w+/,
];

const EXPORT_PATTERNS = [
  /^export\s+default\b/,
  /^export\s+(?:async\s+)?function\s+\w+/,
  /^export\s+class\s+\w+/,
  /^export\s+(?:const|let|var)\s+\w+/,
  /^export\s+\{.+}/,
  /^export\s+\*\s+from\s+['"].+['"]/,
  /^module\.exports\s*=/,
  /^exports\.\w+\s*=/,
];

const TOP_LEVEL_PATTERNS = [
  /^(?:async\s+)?function\s+(\w+)/,
  /^class\s+(\w+)/,
  /^(?:const|let|var)\s+(\w+)\s*=/,
  /^def\s+(\w+)\s*\(/,
  /^async\s+def\s+(\w+)\s*\(/,
];

export function getFileOutline(filePath: string, root?: string): FileOutline {
  const resolvedRoot = resolveRoot(root);
  const resolvedPath = resolveSafePath(resolvedRoot, filePath);
  assertReadableFile(resolvedPath, MAX_OUTLINE_FILE_BYTES);

  const content = fs.readFileSync(resolvedPath, "utf8");
  const lines = content.split(/\r?\n/);

  const imports = new Set<string>();
  const exports = new Set<string>();
  const topLevel = new Set<string>();

  let depth = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) {
      continue;
    }

    depth += countBraces(rawLine);

    if (IMPORT_PATTERNS.some((pattern) => pattern.test(line))) {
      imports.add(line);
    }

    if (EXPORT_PATTERNS.some((pattern) => pattern.test(line))) {
      exports.add(line);
    }

    if (depth <= 1) {
      for (const pattern of TOP_LEVEL_PATTERNS) {
        const match = line.match(pattern);
        if (match?.[1]) {
          topLevel.add(match[1]);
        }
      }
    }
  }

  return {
    filePath: toRelativePath(resolvedRoot, resolvedPath),
    imports: [...imports].slice(0, 100),
    exports: [...exports].slice(0, 100),
    topLevel: [...topLevel].slice(0, 100),
  };
}

function countBraces(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}
