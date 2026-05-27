import fs from "node:fs";
import path from "node:path";
import {
  FRAMEWORK_HINTS,
  IMPORTANT_CONFIG_FILES,
  LANGUAGE_MARKERS,
  LOCKFILES,
} from "./constants.js";

export interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function detectPackageManager(root: string): string | null {
  for (const [file, manager] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(root, file))) {
      return manager;
    }
  }
  if (fs.existsSync(path.join(root, "package.json"))) {
    return "npm";
  }
  return null;
}

export function detectLanguages(root: string): string[] {
  const languages = new Set<string>();
  for (const [marker, language] of Object.entries(LANGUAGE_MARKERS)) {
    if (fs.existsSync(path.join(root, marker))) {
      languages.add(language);
    }
  }
  return [...languages];
}

export function detectFrameworks(root: string): string[] {
  const frameworks = new Set<string>();
  const packageJson = readJsonFile<PackageJson>(path.join(root, "package.json"));
  const deps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };

  for (const [framework, packages] of Object.entries(FRAMEWORK_HINTS)) {
    if (packages.some((pkg) => pkg in deps)) {
      frameworks.add(framework);
    }
  }

  if (fs.existsSync(path.join(root, "next.config.js")) || fs.existsSync(path.join(root, "next.config.ts"))) {
    frameworks.add("next");
  }
  if (fs.existsSync(path.join(root, "vite.config.ts")) || fs.existsSync(path.join(root, "vite.config.js"))) {
    frameworks.add("vite");
  }

  return [...frameworks];
}

export function findImportantConfigFiles(root: string): string[] {
  const found: string[] = [];
  for (const file of IMPORTANT_CONFIG_FILES) {
    if (fs.existsSync(path.join(root, file))) {
      found.push(file);
    }
  }
  return found;
}

export function readPackageScripts(root: string): Record<string, string> {
  const packageJson = readJsonFile<PackageJson>(path.join(root, "package.json"));
  return packageJson?.scripts ?? {};
}

export interface TreeEntry {
  name: string;
  type: "file" | "directory" | "more";
  children?: TreeEntry[];
}

export interface TreeBuildStats {
  totalFilesScanned: number;
  directoriesShown: number;
  excludedDirectoriesCount: number;
  truncated: boolean;
}

export function buildDirectoryTree(root: string, excludeDirs: Set<string>, maxDepth = 2): TreeEntry[] {
  return listDirectory(root, root, excludeDirs, 0, maxDepth);
}

export function buildCompactDirectoryTree(
  root: string,
  excludeDirs: Set<string>,
  maxDepth: number,
  maxEntriesPerDir: number,
): { tree: TreeEntry[]; stats: TreeBuildStats } {
  const stats: TreeBuildStats = {
    totalFilesScanned: 0,
    directoriesShown: 0,
    excludedDirectoriesCount: 0,
    truncated: false,
  };

  const tree = listDirectoryCompact(root, root, excludeDirs, 0, maxDepth, maxEntriesPerDir, stats);
  return { tree, stats };
}

function listDirectory(
  root: string,
  currentDir: string,
  excludeDirs: Set<string>,
  depth: number,
  maxDepth: number,
): TreeEntry[] {
  if (depth > maxDepth) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const result: TreeEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      continue;
    }
    if (entry.isDirectory() && excludeDirs.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        type: "directory",
        children: listDirectory(root, entryPath, excludeDirs, depth + 1, maxDepth),
      });
    } else {
      result.push({ name: entry.name, type: "file" });
    }
  }

  return result;
}

function listDirectoryCompact(
  root: string,
  currentDir: string,
  excludeDirs: Set<string>,
  depth: number,
  maxDepth: number,
  maxEntriesPerDir: number,
  stats: TreeBuildStats,
): TreeEntry[] {
  if (depth > maxDepth) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const dirs: fs.Dirent[] = [];
  const files: fs.Dirent[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      continue;
    }
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) {
        stats.excludedDirectoriesCount += 1;
        continue;
      }
      dirs.push(entry);
      continue;
    }
    if (entry.isFile()) {
      stats.totalFilesScanned += 1;
      files.push(entry);
    }
  }

  const combined = [...dirs, ...files];
  const visible = combined.slice(0, maxEntriesPerDir);
  const hidden = combined.length - visible.length;
  if (hidden > 0) {
    stats.truncated = true;
  }

  const result: TreeEntry[] = [];
  for (const entry of visible) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      stats.directoriesShown += 1;
      result.push({
        name: entry.name,
        type: "directory",
        children: listDirectoryCompact(root, entryPath, excludeDirs, depth + 1, maxDepth, maxEntriesPerDir, stats),
      });
    } else {
      result.push({ name: entry.name, type: "file" });
    }
  }

  if (hidden > 0) {
    result.push({ name: `... +${hidden} more`, type: "more" });
  }

  return result;
}
