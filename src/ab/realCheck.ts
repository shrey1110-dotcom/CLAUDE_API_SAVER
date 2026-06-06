import { assessRealCheck } from "./assessRealCheck.js";
import { readCurrentPlan, readPlanResults } from "./paths.js";

export type { RealCheckStatus } from "./assessRealCheck.js";
export { assessRealCheck } from "./assessRealCheck.js";

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:create first.");
    process.exit(1);
  }

  const results = readPlanResults(plan.id);
  const assessment = assessRealCheck(plan, results);

  for (const line of assessment.logs) {
    console.log(line);
  }
  console.log(`ab_real_check_status=${assessment.status}`);
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
