import fs from "node:fs";
import path from "node:path";
import { getTelemetryLogFile, getTelemetryReportFile, TELEMETRY_DIR, TELEMETRY_LOG_FILE, TELEMETRY_REPORT_FILE } from "../telemetry/types.js";

const logPath = path.resolve(getTelemetryLogFile());
const dirPath = path.resolve(TELEMETRY_DIR);
const reportPath = path.resolve(getTelemetryReportFile());

if (fs.existsSync(logPath)) {
  fs.unlinkSync(logPath);
  console.log(`Removed ${logPath}`);
} else {
  console.log(`No telemetry log at ${logPath}`);
}

if (fs.existsSync(reportPath)) {
  fs.unlinkSync(reportPath);
  console.log(`Removed ${reportPath}`);
}

// Best-effort cleanup of default files when override paths are used.
for (const fallback of [path.resolve(TELEMETRY_LOG_FILE), path.resolve(TELEMETRY_REPORT_FILE)]) {
  if (fallback !== logPath && fallback !== reportPath && fs.existsSync(fallback)) {
    fs.unlinkSync(fallback);
    console.log(`Removed ${fallback}`);
  }
}

fs.mkdirSync(dirPath, { recursive: true });
console.log("Telemetry ready for a fresh MCP-enabled session.");
