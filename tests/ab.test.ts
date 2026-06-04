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
    const locked = runAbScript(cwd, "printPrompt.js", ["--mode", "context_broker_locked"]);

    expect(noMcp.stdout).toContain("After answering, list the files you inspected or read.");
    expect(compact.stdout).toContain("Do not use context_pack or graph tools");
    expect(graph.stdout).toContain("Prefer graph_status, graph_query, and graph_symbol");
    expect(broker.stdout).toContain("Call context_status once.");
    expect(broker.stdout).toContain("Call context_pack once with budgetTokens 1000.");
    expect(broker.stdout).toContain("Hard fallback budget");
    expect(broker.stdout).toContain("graph tools combined: max 2 calls");
    expect(broker.stdout).toContain("Do not call repo_map or search_code unless context_pack is missing");
    expect(locked.stdout).toContain("locked context-broker mode");
    expect(locked.stdout).toContain("Do not call graph tools, search tools, or symbol tools.");
    expect(locked.stdout).toContain("Call context_pack once with budgetTokens 1000.");
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

  it("ab:compare flags outlier when max is more than 2x median", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", [
      "--client",
      "codex",
      "--repo",
      ".",
      "--task",
      "auth-discovery",
      "--modes",
      "no_mcp,context_broker_locked",
    ]);
    const plan = readCurrentPlan(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--no_mcp.json`),
      JSON.stringify(
        {
          id: "base",
          planId: plan.id,
          mode: "no_mcp",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 100,
          combinedTotalTokens: 100,
          clientTotalTokenRepeats: [100, 100, 100],
          combinedTotalTokenRepeats: [100, 100, 100],
          answerQuality: 8,
          foundExpectedFiles: true,
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--context_broker_locked.json`),
      JSON.stringify(
        {
          id: "locked",
          planId: plan.id,
          mode: "context_broker_locked",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 250,
          mcpEstimatedOutputTokens: 0,
          combinedTotalTokens: 250,
          clientTotalTokenRepeats: [50, 50, 250],
          combinedTotalTokenRepeats: [50, 50, 250],
          mcpToolsUsed: ["context_status", "context_pack"],
          mcpToolCallCounts: { context_status: 1, context_pack: 1 },
          mcpToolCalls: 2,
          answerQuality: 8,
          foundExpectedFiles: true,
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = runAbScript(cwd, "report.js");
    expect(report.status).toBe(0);
    const text = fs.readFileSync(path.join(cwd, ".mcp-ab-tests", "reports", "latest-ab-report.md"), "utf8");
    expect(text).toContain("OUTLIER max 250");
    expect(text).toContain("Tool-loop failure: no");
  });

  it("ab:compare can return PROMISING_BUT_UNSTABLE", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", [
      "--client",
      "codex",
      "--repo",
      ".",
      "--task",
      "auth-discovery",
      "--modes",
      "no_mcp,context_broker_locked",
    ]);
    const plan = readCurrentPlan(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--no_mcp.json`),
      JSON.stringify(
        {
          id: "base",
          planId: plan.id,
          mode: "no_mcp",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 100,
          combinedTotalTokens: 100,
          clientTotalTokenRepeats: [100, 100, 100],
          combinedTotalTokenRepeats: [100, 100, 100],
          answerQuality: 8,
          foundExpectedFiles: true,
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--context_broker_locked.json`),
      JSON.stringify(
        {
          id: "locked",
          planId: plan.id,
          mode: "context_broker_locked",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 250,
          mcpEstimatedOutputTokens: 0,
          combinedTotalTokens: 250,
          clientTotalTokenRepeats: [50, 50, 250],
          combinedTotalTokenRepeats: [50, 50, 250],
          mcpToolsUsed: ["context_status", "context_pack"],
          mcpToolCallCounts: { context_status: 1, context_pack: 1 },
          mcpToolCalls: 2,
          answerQuality: 8,
          foundExpectedFiles: true,
        },
        null,
        2,
      ),
      "utf8",
    );

    const compare = runAbScript(cwd, "compare.js");
    expect(compare.status).toBe(0);
    expect(compare.stdout).toContain("Verdict: PROMISING_BUT_UNSTABLE");
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
    expect(fs.readFileSync(reportPath, "utf8")).toContain("## 7. Verdict");
  });

  it("ab:report flags incorrect routing when context_pack is missing", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "cursor", "--repo", ".", "--task", "auth-discovery"]);
    runAbScript(cwd, "recordResult.js", ["--mode", "no_mcp", "--client-total", "10000", "--quality", "8", "--found", "true"]);
    runAbScript(cwd, "recordResult.js", [
      "--mode",
      "context_broker",
      "--client-total",
      "7000",
      "--mcp-tokens",
      "500",
      "--quality",
      "8",
      "--found",
      "true",
      "--mcp-tools",
      "repo_map,search_code",
    ]);

    runAbScript(cwd, "report.js");
    const reportPath = path.join(cwd, ".mcp-ab-tests", "reports", "latest-ab-report.md");
    const report = fs.readFileSync(reportPath, "utf8");
    expect(report).toContain("incorrect_route");
    expect(report).toContain("Routing warnings");
  });

  it("ab:real-check returns ROUTING FAILURE if locked mode uses forbidden tools", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", [
      "--client",
      "codex",
      "--repo",
      ".",
      "--task",
      "auth-discovery",
      "--modes",
      "no_mcp,context_broker_locked",
    ]);
    const plan = readCurrentPlan(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--no_mcp.json`),
      JSON.stringify(
        {
          id: "base",
          planId: plan.id,
          mode: "no_mcp",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 1000,
          clientTotalTokenRepeats: [1000, 1000, 1000],
          combinedTotalTokenRepeats: [1000, 1000, 1000],
          answerQuality: 8,
          foundExpectedFiles: true,
          usageParsed: true,
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--context_broker_locked.json`),
      JSON.stringify(
        {
          id: "locked",
          planId: plan.id,
          mode: "context_broker_locked",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 800,
          clientTotalTokenRepeats: [800, 800, 800],
          combinedTotalTokenRepeats: [820, 820, 820],
          mcpEstimatedOutputTokens: 20,
          mcpToolsUsed: ["context_status", "context_pack", "graph_query"],
          mcpToolCallCounts: { context_status: 1, context_pack: 1, graph_query: 1 },
          mcpToolCalls: 3,
          answerQuality: 8,
          foundExpectedFiles: true,
          usageParsed: true,
        },
        null,
        2,
      ),
      "utf8",
    );

    const check = runAbScript(cwd, "realCheck.js");
    expect(check.status).not.toBe(0);
    expect(check.stdout).toContain("ab_real_check_status=ROUTING_FAILURE");
    expect(check.stdout).toContain("graph_query");
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

  it("telemetry context test script enforces context broker route checks", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "telemetry", "contextTest.ts"), "utf8");
    expect(source).toContain('runTelemetryTool("context_status"');
    expect(source).toContain('runTelemetryTool("context_pack"');
    expect(source).toContain("repo_map called 0 times");
    expect(source).toContain("search_code called 0 times");
    expect(source).toContain("bad_tool called 0 times");
  });

  it("benchmark:context-locked uses exactly context_status and context_pack", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "benchmark", "contextLocked.ts"), "utf8");
    expect(pkg.scripts["benchmark:context-locked"]).toBe("node dist/benchmark/contextLocked.js");
    expect(source).toContain('recordTelemetryTool("context_status"');
    expect(source).toContain('recordTelemetryTool("context_pack"');
    expect(source).toContain("exactlyTwoToolCalls");
    expect(source).not.toContain('recordTelemetryTool("get_symbol_context"');
    expect(source).not.toContain('recordTelemetryTool("graph_query"');
    expect(source).not.toContain('recordTelemetryTool("graph_symbol"');
    expect(source).not.toContain('recordTelemetryTool("graph_neighbors"');
    expect(source).not.toContain('recordTelemetryTool("search_code"');
    expect(source).not.toContain('recordTelemetryTool("repo_map"');
  });

  it("synthetic telemetry test is isolated from normal logs", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "telemetry", "test.ts"), "utf8");
    expect(source).toContain("MCP_TELEMETRY_LOG_FILE");
    expect(source).toContain("synthetic-telemetry-test.jsonl");
    expect(source).toContain("synthetic_error_tool");
  });

  it("ab:compare flags TOOL_LOOP_FAILURE for full context_broker tool-loop explosion", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    runAbScript(cwd, "createPlan.js", ["--client", "codex", "--repo", ".", "--task", "auth-discovery"]);
    const plan = readCurrentPlan(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--no_mcp.json`),
      JSON.stringify({
        id: "base",
        planId: plan.id,
        mode: "no_mcp",
        client: "codex",
        repoPath: cwd,
        prompt: "x",
        clientTotalTokens: 273530,
        answerQuality: 9,
        foundExpectedFiles: true,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", `${plan.id}--context_broker.json`),
      JSON.stringify({
        id: "broker",
        planId: plan.id,
        mode: "context_broker",
        client: "codex",
        repoPath: cwd,
        prompt: "x",
        clientTotalTokens: 454563,
        combinedTotalTokens: 455157,
        mcpToolCalls: 59,
        mcpToolCallCounts: {
          context_status: 3,
          context_pack: 5,
          graph_query: 4,
          graph_symbol: 12,
          graph_neighbors: 13,
          get_symbol_context: 22,
        },
        answerQuality: 5,
        foundExpectedFiles: false,
      }),
      "utf8",
    );

    const compare = runAbScript(cwd, "compare.js");
    expect(compare.status).toBe(0);
    expect(compare.stdout).toContain("Verdict: TOOL_LOOP_FAILURE");
  });

  it("codex docs recommend context_broker_locked for token-saving proof", () => {
    const codexDoc = fs.readFileSync(path.join(REPO_ROOT, "docs", "client-configs", "codex.md"), "utf8");
    const proofDoc = fs.readFileSync(path.join(REPO_ROOT, "docs", "codex-local-proof.md"), "utf8");
    expect(codexDoc).toMatch(/context_broker_locked/i);
    expect(codexDoc.toLowerCase()).toMatch(/locked|proof/);
    expect(proofDoc).toContain("context_broker_locked");
    expect(proofDoc.replace(/\*/g, "").toLowerCase()).toContain("do not claim savings from benchmarks");
  });

  it("docs warn when fallback tools dominate discovery telemetry", () => {
    const docs = [
      "docs/ab-testing.md",
      "docs/multi-client-ab-tests.md",
      "docs/agent-instructions/AGENTS.md",
      "docs/client-configs/cursor.md",
    ];
    for (const rel of docs) {
      const text = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      expect(text.toLowerCase()).toMatch(/repo_map|search_code/);
      expect(text.toLowerCase()).toContain("telemetry");
    }
  });
});
