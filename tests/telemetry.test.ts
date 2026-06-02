import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isTelemetryEnabled, logTelemetryEvent } from "../src/telemetry/logger.js";
import { readTelemetryEntries } from "../src/telemetry/reader.js";
import { generateTelemetryReport } from "../src/telemetry/report.js";
import { TELEMETRY_LOG_FILE } from "../src/telemetry/types.js";
import { formatToolResult, toolError } from "../src/output.js";
import { withTelemetry } from "../src/telemetry/logger.js";
import { repoMap } from "../src/tools/repoMap.js";
import { fixturePath } from "./helpers.js";

const TEST_LOG = path.resolve(".mcp-telemetry/test-logs.jsonl");
const TEST_REPORT = path.resolve(".mcp-telemetry/test-report.md");

describe("telemetry", () => {
  afterEach(() => {
    delete process.env.MCP_TELEMETRY;
    delete process.env.MCP_TELEMETRY_LOG_FILE;
    delete process.env.MCP_TELEMETRY_REPORT_FILE;
    if (fs.existsSync(TEST_LOG)) {
      fs.unlinkSync(TEST_LOG);
    }
    if (fs.existsSync(TEST_REPORT)) {
      fs.unlinkSync(TEST_REPORT);
    }
  });

  it("does not write logs when disabled", () => {
    delete process.env.MCP_TELEMETRY;
    expect(isTelemetryEnabled()).toBe(false);
    const beforeSize = fs.existsSync(TELEMETRY_LOG_FILE) ? fs.statSync(TELEMETRY_LOG_FILE).size : 0;
    logTelemetryEvent({
      tool: "test",
      args: {},
      durationMs: 1,
      outputChars: 1,
      success: true,
    });
    const afterSize = fs.existsSync(TELEMETRY_LOG_FILE) ? fs.statSync(TELEMETRY_LOG_FILE).size : 0;
    expect(afterSize).toBe(beforeSize);
  });

  it("writes complete entries when enabled", async () => {
    process.env.MCP_TELEMETRY = "1";
    process.env.MCP_TELEMETRY_LOG_FILE = TEST_LOG;
    process.env.MCP_TELEMETRY_REPORT_FILE = TEST_REPORT;
    await withTelemetry("repo_map", { root: fixturePath("simple-node-app") }, async () =>
      formatToolResult(repoMap(fixturePath("simple-node-app"))),
    );
    const entries = readTelemetryEntries();
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries.at(-1)!;
    expect(entry.tool).toBe("repo_map");
    expect(entry.timestamp).toBeTruthy();
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.outputChars).toBeGreaterThan(0);
    expect(entry.estimatedOutputTokens).toBeGreaterThan(0);
    expect(entry.success).toBe(true);
  });

  it("logs errors with success false", async () => {
    process.env.MCP_TELEMETRY = "1";
    process.env.MCP_TELEMETRY_LOG_FILE = TEST_LOG;
    process.env.MCP_TELEMETRY_REPORT_FILE = TEST_REPORT;
    await withTelemetry("bad_tool", { x: "y".repeat(2000) }, async () => toolError("boom"));
    const entry = readTelemetryEntries().at(-1)!;
    expect(entry.success).toBe(false);
    expect(entry.error).toContain("boom");
    expect(JSON.stringify(entry.args).length).toBeLessThan(2000);
  });

  it("report generation works after entries exist", () => {
    process.env.MCP_TELEMETRY = "1";
    process.env.MCP_TELEMETRY_LOG_FILE = TEST_LOG;
    process.env.MCP_TELEMETRY_REPORT_FILE = TEST_REPORT;
    logTelemetryEvent({
      tool: "search_code",
      args: { query: "login" },
      durationMs: 4,
      outputChars: 200,
      success: true,
    });
    const reportPath = generateTelemetryReport();
    const report = fs.readFileSync(reportPath, "utf8");
    expect(report).toContain("Paste this report into ChatGPT for optimization advice");
  });
});
