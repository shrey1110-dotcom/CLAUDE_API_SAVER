import { describe, expect, it } from "vitest";
import {
  AUTH_DISCOVERY_PROFILE,
  evaluateAuthDiscoveryPack,
  scoreAuthDiscoveryText,
} from "../src/taskProfiles/authDiscovery.js";

describe("auth-discovery task profile", () => {
  it("defines expected files and concepts for evaluation only", () => {
    expect(AUTH_DISCOVERY_PROFILE.expectedFiles).toHaveLength(5);
    expect(AUTH_DISCOVERY_PROFILE.expectedConcepts).toContain("auth");
  });

  it("scores quality from answer text without hardcoding pack output", () => {
    const good = scoreAuthDiscoveryText(
      "login.ts session.ts auth.controller.ts session.service.ts LoginPage.tsx cover auth login session",
    );
    expect(good.foundExpectedFiles).toBe(true);
    expect(good.answerQuality).toBeGreaterThanOrEqual(9);
  });

  it("evaluateAuthDiscoveryPack checks file list recall", () => {
    const result = evaluateAuthDiscoveryPack([
      "tests/fixtures/simple-node-app/src/auth/login.ts",
      "tests/fixtures/simple-node-app/src/auth/session.ts",
      "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
      "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
      "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
    ]);
    expect(result.foundExpectedFiles).toBe(true);
    expect(result.matchedCount).toBe(5);
  });
});
