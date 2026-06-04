import { AUTH_DISCOVERY_EXPECTED_FILES } from "../ab/authDiscoveryQuality.js";

const TASK =
  "Find where authentication, login, or user session logic is implemented";

const TEST_A_PROMPT = `Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.`;

const TEST_B_PROMPT = `Use the provided context pack. Do not ask to scan the repo unless the context pack says full file verification is needed.

Task:
Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.`;

function main(): void {
  console.log("File-context A/B test — universal (no MCP)\n");
  console.log("Guide: docs/file-context-ab-test.md");
  console.log("Template: docs/ab-test-templates/file-context-template.md\n");

  console.log("=== 1. Generate context pack ===\n");
  console.log("npm run build");
  console.log("npm run graph:build");
  console.log("npm run context:build");
  console.log(
    `npm run context:pack -- --task "${TASK}" --budget 1000 --format markdown --out .context-packs/auth-discovery.md`,
  );

  console.log("\n=== 2. Test A — no context pack ===\n");
  console.log(TEST_A_PROMPT);

  console.log("\n=== 3. Test B — attach .context-packs/auth-discovery.md ===\n");
  console.log(TEST_B_PROMPT);

  console.log("\n=== 4. Expected files (score /5) ===\n");
  for (const file of AUTH_DISCOVERY_EXPECTED_FILES) {
    console.log(`- ${file}`);
  }

  console.log("\n=== 5. Scoring table ===\n");
  console.log("| Metric              | Test A (no pack) | Test B (with pack) |");
  console.log("| ------------------- | ---------------- | ------------------ |");
  console.log("| Client / model      |                  |                    |");
  console.log("| Expected files / 5  |                  |                    |");
  console.log("| Quality (1–10)      |                  |                    |");
  console.log("| Tokens / cost       |                  |                    |");
  console.log("| Time / effort       |                  |                    |");
  console.log("| Notes               |                  |                    |");
  console.log("\nVerdict: quality win (B) | token win (B) | incomplete | no win");
  console.log("\nToken win requires usage data from both runs. Quality win does not.");

  console.log("\n=== 6. Record and compare ===\n");
  console.log("npm run ab:file-context:create -- --client chatgpt --model <model> --repo .");
  console.log("npm run ab:file-context:record -- --mode no_context --quality <1-10> --expected-files-found <0-5>");
  console.log("npm run ab:file-context:record -- --mode file_context_pack --quality <1-10> --expected-files-found <0-5>");
  console.log("npm run ab:file-context:compare");
  console.log("npm run ab:file-context:report");
  console.log("\nReport: .mcp-ab-tests/reports/file-context-ab-report.md");
}

main();
