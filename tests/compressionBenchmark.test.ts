import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COMPRESSION_REPORT_JSON,
  COMPRESSION_REPORT_MD,
  DIAGNOSTIC_WARNING,
  runCompressionBenchmark,
  writeCompressionReport,
} from "../src/benchmark/compressionReport.js";
import { AUTH_DISCOVERY_EXPECTED_FILES } from "../src/ab/authDiscoveryQuality.js";

const REPO_ROOT = path.resolve(".");
const REPORT_DIR = path.join(REPO_ROOT, COMPRESSION_REPORT_JSON.split("/")[0]);

beforeAll(() => {
  const build = spawnSync("npm", ["run", "graph:build"], { cwd: REPO_ROOT, encoding: "utf8", shell: true });
  if (build.status !== 0) {
    throw new Error(`graph:build failed: ${build.stderr}`);
  }
  const context = spawnSync("npm", ["run", "context:build"], { cwd: REPO_ROOT, encoding: "utf8", shell: true });
  if (context.status !== 0) {
    throw new Error(`context:build failed: ${context.stderr}`);
  }
});

afterAll(() => {
  for (const file of [COMPRESSION_REPORT_MD, COMPRESSION_REPORT_JSON]) {
    const full = path.join(REPO_ROOT, file);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
  }
  if (fs.existsSync(REPORT_DIR) && fs.readdirSync(REPORT_DIR).length === 0) {
    fs.rmdirSync(REPORT_DIR);
  }
});

describe("benchmark:compression", () => {
  it("runs and writes compression report files", () => {
    const run = spawnSync("npm", ["run", "benchmark:compression"], { cwd: REPO_ROOT, encoding: "utf8", shell: true });
    expect(run.status).toBe(0);
    expect(fs.existsSync(path.join(REPO_ROOT, COMPRESSION_REPORT_MD))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, COMPRESSION_REPORT_JSON))).toBe(true);
  });

  it("includes full_repo and relevant_files compression ratios", () => {
    const report = runCompressionBenchmark(REPO_ROOT);
    expect(report.fullRawRepoTokens).toBeGreaterThan(0);
    expect(report.tasks.length).toBe(5);
    for (const task of report.tasks) {
      expect(task).toHaveProperty("fullRepoCompressionRatio");
      expect(task).toHaveProperty("relevantFilesCompressionRatio");
      if (task.contextPackTokens > 0) {
        expect(task.fullRepoCompressionRatio).toBeGreaterThan(1);
        expect(task.relevantFilesCompressionRatio).toBeGreaterThan(0);
      }
    }
    const json = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, COMPRESSION_REPORT_JSON), "utf8"));
    expect(json.warning).toContain("not proof of real agent savings");
  });

  it("does not claim real savings in the report", () => {
    const markdown = fs.readFileSync(path.join(REPO_ROOT, COMPRESSION_REPORT_MD), "utf8");
    expect(markdown).toContain(DIAGNOSTIC_WARNING);
    expect(markdown.toLowerCase()).toContain("not proof of real");
    expect(markdown).not.toMatch(/proven_savings_stable.*graphify/i);
    expect(markdown).not.toMatch(/beat graphify/i);
  });

  it("auth-discovery context_pack finds 5/5 expected files", () => {
    const report = runCompressionBenchmark(REPO_ROOT);
    const auth = report.tasks.find((task) => task.taskName === "auth-discovery");
    expect(auth).toBeDefined();
    expect(auth!.expectedFilesFound).toBe(true);
    for (const file of AUTH_DISCOVERY_EXPECTED_FILES) {
      expect(auth!.matchedFiles).toContain(file);
    }
  });

  it("docs distinguish diagnostic compression from real A/B savings", () => {
    const benchmarks = fs.readFileSync(path.join(REPO_ROOT, "docs", "benchmarks.md"), "utf8");
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    const product = fs.readFileSync(path.join(REPO_ROOT, "docs", "product-status.md"), "utf8");
    expect(benchmarks.toLowerCase()).toMatch(/diagnostic compression/);
    expect(benchmarks.toLowerCase()).toMatch(/real a\/b|real client/);
    expect(readme.toLowerCase()).toMatch(/diagnostic compression|not proof/);
    expect(product.toLowerCase()).toMatch(/graphify|diagnostic/);
    expect(product.toLowerCase()).not.toMatch(/beat graphify|better than graphify/);
  });

  it("writeCompressionReport round-trips json fields", () => {
    const report = runCompressionBenchmark(REPO_ROOT);
    const { jsonPath } = writeCompressionReport(report, path.join(REPO_ROOT, ".mcp-benchmarks-test"));
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(parsed.metricType).toBe("diagnostic_compression");
    expect(parsed.tasks[0].fullRepoCompressionRatio).toBeTypeOf("number");
    fs.rmSync(path.dirname(jsonPath), { recursive: true, force: true });
  });
});
