import { runCompressionBenchmark, writeCompressionReport } from "../benchmark/compressionReport.js";

function main(): void {
  const report = runCompressionBenchmark(process.cwd());
  const { markdownPath } = writeCompressionReport(report);

  console.log("Context quality report (diagnostic compression)");
  console.log(`Full raw repo tokens: ${report.fullRawRepoTokens.toLocaleString()}`);
  console.log("");
  console.log("| Task | Pack tokens | Files | Concepts | Budget | Complete |");
  console.log("| --- | ---: | --- | ---: | --- | --- |");
  for (const task of report.tasks) {
    const fileCoverage = `${task.matchedFiles.length}/${task.matchedFiles.length + task.missingFiles.length}`;
    const conceptCoverage = `${task.matchedConcepts.length}/${task.matchedConcepts.length + task.missingConcepts.length}`;
    console.log(
      `| ${task.taskName} | ${task.contextPackTokens} | ${fileCoverage} | ${conceptCoverage} | ${task.outputBudgetPass ? "pass" : "fail"} | ${task.taskComplete ? "yes" : "no"} |`,
    );
  }
  console.log("");
  console.log(report.warning);
  console.log(`Report: ${markdownPath}`);
}

main();
