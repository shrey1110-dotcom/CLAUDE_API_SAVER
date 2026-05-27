import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readPackageScripts } from "../detect.js";
import { resolveRoot, toRelativePath } from "../pathSafety.js";
import {
  GRAPH_CONFIG_FILES,
  GRAPH_EXCLUDE_DIRS,
  GRAPH_SKIP_FILE_NAMES,
  GRAPH_SKIP_SUFFIXES,
  MAX_GRAPH_FILES,
  SYMBOL_EXTENSIONS,
} from "./constants.js";
import {
  commandNodeId,
  configNodeId,
  detectLanguage,
  dirNodeId,
  extractFileInfo,
  fileNodeId,
  symbolNodeId,
} from "./extractSymbols.js";
import { ensureGraphDir, getGraphCachePaths } from "./paths.js";
import { deriveTags, summarizeFile, summarizeSymbol } from "./summarize.js";
import type { GraphEdge, GraphManifest, GraphNode, RepoGraph } from "./types.js";
import { GRAPH_VERSION } from "./types.js";

function shouldSkipFile(name: string): boolean {
  if (GRAPH_SKIP_FILE_NAMES.has(name)) return true;
  return GRAPH_SKIP_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function isBinaryBuffer(buf: Buffer): boolean {
  return buf.includes(0);
}

function hashFile(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function walkRepo(root: string): string[] {
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
        files.push(toRelativePath(root, fullPath));
      }
    }
  }

  walk(root);
  return files;
}

function ensureDirNodes(relativePath: string, nodes: Map<string, GraphNode>, edges: GraphEdge[]): void {
  const parts = relativePath.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    const parent = current;
    current = current ? `${current}/${part}` : part;
    const id = dirNodeId(current);
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        type: "directory",
        name: part,
        path: current,
        tags: deriveTags(current),
        summary: `Directory ${current || "."}.`,
      });
    }
    if (parent !== undefined) {
      const parentId = dirNodeId(parent);
      edges.push({ from: parentId, to: id, type: "contains" });
    }
  }
}

function resolveImportTarget(root: string, filePath: string, moduleName: string): string | null {
  if (moduleName.startsWith(".")) {
    const base = path.dirname(path.join(root, filePath));
    const candidates = [
      path.join(base, moduleName),
      `${path.join(base, moduleName)}.ts`,
      `${path.join(base, moduleName)}.tsx`,
      `${path.join(base, moduleName)}.js`,
      `${path.join(base, moduleName)}.jsx`,
      path.join(base, moduleName, "index.ts"),
      path.join(base, moduleName, "index.js"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return toRelativePath(root, candidate);
      }
    }
  }
  return null;
}

function parseMakefileTargets(content: string): string[] {
  const targets: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*:/);
    if (match && !match[1].startsWith(".")) {
      targets.push(match[1]);
    }
  }
  return targets;
}

