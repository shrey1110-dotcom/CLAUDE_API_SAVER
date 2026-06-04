import {
  AUTH_DISCOVERY_EXPECTED_FILES,
  AUTH_DISCOVERY_TASK,
  scoreAuthDiscoveryAnswer,
  type AuthDiscoveryQualityScore,
} from "../ab/authDiscoveryQuality.js";

export const AUTH_DISCOVERY_PROFILE = {
  taskName: AUTH_DISCOVERY_TASK,
  expectedFiles: [...AUTH_DISCOVERY_EXPECTED_FILES],
  expectedConcepts: ["auth", "login", "session", "authentication"],
  expectedPatterns: [/login\.ts/i, /session\.ts/i, /auth\.controller\.ts/i, /session\.service\.ts/i, /LoginPage\.tsx/i],
  relevantCategories: ["code", "api", "frontend", "tests/fixtures"] as const,
};

export function evaluateAuthDiscoveryPack(files: string[]): {
  foundExpectedFiles: boolean;
  matchedCount: number;
  missing: string[];
} {
  const haystack = files.join("\n").toLowerCase();
  const matched = AUTH_DISCOVERY_PROFILE.expectedFiles.filter((file) => haystack.includes(file.toLowerCase()));
  return {
    foundExpectedFiles: matched.length === AUTH_DISCOVERY_PROFILE.expectedFiles.length,
    matchedCount: matched.length,
    missing: AUTH_DISCOVERY_PROFILE.expectedFiles.filter((file) => !matched.includes(file)),
  };
}

export function scoreAuthDiscoveryText(text: string): AuthDiscoveryQualityScore {
  return scoreAuthDiscoveryAnswer(text);
}
