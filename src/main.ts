import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runTetrassGenerate } from "./generateRunner.js";
import { resolveGenerateOptions } from "./resolveGenerateOptions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function generateCli(): Promise<void> {
  const opts = resolveGenerateOptions(process.env, { context: "cli", repoRoot: ROOT });
  await runTetrassGenerate(opts);
}

const cmd = process.argv[2];
const cliVerbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");

if (cmd === "generate") {
  generateCli().catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    if (cliVerbose && e instanceof Error && e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  });
} else {
  console.error("Usage: node dist/main.js generate [--verbose|-v]");
  process.exit(1);
}
