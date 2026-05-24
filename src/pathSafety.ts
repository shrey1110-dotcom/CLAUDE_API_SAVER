import fs from "node:fs";
import path from "node:path";

export function resolveRoot(root?: string): string {
  const resolved = path.resolve(root ?? process.cwd());
  if (!fs.existsSync(resolved)) {
    throw new Error(`Root directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Root path is not a directory: ${resolved}`);
  }
  return resolved;
}

export function isPathWithinRoot(root: string, targetPath: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(targetPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveSafePath(root: string, filePath: string): string {
  const resolved = path.resolve(root, filePath);
  if (!isPathWithinRoot(root, resolved)) {
    throw new Error(`Path escapes project root: ${filePath}`);
  }
  return resolved;
}

export function toRelativePath(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath);
  return relative === "" ? "." : relative;
}
