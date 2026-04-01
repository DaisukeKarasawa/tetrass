import { runTetrassGenerate } from "./generateRunner.js";
import { resolveGenerateOptions } from "./resolveGenerateOptions.js";

/** Same workflow annotation as `@actions/core` setFailed, without bundling the toolkit (~800KiB). */
function setFailedForGitHubActions(message: string): void {
  process.exitCode = 1;
  const escaped = message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  process.stdout.write(`::error::${escaped}\n`);
}

async function main(): Promise<void> {
  const opts = resolveGenerateOptions(process.env, { context: "github-action" });
  await runTetrassGenerate(opts);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : "Unknown error";
  setFailedForGitHubActions(message);
});
