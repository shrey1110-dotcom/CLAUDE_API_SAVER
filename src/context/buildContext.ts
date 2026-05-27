import fs from "node:fs";
import { getGraphCachePaths } from "../graph/paths.js";
import { loadGraph } from "../graph/queryGraph.js";
import { writeRepoGraph } from "../graph/buildGraph.js";
import type { RepoGraph } from "../graph/types.js";
import { CAPSULE_TOPICS, CONTEXT_VERSION, type ContextCapsule, type ContextManifest } from "./types.js";

const MAX_CAPSULE_CHARS = 1200;

function scoreForTopic(node: RepoGraph["nodes"][0], topic: string): number {
  const text = [node.name, node.path ?? "", node.summary ?? "", ...(node.tags ?? [])].join(" ").toLowerCase();
  const topicTerms: Record<string, string[]> = {
    auth: ["auth", "login", "session", "password", "token"],
    routing: ["route", "router", "controller", "endpoint"],
    api: ["api", "controller", "service", "endpoint"],
    database: ["db", "database", "schema", "migration", "sql", "prisma"],
    frontend: ["react", "component", "page", "ui", "tsx", "jsx"],
    tests: ["test", "spec", "__tests__"],
    config: ["config", "package.json", "tsconfig", "vite", "next.config"],
    styling: ["css", "scss", "style", "tailwind"],
    state: ["state", "store", "redux", "zustand"],
    build: ["build", "webpack", "vite", "rollup", "dist"],
    deployment: ["docker", "deploy", "k8s", "helm", "ci"],
  };

  const terms = topicTerms[topic] ?? [topic];
  return terms.reduce((score, term) => (text.includes(term) ? score + 1 : score), 0);
}

function buildCapsule(graph: RepoGraph, topic: string): ContextCapsule {
  const scored = graph.nodes
    .map((node) => ({ node, score: scoreForTopic(node, topic) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const files: string[] = [];
  const symbols: string[] = [];
  const commands: string[] = [];
  const tags = new Set<string>([topic]);

  for (const { node } of scored) {
    if (node.path && (node.type === "file" || node.type === "config") && files.length < 8) {
      files.push(node.path);
    }
    if (["function", "class", "symbol", "interface", "type", "constant"].includes(node.type) && symbols.length < 10) {
      symbols.push(node.path ? `${node.name}@${node.path}` : node.name);
    }
    if (node.type === "command" && commands.length < 5) {
      commands.push(node.name);
    }
    for (const tag of node.tags ?? []) tags.add(tag);
  }

  const summary = `Topic ${topic}: ${files.length} files, ${symbols.length} symbols, ${commands.length} commands.`;

  const capsule: ContextCapsule = {
    topic,
    summary,
    files,
    symbols,
    commands,
    tags: [...tags].slice(0, 10),
    updatedAt: new Date().toISOString(),
  };

  while (JSON.stringify(capsule).length > MAX_CAPSULE_CHARS) {
    if (symbols.length > 0) symbols.pop();
    else if (files.length > 0) files.pop();
    else if (commands.length > 0) commands.pop();
    else break;
    capsule.files = files;
    capsule.symbols = symbols;
    capsule.commands = commands;
  }

  return capsule;
}

export function buildContextCapsules(root?: string, graph?: RepoGraph): ContextCapsule[] {
  let repoGraph = graph ?? loadGraph(root);
  if (!repoGraph) {
    const built = writeRepoGraph(root);
    repoGraph = built.graph;
  }

  return CAPSULE_TOPICS.map((topic) => buildCapsule(repoGraph!, topic));
}

export function writeContextCapsules(root?: string): { capsules: ContextCapsule[]; manifest: ContextManifest } {
  const paths = getGraphCachePaths(root);
  fs.mkdirSync(paths.graphDir, { recursive: true });

  const capsules = buildContextCapsules(root);
  const manifest: ContextManifest = {
    version: CONTEXT_VERSION,
    root: paths.root,
    generatedAt: new Date().toISOString(),
    capsuleCount: capsules.length,
    topics: capsules.map((c) => c.topic),
  };

  fs.writeFileSync(paths.capsulesPath, `${JSON.stringify(capsules)}\n`, "utf8");
  fs.writeFileSync(paths.contextManifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

  return { capsules, manifest };
}

async function main(): Promise<void> {
  const root = process.argv[2];
  const { manifest, capsules } = writeContextCapsules(root);
  const largest = capsules.reduce((max, c) => Math.max(max, JSON.stringify(c).length), 0);
  console.log(`Context built: ${manifest.capsuleCount} capsules (largest ${largest} chars)`);
}

const isMain = process.argv[1]?.endsWith("buildContext.js");
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
