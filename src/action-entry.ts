import { runTetrassGenerate, parseOutputLines } from "./generateRunner.js";

async function main(): Promise<void> {
  const login = process.env.INPUT_GITHUB_USER_NAME?.trim();
  const outputsRaw = process.env.INPUT_OUTPUTS ?? "";
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;

  if (!login) {
    throw new Error("INPUT_GITHUB_USER_NAME is required.");
  }

  const outputs = parseOutputLines(outputsRaw, workspace);
  if (outputs.length === 0) {
    throw new Error("INPUT_OUTPUTS must list at least one output path.");
  }

  await runTetrassGenerate({
    login,
    token,
    outputs,
    useSample: process.env.TETRASS_USE_SAMPLE === "1" || process.env.TETRASS_OFFLINE === "1",
    workspaceRoot: workspace,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
