/**
 * Task rubrics for the Claude supplied-context benchmark.
 *
 * These mirror the rubrics used to score the 2026-06-11 Claude benchmark run
 * (see .mcp-benchmarks/claude/runs). They live in the benchmark layer only —
 * pack generation code must never import them (fairness: no answer leakage).
 *
 * auth-discovery mirrors src/ab/authDiscoveryQuality.ts FILE_MARKERS.
 */

export interface ClaudeBenchmarkTask {
  id: string;
  prompt: string;
}

export const CLAUDE_BENCHMARK_TASKS: ClaudeBenchmarkTask[] = [
  {
    id: "auth-discovery",
    prompt:
      "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.",
  },
  {
    id: "impact-analysis",
    prompt:
      "Find the files most likely impacted by changing context_pack behavior or broker context selection. Do not edit files. Give exact files, functions, and why each matters.",
  },
  {
    id: "edit-planning",
    prompt:
      "Plan a safe edit to improve context-pack behavior while preserving tests. Do not edit files. Give exact files to inspect or modify, relevant tests, and risks.",
  },
  {
    id: "architecture-discovery",
    prompt:
      "Explain the architecture of this repo's context-building and benchmark system. Do not edit files. Give exact files/modules and how they relate.",
  },
  {
    id: "onboarding-map",
    prompt:
      "Create an onboarding map for a new contributor to understand this repo. Do not edit files. Give exact files to read first and why.",
  },
];

export interface RubricCriterion {
  label: string;
  patterns: RegExp[];
}

export const CLAUDE_TASK_RUBRICS: Record<string, RubricCriterion[]> = {
  "auth-discovery": [
    { label: "tests/fixtures/simple-node-app/src/auth/login.ts", patterns: [/simple-node-app\/src\/auth\/login\.ts/i, /\blogin\.ts\b/i] },
    { label: "tests/fixtures/simple-node-app/src/auth/session.ts", patterns: [/simple-node-app\/src\/auth\/session\.ts/i, /\bsession\.ts\b/i] },
    { label: "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts", patterns: [/auth\.controller\.ts/i] },
    { label: "tests/fixtures/monorepo-app/packages/api/src/session.service.ts", patterns: [/session\.service\.ts/i] },
    { label: "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx", patterns: [/LoginPage\.tsx/i] },
  ],
  "impact-analysis": [
    { label: "broker.ts", patterns: [/\bbroker\.ts\b/i, /\bbroker\b/i] },
    { label: "packContext.ts / buildContextPack", patterns: [/\bpackContext\b/i, /\bbuildContextPack\b/i] },
    { label: "proofMinimalPack.ts", patterns: [/\bproofMinimalPack\b/i, /proof.minimal/i] },
    { label: "taskIntent.ts", patterns: [/\btaskIntent\b/i, /task.intent/i] },
    { label: "formatPack.ts", patterns: [/\bformatPack\b/i, /format.pack/i] },
  ],
  "edit-planning": [
    { label: "packContext.ts / buildContextPack", patterns: [/\bpackContext\b/i, /\bbuildContextPack\b/i] },
    { label: "broker.ts", patterns: [/\bbroker\.ts\b/i, /\bbroker\b/i] },
    { label: "tests mentioned", patterns: [/\btest\b/i, /\bsuite\b/i] },
    { label: "risk/preserve mentioned", patterns: [/\brisk\b/i, /\bpreserv/i] },
    { label: "quality / proof mentioned", patterns: [/\bquality\b/i, /\bproof\b/i, /AUTH_DISCOVERY/i] },
  ],
  "architecture-discovery": [
    { label: "broker / context selection", patterns: [/\bbroker\b/i, /context.broker/i] },
    { label: "context pack / packContext", patterns: [/\bpackContext\b/i, /context.pack\b/i, /\bbuildContextPack\b/i] },
    { label: "graph system", patterns: [/\bgraph\b/i] },
    { label: "benchmark system", patterns: [/\bbenchmark\b/i] },
    { label: "MCP / CLI layer", patterns: [/\bMCP\b/i, /\bcli\b/i] },
    { label: "A/B testing", patterns: [/\bA\/B\b/i, /\badapter\b/i] },
  ],
  "onboarding-map": [
    { label: "README.md", patterns: [/\bREADME\b/i] },
    { label: "package.json", patterns: [/\bpackage\.json\b/i] },
    { label: "src/index.ts", patterns: [/\bindex\.ts\b/i, /src\/index/i] },
    { label: "src/context/broker.ts", patterns: [/\bbroker\.ts\b/i, /context\/broker/i] },
    { label: "ordering/rationale", patterns: [/\bfirst\b/i, /\bstart\b/i, /\bbegin\b/i, /\borientation\b/i, /\bentry\b/i] },
  ],
};

export interface RubricScore {
  matched: string[];
  missing: string[];
  found: number;
  totalExpected: number;
  quality: number;
}

export function scoreTextAgainstRubric(taskId: string, text: string): RubricScore {
  const rubric = CLAUDE_TASK_RUBRICS[taskId];
  if (!rubric) {
    return { matched: [], missing: [], found: 0, totalExpected: 0, quality: 0 };
  }
  const matched: string[] = [];
  const missing: string[] = [];
  for (const criterion of rubric) {
    if (criterion.patterns.some((pattern) => pattern.test(text))) {
      matched.push(criterion.label);
    } else {
      missing.push(criterion.label);
    }
  }
  const quality = Math.round((matched.length / rubric.length) * 100) / 10;
  return { matched, missing, found: matched.length, totalExpected: rubric.length, quality };
}

export function estimateContextTokens(text: string): number {
  // Word-count estimator, consistent with the 2026-06-11 Claude benchmark tables.
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}
