import { reportCli } from "./suite.js";

reportCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

