import { realCheckCli } from "./suite.js";

realCheckCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

