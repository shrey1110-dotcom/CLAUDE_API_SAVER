import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface GraphifyGeminiTokenBreakdown {
  extractionInputTokens: number | null;
  extractionOutputTokens: number | null;
  clusteringInputTokens: number | null;
  clusteringOutputTokens: number | null;
  sources: string[];
  unknownFields: string[];
}

export function parseGraphifyAnalysisTokens(analysisPath: string): {
  input: number | null;
  output: number | null;
} {
  if (!fs.existsSync(analysisPath)) return { input: null, output: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(analysisPath, "utf8")) as {
      tokens?: { input?: number; output?: number };
    };
    return {
      input: typeof parsed.tokens?.input === "number" ? parsed.tokens.input : null,
      output: typeof parsed.tokens?.output === "number" ? parsed.tokens.output : null,
    };
  } catch {
    return { input: null, output: null };
  }
}

export function sumAstCacheTokens(cacheDir: string): { input: number; output: number; files: number } {
  if (!fs.existsSync(cacheDir)) return { input: 0, output: 0, files: 0 };
  let input = 0;
  let output = 0;
  let files = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, "utf8")) as {
            input_tokens?: number;
            output_tokens?: number;
          };
          if (typeof parsed.input_tokens === "number" || typeof parsed.output_tokens === "number") {
            input += parsed.input_tokens ?? 0;
            output += parsed.output_tokens ?? 0;
            files += 1;
          }
        } catch {
          // skip
        }
      }
    }
  };
  walk(cacheDir);
  return { input, output, files };
}

export function parseGraphifyStdoutTokens(text: string): { input: number | null; output: number | null } {
  const inputMatch = text.match(/input[_\s-]?tokens?[:\s]+(\d+)/i);
  const outputMatch = text.match(/output[_\s-]?tokens?[:\s]+(\d+)/i);
  const totalMatch = text.match(/total[_\s-]?tokens?[:\s]+(\d+)/i);
  return {
    input: inputMatch ? Number(inputMatch[1]) : null,
    output: outputMatch ? Number(outputMatch[1]) : totalMatch ? Number(totalMatch[1]) : null,
  };
}

export function captureGraphifyGeminiLogs(
  repoPath: string,
  outDir: string,
): {
  build: { status: number | null; stdoutPath: string; stderrPath: string };
  cluster: { status: number | null; stdoutPath: string; stderrPath: string };
} {
  fs.mkdirSync(outDir, { recursive: true });
  const graphifyBin = resolveGraphifyBin();
  const noop = {
    build: { status: null, stdoutPath: path.join(outDir, "graphify-build.stdout.txt"), stderrPath: path.join(outDir, "graphify-build.stderr.txt") },
    cluster: { status: null, stdoutPath: path.join(outDir, "graphify-cluster.stdout.txt"), stderrPath: path.join(outDir, "graphify-cluster.stderr.txt") },
  };
  if (!graphifyBin) {
    fs.writeFileSync(noop.build.stdoutPath, "graphify binary not found\n", "utf8");
    fs.writeFileSync(noop.build.stderrPath, "", "utf8");
    fs.writeFileSync(noop.cluster.stdoutPath, "graphify binary not found\n", "utf8");
    fs.writeFileSync(noop.cluster.stderrPath, "", "utf8");
    return noop;
  }
  const build = spawnSync(graphifyBin, [".", "--backend", "gemini"], {
    cwd: repoPath,
    encoding: "utf8",
    timeout: 600_000,
  });
  fs.writeFileSync(noop.build.stdoutPath, build.stdout ?? "", "utf8");
  fs.writeFileSync(noop.build.stderrPath, build.stderr ?? "", "utf8");
  const cluster = spawnSync(graphifyBin, ["cluster-only", ".", "--backend=gemini"], {
    cwd: repoPath,
    encoding: "utf8",
    timeout: 600_000,
  });
  fs.writeFileSync(noop.cluster.stdoutPath, cluster.stdout ?? "", "utf8");
  fs.writeFileSync(noop.cluster.stderrPath, cluster.stderr ?? "", "utf8");
  return {
    build: { ...noop.build, status: build.status },
    cluster: { ...noop.cluster, status: cluster.status },
  };
}

