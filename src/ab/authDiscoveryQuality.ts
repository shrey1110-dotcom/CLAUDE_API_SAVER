/**
 * Task-specific quality scoring for the auth-discovery A/B prompt.
 * Not a universal quality model.
 */

export const AUTH_DISCOVERY_TASK = "auth-discovery";

export const AUTH_DISCOVERY_EXPECTED_FILES = [
  "tests/fixtures/simple-node-app/src/auth/login.ts",
  "tests/fixtures/simple-node-app/src/auth/session.ts",
  "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
  "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
  "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
] as const;

export interface AuthDiscoveryQualityScore {
  task: typeof AUTH_DISCOVERY_TASK;
  matched: string[];
  missing: string[];
  foundExpectedFiles: boolean;
  answerQuality: number;
  note: string;
}

const FILE_MARKERS: Array<{ path: string; patterns: RegExp[] }> = [
  {
    path: AUTH_DISCOVERY_EXPECTED_FILES[0],
    patterns: [/simple-node-app\/src\/auth\/login\.ts/i, /\blogin\.ts\b/i],
  },
  {
    path: AUTH_DISCOVERY_EXPECTED_FILES[1],
    patterns: [/simple-node-app\/src\/auth\/session\.ts/i, /\bsession\.ts\b/i],
  },
  {
    path: AUTH_DISCOVERY_EXPECTED_FILES[2],
    patterns: [/auth\.controller\.ts/i],
  },
  {
    path: AUTH_DISCOVERY_EXPECTED_FILES[3],
    patterns: [/session\.service\.ts/i],
  },
  {
    path: AUTH_DISCOVERY_EXPECTED_FILES[4],
    patterns: [/LoginPage\.tsx/i],
  },
];

export function scoreAuthDiscoveryAnswer(text: string): AuthDiscoveryQualityScore {
  const haystack = text.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];

  for (const marker of FILE_MARKERS) {
    const found = marker.patterns.some((pattern) => pattern.test(haystack));
    if (found) {
      matched.push(marker.path);
    } else {
      missing.push(marker.path);
    }
  }

  const missingCount = missing.length;
  let answerQuality = 3;
  if (missingCount === 0) answerQuality = 9;
  else if (missingCount === 1) answerQuality = 7;
  else if (missingCount === 2) answerQuality = 5;

  return {
    task: AUTH_DISCOVERY_TASK,
    matched,
    missing,
    foundExpectedFiles: missingCount === 0,
    answerQuality,
    note: `auth-discovery task-specific scoring: ${matched.length}/5 expected files mentioned.`,
  };
}

export function extractMcpToolsFromCodexTranscript(text: string): string[] {
  const tools = new Set<string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        item?: { type?: string; tool?: string; server?: string };
      };
      if (parsed.type === "item.completed" && parsed.item?.type === "mcp_tool_call" && parsed.item.tool) {
        if (!parsed.item.server || parsed.item.server.includes("repo-context")) {
          tools.add(parsed.item.tool);
        }
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }
  return [...tools];
}
