import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getCodexQaTask } from "../src/ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../src/ab/codexQa/scoring.js";
import { AUTH_DISCOVERY_EXPECTED_FILES } from "../src/ab/authDiscoveryQuality.js";
import { buildSkillPack } from "../src/cli/skillPack.js";
import { getLastAuthProofSelectionTrace, scoreFileSemanticCategories } from "../src/context/proofMinimalPack.js";
import { resetConfigForTests } from "../src/config.js";

const AUTH_PROMPT =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.";

const PRODUCT_LOGIC_DIRS = ["src/context", "src/cli"];

const FORBIDDEN_IN_PRODUCT = [
  "tests/fixtures/simple-node-app/src/auth/login.ts",
  "tests/fixtures/simple-node-app/src/auth/session.ts",
  "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
  "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
  "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
  "simple-node-app",
  "monorepo-app",
  "LoginPage.tsx",
  "auth.controller.ts",
  "session.service.ts",
];

const ALLOWED_PATH_PREFIXES = [
  "src/ab/",
  "tests/",
  "docs/",
  "scripts/",
];

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function relativeFromRoot(filePath: string): string {
  return filePath.replace(`${process.cwd()}/`, "");
}

afterEach(() => {
  delete process.env.MCP_CONTEXT_PACK_MINIMAL;
  delete process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS;
  delete process.env.MCP_CONTEXT_PACK_MAX_FILES;
  delete process.env.MCP_CONTEXT_PACK_MAX_SYMBOLS;
  resetConfigForTests();
});

describe("proof_minimal_leakage", () => {
  it("product logic does not contain forbidden benchmark path slots", () => {
    const violations: Array<{ file: string; needle: string }> = [];
    for (const dir of PRODUCT_LOGIC_DIRS) {
      const absDir = path.resolve(dir);
      for (const file of listSourceFiles(absDir)) {
        const rel = relativeFromRoot(file);
        const content = fs.readFileSync(file, "utf8");
        for (const needle of FORBIDDEN_IN_PRODUCT) {
          if (content.includes(needle)) {
            violations.push({ file: rel, needle });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("auth-discovery pack selection uses semantic categories not exact filename slots", () => {
    const pack = buildSkillPack({ task: AUTH_PROMPT, budgetTokens: 500 });
    const trace = getLastAuthProofSelectionTrace();
    expect(trace.length).toBeGreaterThan(0);

    expect(trace.length).toBe(pack.files.length);
    for (const entry of trace) {
      expect(entry.category).not.toBe("normal_ranking");
      expect(entry.matchedSignals.length).toBeGreaterThan(0);
      expect(entry.selectedBy).toMatch(/category_coverage|normal_ranking/);
    }

    for (const file of pack.files) {
      const categories = scoreFileSemanticCategories(file, pack.symbols);
      const best = categories[0];
      expect(best.score).toBeGreaterThan(0);
      expect(file.reason).toMatch(
        /auth_login_flow|session_store_or_validation|api_auth_entrypoint|api_session_entrypoint|frontend_login_ui/,
      );
    }

    const profile = getCodexQaTask("auth-discovery")!;
    const score = scoreCodexQaText(profile, JSON.stringify(pack));
    expect(score.matchedFiles.length).toBe(5);
    for (const expected of AUTH_DISCOVERY_EXPECTED_FILES) {
      expect(pack.files.some((file) => file.path === expected)).toBe(true);
    }
  });

  it("allows forbidden benchmark strings only outside product logic", () => {
    const allowedHits: string[] = [];
    for (const prefix of ALLOWED_PATH_PREFIXES) {
      const abs = path.resolve(prefix);
      if (!fs.existsSync(abs)) continue;
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(ts|js|md)$/.test(entry.name)) {
            const rel = relativeFromRoot(full);
            if (PRODUCT_LOGIC_DIRS.some((d) => rel.startsWith(d))) continue;
            const content = fs.readFileSync(full, "utf8");
            if (FORBIDDEN_IN_PRODUCT.some((needle) => content.includes(needle))) {
              allowedHits.push(rel);
            }
          }
        }
      };
      walk(abs);
    }
    expect(allowedHits.length).toBeGreaterThan(0);
  });
});