export function buildRepoGraph(root?: string): { graph: RepoGraph; manifest: GraphManifest } {
  const resolvedRoot = resolveRoot(root);
  ensureGraphDir(resolvedRoot);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const manifestFiles: GraphManifest["files"] = [];
  const generatedAt = new Date().toISOString();

  const rootDirId = dirNodeId("");
  nodes.set(rootDirId, {
    id: rootDirId,
    type: "directory",
    name: path.basename(resolvedRoot) || ".",
    path: ".",
    summary: "Repository root.",
    tags: ["config"],
  });

  const files = walkRepo(resolvedRoot);

  for (const relativePath of files) {
    if (relativePath.startsWith("src/benchmark/")) {
      continue;
    }
    const absolutePath = path.join(resolvedRoot, relativePath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      continue;
    }

    const fileHash = hashFile(absolutePath);
    manifestFiles.push({
      path: relativePath,
      hash: fileHash,
      mtimeMs: stat.mtimeMs,
      sizeBytes: stat.size,
    });

    ensureDirNodes(relativePath, nodes, edges);

    const parentDir = path.dirname(relativePath);
    const parentId = parentDir === "." ? rootDirId : dirNodeId(parentDir);
    const fId = fileNodeId(relativePath);
    const language = detectLanguage(relativePath);
    const isConfig = GRAPH_CONFIG_FILES.has(path.basename(relativePath));
    const isTest = /test|spec|__tests__/i.test(relativePath);

    let symbolNames: string[] = [];
    const extracted = SYMBOL_EXTENSIONS.has(path.extname(relativePath))
      ? extractFileInfo(resolvedRoot, relativePath)
      : null;

    if (extracted) {
      symbolNames = extracted.symbols.map((s) => s.name);
    }

    const fileTags = deriveTags(relativePath, ...symbolNames);
    nodes.set(fId, {
      id: fId,
      type: isConfig ? "config" : "file",
      name: path.basename(relativePath),
      path: relativePath,
      language,
      hash: fileHash,
      sizeBytes: stat.size,
      summary: summarizeFile(relativePath, symbolNames),
      tags: fileTags,
    });
    edges.push({ from: parentId, to: fId, type: "contains" });

    if (extracted) {
      for (const imp of extracted.imports) {
        const target = resolveImportTarget(resolvedRoot, relativePath, imp);
        if (target) {
          edges.push({ from: fId, to: fileNodeId(target), type: "imports" });
        }
      }

      for (const sym of extracted.symbols) {
        const symId = symbolNodeId(relativePath, sym.name);
        const nodeType =
          sym.kind === "class"
            ? "class"
            : sym.kind === "interface"
              ? "interface"
              : sym.kind === "type"
                ? "type"
                : sym.kind === "function"
                  ? "function"
                  : sym.isExport
                    ? "symbol"
                    : "constant";

        nodes.set(symId, {
          id: symId,
          type: nodeType,
          name: sym.name,
          path: relativePath,
          line: sym.line,
          language,
          summary: summarizeSymbol(sym.kind, sym.name, relativePath),
          tags: deriveTags(relativePath, sym.name),
        });
        edges.push({ from: fId, to: symId, type: "contains" });
        if (sym.isExport) {
          edges.push({ from: fId, to: symId, type: "exports" });
        }
      }
    }

    if (isTest) {
      const sourceGuess = relativePath
        .replace(/\.(test|spec)\.[tj]sx?$/, ".$1")
        .replace(/__tests__\//, "")
        .replace(/tests\//, "src/");
      if (files.includes(sourceGuess)) {
        edges.push({ from: fId, to: fileNodeId(sourceGuess), type: "tests" });
      }
    }

    if (isConfig) {
      const cfgId = configNodeId(relativePath);
      if (!nodes.has(cfgId)) {
        nodes.set(cfgId, {
          id: cfgId,
          type: "config",
          name: path.basename(relativePath),
          path: relativePath,
          summary: summarizeFile(relativePath, []),
          tags: ["config"],
        });
      }
      edges.push({ from: cfgId, to: fId, type: "configures", weight: 1 });
      edges.push({ from: fId, to: rootDirId, type: "configures", weight: 0.5 });
    }
  }

  const packageJsonPath = path.join(resolvedRoot, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const scripts = readPackageScripts(resolvedRoot);
    for (const scriptName of Object.keys(scripts)) {
      const cmdId = commandNodeId(`npm:${scriptName}`);
      nodes.set(cmdId, {
        id: cmdId,
        type: "command",
        name: scriptName,
        summary: `npm script ${scriptName}.`,
        tags: deriveTags(scriptName),
      });
      edges.push({
        from: cmdId,
        to: configNodeId("package.json"),
        type: "related_to",
      });
      edges.push({ from: cmdId, to: rootDirId, type: "related_to" });
    }
  }

  const makefilePath = path.join(resolvedRoot, "Makefile");
  if (fs.existsSync(makefilePath)) {
    const content = fs.readFileSync(makefilePath, "utf8");
    for (const target of parseMakefileTargets(content).slice(0, 30)) {
      const cmdId = commandNodeId(`make:${target}`);
      nodes.set(cmdId, {
        id: cmdId,
        type: "command",
        name: target,
        summary: `Makefile target ${target}.`,
        tags: deriveTags(target),
      });
      edges.push({ from: cmdId, to: configNodeId("Makefile"), type: "related_to" });
    }
  }

  const graph: RepoGraph = {
    version: GRAPH_VERSION,
    root: resolvedRoot,
    generatedAt,
    nodes: [...nodes.values()],
    edges,
  };

  const symbolCount = graph.nodes.filter((n) =>
    ["symbol", "function", "class", "interface", "type", "constant"].includes(n.type),
  ).length;

  const manifest: GraphManifest = {
    version: GRAPH_VERSION,
    root: resolvedRoot,
    generatedAt,
    fileCount: manifestFiles.length,
    symbolCount,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    files: manifestFiles,
  };

  return { graph, manifest };
}

export function writeRepoGraph(root?: string): { graph: RepoGraph; manifest: GraphManifest } {
  const { graph, manifest } = buildRepoGraph(root);
  const paths = getGraphCachePaths(root);
  fs.writeFileSync(paths.graphPath, `${JSON.stringify(graph)}\n`, "utf8");
  fs.writeFileSync(paths.manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  return { graph, manifest };
}

async function main(): Promise<void> {
  const root = process.argv[2];
  const { manifest } = writeRepoGraph(root);
  console.log(
    `Graph built: ${manifest.nodeCount} nodes, ${manifest.edgeCount} edges, ${manifest.fileCount} files, ${manifest.symbolCount} symbols`,
  );
  console.log(`Written to ${path.join(resolveRoot(root), ".repo-context-graph")}`);
}

const isMain = process.argv[1]?.endsWith("buildGraph.js");
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
