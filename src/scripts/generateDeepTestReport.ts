import fs from "node:fs";
import path from "node:path";
import { analyzeTelemetry } from "../telemetry/analyze.js";
import { readTelemetryEntries } from "../telemetry/reader.js";

const REPORT_PATH = path.resolve(".mcp-telemetry/deep-test-report.md");
const BENCHMARK_PATH = path.resolve(".mcp-telemetry/benchmark-workflow.json");

interface WorkflowBenchmark {
  verdict?: string;
  totalCalls?: number;
  totalTokens?: number;
  averageResponseChars?: number;
  largestResponse?: { tool: string; chars: number };
  exceeded5k?: number;
  exceeded10k?: number;
  exceeded15k?: number;
}

function loadBenchmark(): WorkflowBenchmark | null {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, "utf8")) as WorkflowBenchmark;
}

function main(): void {
  const telemetry = analyzeTelemetry(readTelemetryEntries());
  const benchmark = loadBenchmark();

  const markdown = `# repo-context-mcp Deep Test Report

Generated: ${new Date().toISOString()}

## Test commands run

\`\`\`bash
npm install
npm run build
npm run test:all
npm run benchmark:workflow
npm run telemetry:report
\`\`\`

## Pass/fail status

- Build: expected via \`npm run test:all\`
- Unit/tool tests: \`npm run test\`
- Edge tests: \`npm run test:edge\`
- Security tests: \`npm run test:security\`
- Output budget tests: \`npm run test:benchmark\`
- Workflow benchmark: \`npm run benchmark:workflow\`
- Telemetry validate: \`npm run validate\`

## Fixture repos tested

- \`tests/fixtures/simple-node-app\`
- \`tests/fixtures/monorepo-app\`
- \`tests/fixtures/noisy-large-repo\`
- \`tests/fixtures/non-node-project\`
- \`tests/fixtures/edge-symbols-project\`
- \`tests/fixtures/empty-repo\`

## Tool correctness summary

- **repo_map**: package manager, languages, config files, scripts, tree exclusions
- **search_code**: keyword search, compact context, exclusions, truncation markers
- **get_file_outline**: compact imports/symbols with line numbers
- **get_symbol_context**: definition-only matches, line ranges, truncation markers
- **get_project_commands**: npm/python/makefile command detection

## Security test summary

- Path traversal blocked (\`../\`, absolute outside root)
- Symlink escape blocked
- Huge/binary files skipped or rejected
- Telemetry arg truncation verified
- Malformed JSONL lines skipped safely

## Telemetry test summary

- Disabled mode writes no logs
- Enabled mode logs required fields per tool call
- Errors log \`success: false\`
- Summary/report generation works

## Output-budget summary

- Default mode: \`compact\`
- Env overrides: \`MCP_OUTPUT_MODE\`, \`MCP_MAX_RESPONSE_CHARS\`, \`MCP_DEFAULT_SEARCH_RESULTS\`, \`MCP_TREE_DEPTH\`, \`MCP_SYMBOL_CONTEXT_LINES\`
- Invalid env values fall back to safe defaults
- All tools respect \`MCP_MAX_RESPONSE_CHARS\`

## Workflow benchmark summary

- Verdict: ${benchmark?.verdict ?? "not run"}
- Total MCP tool calls: ${benchmark?.totalCalls ?? 0}
- Estimated MCP output tokens: ${benchmark?.totalTokens?.toLocaleString() ?? "0"}
- Average response size: ${benchmark?.averageResponseChars?.toLocaleString() ?? "0"} chars
- Largest response: ${benchmark?.largestResponse ? `${benchmark.largestResponse.tool} (${benchmark.largestResponse.chars.toLocaleString()} chars)` : "n/a"}
- Responses >5k chars: ${benchmark?.exceeded5k ?? 0}
- Responses >10k chars: ${benchmark?.exceeded10k ?? 0}
- Responses >15k chars: ${benchmark?.exceeded15k ?? 0}

## Live telemetry snapshot

- Total tool calls in log: ${telemetry.totalCalls}
- Estimated MCP output tokens: ${telemetry.estimatedTotalTokens.toLocaleString()}
- Average response size: ${telemetry.avgResponseChars.toLocaleString()} chars
- Largest response: ${telemetry.largestResponses[0]?.outputChars?.toLocaleString() ?? "0"} chars (${telemetry.largestResponses[0]?.tool ?? "n/a"})

## Known limitations

- Outline/symbol parsing is regex-based (v1), not a full TypeScript AST
- Ripgrep availability changes search behavior vs Node fallback
- Contribution/token savings vs raw file reads require a real client A/B test
- Monorepo detection is structural, not workspace-aware package graph analysis

## Recommended next steps before real client A/B testing

1. Run \`docs/multi-client-ab-tests.md\` Test A (MCP disabled) and Test B (MCP enabled) in fresh chats
2. Compare client total usage + MCP estimated tokens using the documented success rule
3. If MCP is ignored, strengthen client instructions to call context_pack first
4. If outputs are large in real repos, lower \`MCP_DEFAULT_SEARCH_RESULTS\` and \`MCP_TREE_DEPTH\`

## Reminder

Actual client token savings are **not proven** by this deep test alone. They require MCP-disabled vs MCP-enabled comparison in your MCP client.
`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, markdown, "utf8");
  console.log(`Deep test report written to ${REPORT_PATH}`);
}

main();
