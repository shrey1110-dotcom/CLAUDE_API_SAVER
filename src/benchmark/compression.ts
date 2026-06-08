import { runCompressionBenchmark, writeCompressionReport } from "./compressionReport.js";

function main(): void {
  const root = process.cwd();
  const report = runCompressionBenchmark(root);
  const { markdownPath, jsonPath } = writeCompressionReport(report);

  console.log("Diagnostic compression benchmark complete");
  console.log(`Full raw repo token estimate: ${report.fullRawRepoTokens.toLocaleString()}`);
  console.log(`Included files: ${report.includedFileCount.toLocaleString()}`);
  console.log(`Budget: ${report.budgetTokens} tokens per context_pack`);
  console.log("");
  for (const task of report.tasks) {
    console.log(
      `${task.taskName}: context_pack=${task.contextPackTokens} full_repo=${task.fullRepoCompressionRatio ?? "n/a"}× relevant_files=${task.relevantFilesCompressionRatio ?? "n/a"}× complete=${task.taskComplete ? "yes" : "no"}`,
    );
  }
  console.log("");
  console.log(report.warning);
  console.log(`Markdown: ${markdownPath}`);
  console.log(`JSON: ${jsonPath}`);
}

main();
