import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseCodexUsageFromOutput } from "../src/ab/adapters/codexUsage.js";

const REPO_ROOT = path.resolve(".");
const DIST_AB = path.join(REPO_ROOT, "dist", "ab");
const DIST_CODEX = path.join(DIST_AB, "adapters", "codexCli.js");
const DIST_REAL_CHECK = path.join(DIST_AB, "realCheck.js");

const tempDirs: string[] = [];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-codex-"));
}

afterEach(() => {
  delete process.env.AB_ENABLE_CODEX_ADAPTER;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("codex adapter", () => {
  it("ab:codex refuses to run unless AB_ENABLE_CODEX_ADAPTER=1", () => {
    const cwd = REPO_ROOT;
    const run = spawnSync("node", [DIST_CODEX, "--mode", "no_mcp", "--repo", ".", "--yes"], { cwd, encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}\n${run.stdout}`).toContain("disabled");
  });

  it("ab:codex refuses to run without --yes", () => {
    process.env.AB_ENABLE_CODEX_ADAPTER = "1";
    const run = spawnSync("node", [DIST_CODEX, "--mode", "no_mcp", "--repo", "."], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}\n${run.stdout}`).toContain("requires --yes");
  });

  it("adapter implementation uses spawn with shell:false", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "ab", "adapters", "codexCli.ts"), "utf8");
    expect(source).toContain("spawn(");
    expect(source).toContain("shell: false");
  });

  it("adapter does not mutate global ~/.codex/config.toml", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "ab", "adapters", "codexCli.ts"), "utf8");
    expect(source).not.toContain("~/.codex/config.toml");
    expect(source).not.toContain("homedir(");
  });

  it("usage parser returns null when usage fields are absent", () => {
    const usage = parseCodexUsageFromOutput("hello world", "");
    expect(usage).toBeNull();
  });

  it("usage parser extracts fields from usage JSON", () => {
    const usage = parseCodexUsageFromOutput(
      '{"usage":{"input_tokens":120,"output_tokens":80,"cache_read_tokens":10,"cache_write_tokens":5,"total_tokens":215}}',
      "",
    );
    expect(usage?.clientInputTokens).toBe(120);
    expect(usage?.clientOutputTokens).toBe(80);
    expect(usage?.clientTotalTokens).toBe(215);
  });

  it("prompt file and run output directory are generated", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    process.env.AB_ENABLE_CODEX_ADAPTER = "1";

    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "current-plan.json"),
      JSON.stringify(
        {
          id: "plan-codex",
          createdAt: new Date().toISOString(),
          client: "codex",
          repoPath: cwd,
          taskName: "auth-discovery",
          taskPrompt: "Find auth logic.",
          modes: ["no_mcp", "context_broker"],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "codex-adapter.json"),
      JSON.stringify(
        {
          codexBin: "node",
          baseArgs: [
            "-e",
            "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log('{\"usage\":{\"input_tokens\":1,\"output_tokens\":2,\"total_tokens\":3}}')})",
          ],
          promptArgMode: "stdin",
          configArgs: [],
          cwd: "{repoPath}",
        },
        null,
        2,
      ),
      "utf8",
    );
    const cfg = path.join(cwd, "no-mcp.config.toml");
    fs.writeFileSync(cfg, "# test config\n", "utf8");

    const run = spawnSync(
      "node",
      [DIST_CODEX, "--mode", "no_mcp", "--repo", ".", "--yes", "--config", cfg, "--out", ".mcp-ab-tests/codex-runs"],
      { cwd, encoding: "utf8" },
    );
    expect(run.status).toBe(0);

    const outRoot = path.join(cwd, ".mcp-ab-tests", "codex-runs");
    const dirs = fs.readdirSync(outRoot);
    expect(dirs.length).toBeGreaterThan(0);
    const runDir = path.join(outRoot, dirs[0]);
    expect(fs.existsSync(path.join(runDir, "prompt.txt"))).toBe(true);
    expect(fs.existsSync(path.join(runDir, "run.json"))).toBe(true);
    expect(fs.existsSync(path.join(runDir, "transcript.md"))).toBe(true);
  });

  it("ab:real-check is INCOMPLETE TEST when Codex usage is missing", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "current-plan.json"),
      JSON.stringify(
        {
          id: "plan-1",
          createdAt: new Date().toISOString(),
          client: "codex",
          repoPath: cwd,
          taskName: "auth-discovery",
          taskPrompt: "x",
          modes: ["no_mcp", "context_broker_locked"],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", "plan-1--no_mcp.json"),
      JSON.stringify(
        {
          id: "r1",
          planId: "plan-1",
          mode: "no_mcp",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          clientTotalTokens: 1000,
          clientTotalTokenRepeats: [1000, 1000, 1000],
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
      path.join(cwd, ".mcp-ab-tests", "results", "plan-1--context_broker_locked.json"),
      JSON.stringify(
        {
          id: "r2",
          planId: "plan-1",
          mode: "context_broker_locked",
          client: "codex",
          repoPath: cwd,
          prompt: "x",
          mcpEstimatedOutputTokens: 100,
          mcpToolCalls: 2,
          mcpToolsUsed: ["context_status", "context_pack"],
          answerQuality: 8,
          foundExpectedFiles: true,
        },
        null,
        2,
      ),
      "utf8",
    );

    const run = spawnSync("node", [DIST_REAL_CHECK], { cwd, encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}\n${run.stderr}`).toContain("ab_real_check_status=INCOMPLETE_TEST");
  });

  it("docs warn not to claim savings without real Codex usage", () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, "docs", "client-configs", "codex.md"), "utf8").toLowerCase();
    expect(doc).toContain("do not claim savings");
    expect(doc).toContain("manual entry");
  });

  it("codex:doctor reports missing codex cleanly", () => {
    const run = spawnSync("node", [path.join(REPO_ROOT, "dist", "scripts", "codexDoctor.js")], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(output).toContain("repo-context-mcp codex doctor");
    expect(output).toContain("Codex on PATH");
    expect(output).toContain("codex --version");
    expect(output).toContain("context-broker-locked.config.toml");
    expect(output).toContain("context_broker_locked");
    expect(output).toContain("ab:codex");
    if (run.status !== 0) {
      expect(output.toLowerCase()).toMatch(/codex on path: no|not available/);
    }
  });

  it("ab:codex ENOENT error gives actionable command", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    process.env.AB_ENABLE_CODEX_ADAPTER = "1";
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "current-plan.json"),
      JSON.stringify(
        {
          id: "plan-codex-enoent",
          createdAt: new Date().toISOString(),
          client: "codex",
          repoPath: cwd,
          taskName: "auth-discovery",
          taskPrompt: "Find auth logic.",
          modes: ["context_broker_locked"],
        },
        null,
        2,
      ),
      "utf8",
    );
    const missingBin = path.join(cwd, "nonexistent-codex-binary-for-test");
    const lockedConfig = path.join(REPO_ROOT, "examples", "codex", "ab", "context-broker-locked.config.toml");
    const run = spawnSync(
      "node",
      [
        DIST_CODEX,
        "--mode",
        "context_broker_locked",
        "--repo",
        ".",
        "--yes",
        "--config",
        lockedConfig,
        "--codex-bin",
        missingBin,
      ],
      { cwd, encoding: "utf8" },
    );
    expect(run.status).not.toBe(0);
    const output = `${run.stderr}\n${run.stdout}`;
    expect(output).toContain("Codex CLI was not found.");
    expect(output).toContain("Run: which codex");
    expect(output).toContain("Or pass: --codex-bin /absolute/path/to/codex");
    expect(output).toContain("You must run this on a machine with Codex CLI installed.");
  });

  it("codex local proof doc mentions --codex-bin", () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, "docs", "codex-local-proof.md"), "utf8");
    expect(doc).toContain("--codex-bin");
    expect(doc).toContain("PROVEN_SAVINGS_STABLE");
    expect(doc).toContain("ab:real-check");
  });
});
