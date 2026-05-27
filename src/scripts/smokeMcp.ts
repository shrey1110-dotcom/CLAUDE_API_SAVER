import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entry = path.join(ROOT, "dist/index.js");

if (!fs.existsSync(entry)) {
  console.error("smoke:mcp FAIL — dist/index.js missing. Run npm run build.");
  process.exit(1);
}

const child = spawn(process.execPath, [entry], {
  cwd: ROOT,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, MCP_OUTPUT_MODE: "compact" },
});

let stderr = "";
let done = false;

child.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
  if (!done && /ready on stdio/i.test(stderr)) {
    done = true;
    clearTimeout(timeout);
    child.kill("SIGTERM");
  }
});

const timeout = setTimeout(() => {
  if (!done) child.kill("SIGTERM");
}, 5000);

child.on("exit", (code, signal) => {
  clearTimeout(timeout);
  const ready = /ready on stdio/i.test(stderr);
  if (ready) {
    console.log("smoke:mcp OK — server started on stdio");
    process.exit(0);
  }
  console.error(`smoke:mcp FAIL — no ready message (code=${code}, signal=${signal})`);
  if (stderr) console.error(stderr.slice(0, 500));
  process.exit(1);
});

child.on("error", (error) => {
  clearTimeout(timeout);
  console.error("smoke:mcp FAIL —", error.message);
  process.exit(1);
});
