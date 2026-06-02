import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandAdapter } from "../src/ab/adapters/commandAdapter.js";

const REPO_ROOT = path.resolve(".");
const DIST_AB = path.join(REPO_ROOT, "dist", "ab");

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-ab-"));
}

function runAbScript(cwd: string, scriptFile: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const scriptPath = path.join(DIST_AB, scriptFile);
  const result = spawnSync("node", [scriptPath, ...args], { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function writeTelemetryLog(cwd: string): void {
  const telemetryDir = path.join(cwd, ".mcp-telemetry");
  fs.mkdirSync(telemetryDir, { recursive: true });
  fs.writeFileSync(
    path.join(telemetryDir, "logs.jsonl"),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      tool: "context_pack",
      args: {},
      durationMs: 12,
      outputChars: 2325,
      estimatedOutputTokens: 581,
      success: true,
    })}\n`,
    "utf8",
  );
}

function readCurrentPlan(cwd: string): { id: string } {
  const content = fs.readFileSync(path.join(cwd, ".mcp-ab-tests", "current-plan.json"), "utf8");
  return JSON.parse(content) as { id: string };
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("A/B tooling", () => {
  it("ab:create creates current-plan.json", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);

    const result = runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".mcp-ab-tests", "current-plan.json"))).toBe(true);
  });

  it("ab:prompt prints correct prompts for all modes", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "codex", "--repo", ".", "--task", "auth-discovery"]);

    const noMcp = runAbScript(cwd, "printPrompt.js", ["--mode", "no_mcp"]);
    const compact = runAbScript(cwd, "printPrompt.js", ["--mode", "compact_search"]);
    const graph = runAbScript(cwd, "printPrompt.js", ["--mode", "graph"]);
    const broker = runAbScript(cwd, "printPrompt.js", ["--mode", "context_broker"]);

    expect(noMcp.stdout).toContain("After answering, list the files you inspected or read.");
    expect(compact.stdout).toContain("Do not use context_pack or graph tools");
    expect(graph.stdout).toContain("Prefer graph_status, graph_query, and graph_symbol");
    expect(broker.stdout).toContain("Then call context_pack with budgetTokens 1000");
  });

  it("ab:record stores manual results and calculates combined totals", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);

    const record = runAbScript(cwd, "recordResult.js", [
      "--mode",
      "context_broker",
      "--client-total",
      "6000",
      "--mcp-tokens",
      "668",
      "--quality",
      "9",
      "--found",
      "true",
    ]);
    expect(record.status).toBe(0);

    const plan = readCurrentPlan(cwd);
    const stored = JSON.parse(
      fs.readFileSync(path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--context_broker.json`), "utf8"),
    ) as { combinedTotalTokens: number };
    expect(stored.combinedTotalTokens).toBe(6668);
  });

  it("ab:record can read MCP telemetry summary", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    writeTelemetryLog(cwd);

    const result = runAbScript(cwd, "recordResult.js", [
      "--mode",
      "context_broker",
      "--use-telemetry",
      "--client-total",
      "7000",
      "--quality",
      "9",
      "--found",
      "true",
    ]);
    expect(result.status).toBe(0);

    const plan = readCurrentPlan(cwd);
    const stored = JSON.parse(
      fs.readFileSync(path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--context_broker.json`), "utf8"),
    ) as { mcpEstimatedOutputTokens: number; mcpToolCalls: number };
    expect(stored.mcpEstimatedOutputTokens).toBe(581);
    expect(stored.mcpToolCalls).toBe(1);
  });

  it("ab:compare picks context_broker when tokens are lower and quality is equal or better", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    runAbScript(cwd, "recordResult.js", ["--mode", "no_mcp", "--client-total", "10000", "--quality", "8", "--found", "true"]);
    runAbScript(cwd, "recordResult.js", [
      "--mode",
      "context_broker",
      "--client-total",
      "6000",
      "--mcp-tokens",
      "668",
      "--quality",
      "9",
      "--found",
      "true",
    ]);

    const compare = runAbScript(cwd, "compare.js");
    expect(compare.status).toBe(0);
    expect(compare.stdout).toContain("Winner: context_broker");
    expect(compare.stdout).toContain("Verdict: saved_tokens");
  });

  it("ab:compare returns quality_regression when quality drops despite savings", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    runAbScript(cwd, "recordResult.js", ["--mode", "no_mcp", "--client-total", "10000", "--quality", "8", "--found", "true"]);
    runAbScript(cwd, "recordResult.js", [
      "--mode",
      "context_broker",
      "--client-total",
      "6000",
      "--mcp-tokens",
      "668",
      "--quality",
      "7",
      "--found",
      "false",
    ]);

    const compare = runAbScript(cwd, "compare.js");
    expect(compare.status).toBe(0);
    expect(compare.stdout).toContain("Verdict: quality_regression");
  });

  it("ab:compare returns inconclusive if required fields are missing", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    runAbScript(cwd, "recordResult.js", ["--mode", "context_broker", "--mcp-tokens", "200", "--quality", "8", "--found", "true"]);

    const compare = runAbScript(cwd, "compare.js");
    expect(compare.status).toBe(0);
    expect(compare.stdout).toContain("Verdict: inconclusive");
  });

  it("ab:report generates markdown", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    runAbScript(cwd, "recordResult.js", ["--mode", "no_mcp", "--client-total", "10000", "--quality", "8", "--found", "true"]);
    runAbScript(cwd, "recordResult.js", [
      "--mode",
      "context_broker",
      "--client-total",
      "6000",
      "--mcp-tokens",
      "668",
      "--quality",
      "9",
      "--found",
      "true",
    ]);

    const report = runAbScript(cwd, "report.js");
    expect(report.status).toBe(0);
    const reportPath = path.join(cwd, ".mcp-ab-tests", "reports", "latest-ab-report.md");
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(fs.readFileSync(reportPath, "utf8")).toContain("## 5. Verdict");
  });

  it("command adapter does not run unless AB_ENABLE_COMMAND_ADAPTER=1", async () => {
    delete process.env.AB_ENABLE_COMMAND_ADAPTER;
    await expect(runCommandAdapter({ promptFile: "/tmp/none.txt", yes: true })).rejects.toThrow("disabled");
  });

  it("command adapter requires --yes", async () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    const originalCwd = process.cwd();
    try {
      process.chdir(cwd);
      process.env.AB_ENABLE_COMMAND_ADAPTER = "1";
      fs.mkdirSync(path.join(cwd, ".mcp-ab-tests"), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, ".mcp-ab-tests", "client-adapter.json"),
        JSON.stringify(
          {
            client: "generic",
            command: "echo",
            args: ["ok"],
            usageOutput: "stdout",
            usageParser: "text",
          },
          null,
          2,
        ),
        "utf8",
      );
      fs.writeFileSync(path.join(cwd, "prompt.txt"), "prompt", "utf8");

      await expect(runCommandAdapter({ promptFile: path.join(cwd, "prompt.txt"), yes: false })).rejects.toThrow(
        "requires --yes",
      );
    } finally {
      delete process.env.AB_ENABLE_COMMAND_ADAPTER;
      process.chdir(originalCwd);
    }
  });

  it("no A/B command is exposed as an MCP tool", () => {
    const index = fs.readFileSync(path.join(REPO_ROOT, "src", "index.ts"), "utf8");
    expect(index).not.toMatch(/server\.tool\(\s*"ab_/);
    expect(index).not.toMatch(/ab:create|ab:record|ab:compare|ab:report/);
  });
});
