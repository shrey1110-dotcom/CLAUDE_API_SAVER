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

function addMcpTool(tools: Set<string>, tool: string | undefined, server?: string): void {
  if (!tool) return;
  if (!server || server.includes("repo-context")) {
    tools.add(tool);
  }
}

export function extractMcpToolsFromCodexTranscript(text: string): string[] {
  const tools = new Set<string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        item?: { type?: string; tool?: string; server?: string; name?: string };
        tool?: string;
        tool_name?: string;
        mcp_tool?: string;
      };
      if (parsed.type === "item.completed" && parsed.item?.type === "mcp_tool_call") {
        addMcpTool(tools, parsed.item.tool ?? parsed.item.name, parsed.item.server);
      }
      addMcpTool(tools, parsed.tool ?? parsed.tool_name ?? parsed.mcp_tool);
      const nested = parsed as { message?: { tool?: string; tool_name?: string } };
      addMcpTool(tools, nested.message?.tool ?? nested.message?.tool_name);
    } catch {
      // Ignore non-JSON lines.
    }
  }
  return [...tools];
}

export function extractMcpToolsFromClaudeTranscript(text: string): string[] {
  return extractMcpToolsFromCodexTranscript(text);
}
// fixture paths only; not production repos
