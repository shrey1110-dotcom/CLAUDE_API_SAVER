import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyzeSelfIteration } from "./analyze.js";
import { recommendFromAnalysis, writeRecommendations } from "./recommend.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function main(): void {
  const analysis = analyzeSelfIteration(ROOT);
  const recommendations = recommendFromAnalysis(analysis);
  const { mdPath, jsonPath } = writeRecommendations(analysis, recommendations, ROOT);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Recommendations: ${recommendations.length}`);
}

main();
