export interface CodexQaOutputCategory {
  name: string;
  patterns: string[];
}

export interface CodexQaTaskProfile {
  taskName: string;
  prompt: string;
  expectedConcepts: string[];
  expectedFilePatterns: string[];
  expectedOutputCategories: CodexQaOutputCategory[];
  qualityRubric: string[];
  passThreshold: number;
  minExpectedFileMatches: number;
  minExpectedConceptMatches: number;
  minExpectedCategoryMatches: number;
}

export const CODEX_QA_TASKS: CodexQaTaskProfile[] = [
  {
    taskName: "auth-discovery",
    prompt:
      "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.",
    expectedConcepts: ["authentication", "login", "session", "user session", "frontend", "api"],
    expectedFilePatterns: [
      "tests/fixtures/simple-node-app/src/auth/login.ts",
      "tests/fixtures/simple-node-app/src/auth/session.ts",
      "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
      "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
      "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
    ],
    expectedOutputCategories: [
      { name: "files", patterns: ["file", "path"] },
      { name: "functions", patterns: ["function", "symbol", "loginUser", "SessionService", "LoginPage"] },
      { name: "explanations", patterns: ["why", "matters", "because"] },
    ],
    qualityRubric: [
      "Finds all five expected auth/session files.",
      "Identifies functions or symbols when surfaced by the repo context.",
      "Separates actual auth/session fixture logic from token-accounting internals.",
    ],
    passThreshold: 9,
    minExpectedFileMatches: 5,
    minExpectedConceptMatches: 3,
    minExpectedCategoryMatches: 2,
  },
  {
    taskName: "impact-analysis",
    prompt:
      "Find all files likely affected if session validation behavior changes. Include related tests, configs, API/frontend entry points, and risks. Do not edit files.",
    expectedConcepts: ["session validation", "impact", "tests", "risk", "api", "frontend", "config"],
    expectedFilePatterns: [
      "tests/fixtures/simple-node-app/src/auth/session.ts",
      "tests/fixtures/simple-node-app/src/auth/login.ts",
      "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
      "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
      "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
      "tests/context.test.ts",
      "tests/tools.test.ts",
      "package.json",
    ],
    expectedOutputCategories: [
      { name: "affected files", patterns: ["affected", "likely", "file"] },
      { name: "tests", patterns: ["test", "vitest", "context.test", "tools.test"] },
      { name: "configs", patterns: ["config", "package.json", "tsconfig", "vitest"] },
      { name: "risks", patterns: ["risk", "regression", "breaking"] },
    ],
    qualityRubric: [
      "Covers session/auth implementation files and entry points.",
      "Mentions related tests or test commands.",
      "Includes risk notes for session validation behavior changes.",
    ],
    passThreshold: 8,
    minExpectedFileMatches: 5,
    minExpectedConceptMatches: 4,
    minExpectedCategoryMatches: 3,
  },
  {
    taskName: "edit-planning",
    prompt:
      "Plan the smallest safe change to add refresh-token expiration handling. Include exact files, symbols, tests, and risks. Do not edit files.",
    expectedConcepts: ["refresh token", "expiration", "session", "smallest safe change", "tests", "risk"],
    expectedFilePatterns: [
      "tests/fixtures/simple-node-app/src/auth/session.ts",
      "tests/fixtures/simple-node-app/src/auth/login.ts",
      "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
      "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
      "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
      "tests/context.test.ts",
      "tests/tools.test.ts",
    ],
    expectedOutputCategories: [
      { name: "plan", patterns: ["plan", "smallest", "safe change"] },
      { name: "symbols", patterns: ["symbol", "function", "SessionService", "loginUser"] },
      { name: "tests", patterns: ["test", "vitest", "assert"] },
      { name: "risks", patterns: ["risk", "expiry", "expiration", "regression"] },
    ],
    qualityRubric: [
      "Plans a minimal change rather than editing files.",
      "Identifies session/auth files and tests.",
      "Calls out expiration-specific risks.",
    ],
    passThreshold: 8,
    minExpectedFileMatches: 4,
    minExpectedConceptMatches: 4,
    minExpectedCategoryMatches: 3,
  },
  {
    taskName: "architecture-discovery",
    prompt:
      "Summarize the authentication, routing, API, frontend, and test boundaries in this repo. Do not edit files.",
    expectedConcepts: ["authentication", "routing", "api", "frontend", "tests", "boundaries"],
    expectedFilePatterns: [
      "tests/fixtures/simple-node-app/src/index.ts",
      "tests/fixtures/simple-node-app/src/auth/login.ts",
      "tests/fixtures/simple-node-app/src/auth/session.ts",
      "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
      "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
      "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
      "tests/context.test.ts",
      "tests/graph.test.ts",
    ],
    expectedOutputCategories: [
      { name: "auth boundary", patterns: ["auth", "login", "session"] },
      { name: "api boundary", patterns: ["api", "controller", "service"] },
      { name: "frontend boundary", patterns: ["frontend", "web", "LoginPage"] },
      { name: "test boundary", patterns: ["test", "fixture", "vitest"] },
    ],
    qualityRubric: [
      "Separates auth, API, frontend, and test fixture boundaries.",
      "Mentions representative files for each boundary.",
      "Avoids claiming production auth exists when only fixture/demo auth is present.",
    ],
    passThreshold: 8,
    minExpectedFileMatches: 5,
    minExpectedConceptMatches: 4,
    minExpectedCategoryMatches: 4,
  },
  {
    taskName: "onboarding-map",
    prompt:
      "Give a compact onboarding map for this repo: major areas, important configs, test commands, auth/session flow, and where a new contributor should start. Do not edit files.",
    expectedConcepts: ["onboarding", "major areas", "configs", "test commands", "auth/session flow", "start"],
    expectedFilePatterns: [
      "README.md",
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "src/index.ts",
      "src/context/broker.ts",
      "src/graph/buildGraph.ts",
      "tests/fixtures/simple-node-app/src/auth/login.ts",
      "tests/fixtures/simple-node-app/src/auth/session.ts",
    ],
    expectedOutputCategories: [
      { name: "major areas", patterns: ["major areas", "src", "context", "graph", "telemetry"] },
      { name: "configs", patterns: ["config", "package.json", "tsconfig", "vitest"] },
      { name: "commands", patterns: ["npm run", "test", "build"] },
      { name: "auth/session flow", patterns: ["auth", "session", "login"] },
      { name: "start guidance", patterns: ["start", "new contributor", "begin"] },
    ],
    qualityRubric: [
      "Gives a compact map of project areas and commands.",
      "Includes auth/session fixture flow.",
      "Names configs and a practical starting point.",
    ],
    passThreshold: 8,
    minExpectedFileMatches: 5,
    minExpectedConceptMatches: 4,
    minExpectedCategoryMatches: 4,
  },
];

export function getCodexQaTask(taskName: string): CodexQaTaskProfile | undefined {
  return CODEX_QA_TASKS.find((task) => task.taskName === taskName);
}

