import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyzeSelfIteration } from "./analyze.js";
import { recommendFromAnalysis, writeRecommendations } from "./recommend.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function main(): void {
  const analysis = analyzeSelfIteration(ROOT);
  console.log(`Self-iteration findings: ${analysis.findings.length}`);
  for (const finding of analysis.findings) {
    console.log(`- [${finding.severity}] ${finding.category}: ${finding.message}`);
  }
  const recommendations = recommendFromAnalysis(analysis);
  writeRecommendations(analysis, recommendations, ROOT);
}

main();
