import { ingestCli } from "./suite.js";

ingestCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

