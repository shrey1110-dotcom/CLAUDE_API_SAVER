import fs from "node:fs";
import path from "node:path";
import { TELEMETRY_DIR, TELEMETRY_LOG_FILE } from "../telemetry/types.js";

const logPath = path.resolve(TELEMETRY_LOG_FILE);
const dirPath = path.resolve(TELEMETRY_DIR);

if (fs.existsSync(logPath)) {
  fs.unlinkSync(logPath);
  console.log(`Removed ${logPath}`);
} else {
  console.log(`No telemetry log at ${logPath}`);
}

fs.mkdirSync(dirPath, { recursive: true });
console.log("Telemetry ready for a fresh MCP-enabled session.");
