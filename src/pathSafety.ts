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

  const realRoot = fs.realpathSync(root);
  let realResolved = resolved;
  try {
    if (fs.existsSync(resolved)) {
      realResolved = fs.realpathSync(resolved);
    }
  } catch {
    realResolved = resolved;
  }

  if (!isPathWithinRoot(realRoot, realResolved)) {
    throw new Error(`Path escapes project root via symlink: ${filePath}`);
  }

  return resolved;
}

export function toRelativePath(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath);
  return relative === "" ? "." : relative;
}

export function assertReadableFile(filePath: string, maxBytes?: number): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Path is not a readable file: ${filePath}`);
  }
  if (maxBytes !== undefined && stat.size > maxBytes) {
    throw new Error(`File too large (${stat.size} bytes, max ${maxBytes}): ${filePath}`);
  }
}
