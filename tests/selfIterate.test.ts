import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeSelfIteration } from "../src/selfIterate/analyze.js";
import { recommendFromAnalysis } from "../src/selfIterate/recommend.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("self-iteration", () => {
  it("detects tool-loop failure from failed logs", () => {
    const analysis = analyzeSelfIteration(process.cwd());
    const toolLoop = analysis.findings.find((f) => f.id === "tool-loop-failure");
    expect(toolLoop).toBeDefined();
  });

  it("recommends locked mode and refuses fake proof auto-apply", () => {
    const analysis = analyzeSelfIteration(process.cwd());
    const recommendations = recommendFromAnalysis(analysis);
    expect(recommendations.some((r) => r.id === "use-locked-mode" && r.class === "do_not_auto_apply")).toBe(true);
    expect(recommendations.some((r) => r.id === "no-fake-proof" && r.class === "do_not_auto_apply")).toBe(true);
  });

  it("detects missing expected files from ab results", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "self-iter-"));
    tempDirs.push(cwd);
    fs.mkdirSync(path.join(cwd, ".mcp-ab-tests", "results"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".mcp-ab-tests", "results", "plan--context_broker_locked.json"),
      JSON.stringify({ mode: "context_broker_locked", foundExpectedFiles: false, answerQuality: 5 }),
      "utf8",
    );
    const analysis = analyzeSelfIteration(cwd);
    expect(analysis.findings.some((f) => f.id === "locked-quality-miss")).toBe(true);
  });
});
