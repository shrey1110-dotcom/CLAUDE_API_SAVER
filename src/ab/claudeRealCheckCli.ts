import { assessRealCheck } from "./assessRealCheck.js";
import { ingestClaudeRunsForPlan } from "./ingestClaudeRuns.js";
import { readCurrentPlan, readPlanResults } from "./paths.js";

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:claude:plan first.");
    process.exit(1);
  }

  if (plan.client !== "claude_code" && plan.client !== "claude_desktop") {
    console.error(`Current plan client is ${plan.client}. Run npm run ab:claude:plan for Claude proof.`);
    process.exit(1);
  }

  ingestClaudeRunsForPlan(plan);
  const results = readPlanResults(plan.id);
  const assessment = assessRealCheck(plan, results);

  for (const line of assessment.logs) {
    console.log(line);
  }
  console.log(`ab_claude_real_check_status=${assessment.status}`);
  if (assessment.reasons.length > 0) {
    console.log("reasons:");
    for (const reason of assessment.reasons) {
      console.log(`- ${reason}`);
    }
  }

  if (assessment.status !== "PROVEN_SAVINGS" && assessment.status !== "PROVEN_SAVINGS_STABLE") {
    process.exit(1);
  }
}

main();
