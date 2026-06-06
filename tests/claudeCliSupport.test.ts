import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  LOCKED_CLAUDE_CONFIG,
  lockedConfigPath,
  probeClaudeBin,
} from "../src/ab/adapters/claudeCliSupport.js";

const REPO_ROOT = path.resolve(".");

describe("claude cli support", () => {
  it("locked config includes MCP_TOOL_PROFILE=codex_locked", () => {
    const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LOCKED_CLAUDE_CONFIG), "utf8")) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    const env = config.mcpServers["repo-context-mcp"]?.env ?? {};
    expect(env.MCP_TOOL_PROFILE).toBe("codex_locked");
    expect(env.MCP_TELEMETRY).toBe("1");
    expect(env.MCP_OUTPUT_MODE).toBe("compact");
  });

  it("locked config uses placeholder server path", () => {
    const raw = fs.readFileSync(path.join(REPO_ROOT, LOCKED_CLAUDE_CONFIG), "utf8");
    expect(raw).toContain("/path/to/repo-context-mcp/dist/index.js");
    expect(raw).not.toMatch(/\/Users\//);
  });

  it("probeClaudeBin returns found=false for missing absolute path", () => {
    const missing = path.join(REPO_ROOT, ".mcp-ab-tests", "missing-claude-binary");
    const probe = probeClaudeBin(missing);
    expect(probe.found).toBe(false);
  });

  it("ab:claude:doctor prints actionable output", () => {
    const run = spawnSync("node", [path.join(REPO_ROOT, "dist", "scripts", "claudeDoctor.js")], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(output).toContain("repo-context-mcp Claude doctor");
    expect(output).toContain("Claude on PATH");
    expect(output).toContain("context-broker-locked.mcp.json");
    expect(output).toContain("Claude savings are NOT proven");
    expect(output).toContain("ab:claude");
    if (run.status !== 0) {
      expect(output.toLowerCase()).toMatch(/claude on path: no|not available/);
    }
  });

  it("lockedConfigPath resolves under repo", () => {
    expect(lockedConfigPath(REPO_ROOT)).toContain("context-broker-locked.mcp.json");
  });
});
