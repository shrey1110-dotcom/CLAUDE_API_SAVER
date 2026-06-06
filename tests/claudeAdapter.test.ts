import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(".");
const DIST_CLAUDE = path.join(REPO_ROOT, "dist", "ab", "adapters", "claudeCli.js");
const DIST_REAL_CHECK = path.join(REPO_ROOT, "dist", "ab", "claudeRealCheckCli.js");

const tempDirs: string[] = [];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-claude-"));
}

afterEach(() => {
  delete process.env.AB_ENABLE_CLAUDE_ADAPTER;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("claude adapter", () => {
  it("ab:claude refuses without AB_ENABLE_CLAUDE_ADAPTER=1", () => {
    const run = spawnSync("node", [DIST_CLAUDE, "--mode", "no_mcp", "--repo", ".", "--yes"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}\n${run.stdout}`).toContain("disabled");
  });

  it("ab:claude refuses without --yes", () => {
    process.env.AB_ENABLE_CLAUDE_ADAPTER = "1";
    const run = spawnSync("node", [DIST_CLAUDE, "--mode", "no_mcp", "--repo", "."], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}\n${run.stdout}`).toContain("requires --yes");
  });

  it("adapter uses spawn with shell:false", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "ab", "adapters", "claudeCli.ts"), "utf8");
    expect(source).toContain("spawn(");
    expect(source).toContain("shell: false");
  });

  it("adapter does not mutate global Claude config paths", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src", "ab", "adapters", "claudeCli.ts"), "utf8");
    expect(source).not.toContain("claude_desktop_config.json");
    expect(source).not.toContain(".claude/settings");
    expect(source).toContain("copyFileSync");
  });

  it("writes run dirs under .mcp-ab-tests/claude-runs", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    process.env.AB_ENABLE_CLAUDE_ADAPTER = "1";

    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "current-plan.json"),
      JSON.stringify(
        {
          id: "plan-claude",
          createdAt: new Date().toISOString(),
          client: "claude_code",
          repoPath: cwd,
          taskName: "auth-discovery",
          taskPrompt: "Find auth logic.",
          modes: ["no_mcp", "context_broker_locked"],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "claude-adapter.json"),
      JSON.stringify(
        {
          claudeBin: "node",
          baseArgs: [
            "-e",
            "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(JSON.stringify({usage:{input_tokens:1,output_tokens:2,total_tokens:3}}))})",
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
    const cfg = path.join(cwd, "no-mcp.mcp.json");
    fs.writeFileSync(cfg, '{"mcpServers":{}}\n', "utf8");

    const run = spawnSync(
      "node",
      [DIST_CLAUDE, "--mode", "no_mcp", "--repo", ".", "--yes", "--config", cfg, "--out", ".mcp-ab-tests/claude-runs"],
      { cwd, encoding: "utf8" },
    );
    expect(run.status).toBe(0);

    const outRoot = path.join(cwd, ".mcp-ab-tests", "claude-runs");
    const dirs = fs.readdirSync(outRoot);
    expect(dirs.length).toBeGreaterThan(0);
    const runDir = path.join(outRoot, dirs[0]);
    expect(fs.existsSync(path.join(runDir, "prompt.txt"))).toBe(true);
    expect(fs.existsSync(path.join(runDir, "run.json"))).toBe(true);
    expect(fs.existsSync(path.join(runDir, "transcript.md"))).toBe(true);
  });

  it("ab:claude:real-check returns INCOMPLETE_TEST when usage is missing", () => {
    const cwd = makeTempDir();
    tempDirs.push(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "current-plan.json"),
      JSON.stringify(
        {
          id: "plan-claude-1",
          createdAt: new Date().toISOString(),
          client: "claude_code",
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
      path.join(cwd, ".mcp-ab-tests", "results", "plan-claude-1--no_mcp.json"),
      JSON.stringify(
        {
          id: "r1",
          planId: "plan-claude-1",
          mode: "no_mcp",
          client: "claude_code",
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
      path.join(cwd, ".mcp-ab-tests", "results", "plan-claude-1--context_broker_locked.json"),
      JSON.stringify(
        {
          id: "r2",
          planId: "plan-claude-1",
          mode: "context_broker_locked",
          client: "claude_code",
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
    expect(`${run.stdout}\n${run.stderr}`).toContain("ab_claude_real_check_status=INCOMPLETE_TEST");
  });

  it("docs warn Claude savings are not proven", () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, "docs", "client-configs", "claude-code.md"), "utf8").toLowerCase();
    expect(doc).toContain("not proven");
    expect(doc).toContain("locked");
  });
});
