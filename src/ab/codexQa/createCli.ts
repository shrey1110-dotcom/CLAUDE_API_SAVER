import { createCli } from "./suite.js";

createCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