export function loadGraphifyGeminiTokens(repoPath: string, options?: { rerun?: boolean; logDir?: string }): GraphifyGeminiTokenBreakdown {
  const graphifyOut = path.join(repoPath, "graphify-out");
  const analysisPath = path.join(graphifyOut, ".graphify_analysis.json");
  const astCache = path.join(graphifyOut, "cache", "ast");
  const sources: string[] = [];
  const unknownFields: string[] = [];

  const cluster = parseGraphifyAnalysisTokens(analysisPath);
  if (cluster.input !== null) sources.push(analysisPath);
  else unknownFields.push("clusteringInputTokens");

  const astSum = sumAstCacheTokens(astCache);
  let extractionInput: number | null = astSum.input > 0 ? astSum.input : null;
  let extractionOutput: number | null = astSum.output > 0 ? astSum.output : null;
  if (extractionInput !== null) sources.push(astCache);

  if (options?.rerun) {
    const logDir = options.logDir ?? path.join(repoPath, ".mcp-benchmarks/end-to-end-ai-cost");
    const logs = captureGraphifyGeminiLogs(repoPath, logDir);
    const buildCombined = `${fs.readFileSync(logs.build.stdoutPath, "utf8")}\n${fs.readFileSync(logs.build.stderrPath, "utf8")}`;
    const clusterCombined = `${fs.readFileSync(logs.cluster.stdoutPath, "utf8")}\n${fs.readFileSync(logs.cluster.stderrPath, "utf8")}`;
    const buildParsed = parseGraphifyStdoutTokens(buildCombined);
    const clusterParsed = parseGraphifyStdoutTokens(clusterCombined);
    if (buildParsed.input !== null) {
      extractionInput = buildParsed.input;
      sources.push(logs.build.stdoutPath);
    }
    if (buildParsed.output !== null) {
      extractionOutput = buildParsed.output;
      sources.push(logs.build.stdoutPath);
    }
    if (clusterParsed.input !== null && cluster.input === null) {
      cluster.input = clusterParsed.input;
      cluster.output = clusterParsed.output ?? cluster.output;
      sources.push(logs.cluster.stdoutPath);
    }
    const clusterAfter = parseGraphifyAnalysisTokens(analysisPath);
    if (clusterAfter.input !== null) {
      cluster.input = clusterAfter.input;
      cluster.output = clusterAfter.output ?? cluster.output;
    }
  }

  if (extractionInput === null) unknownFields.push("extractionInputTokens");
  if (extractionOutput === null) unknownFields.push("extractionOutputTokens");
  if (cluster.input === null) unknownFields.push("clusteringInputTokens");
  if (cluster.output === null) unknownFields.push("clusteringOutputTokens");

  return {
    extractionInputTokens: extractionInput,
    extractionOutputTokens: extractionOutput,
    clusteringInputTokens: cluster.input,
    clusteringOutputTokens: cluster.output,
    sources: [...new Set(sources)],
    unknownFields: [...new Set(unknownFields)],
  };
}

export function resolveGraphifyBin(): string | null {
  const which = spawnSync("which", ["graphify"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return null;
}

export function totalGeminiTokens(breakdown: GraphifyGeminiTokenBreakdown): number | null {
  const parts = [
    breakdown.extractionInputTokens,
    breakdown.extractionOutputTokens,
    breakdown.clusteringInputTokens,
    breakdown.clusteringOutputTokens,
  ];
  if (parts.some((p) => p === null)) return null;
  return (parts[0] ?? 0) + (parts[1] ?? 0) + (parts[2] ?? 0) + (parts[3] ?? 0);
}
