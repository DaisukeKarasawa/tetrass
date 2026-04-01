import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runTetrassGenerate, parseOutputLines } from "./generateRunner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function generateCli(): Promise<void> {
  const useSample =
    process.env.TETRASS_USE_SAMPLE === "1" || process.env.TETRASS_OFFLINE === "1";

  const login =
    process.env.GITHUB_LOGIN?.trim() ||
    process.env.GITHUB_REPOSITORY_OWNER?.trim() ||
    process.env.INPUT_GITHUB_USER_NAME?.trim();

  if (!login && !useSample) {
    throw new Error(
      "Set GITHUB_LOGIN or GITHUB_REPOSITORY_OWNER, or TETRASS_USE_SAMPLE=1 for offline mode.",
    );
  }

  const token = process.env.GITHUB_TOKEN?.trim() || undefined;

  const outputsEnv = process.env.TETRASS_OUTPUTS?.trim();
  const outputs = outputsEnv
    ? parseOutputLines(outputsEnv, ROOT)
    : [
        { filePath: join(ROOT, "img", "tetrass.svg"), palette: "light" as const },
        { filePath: join(ROOT, "img", "tetrass-dark.svg"), palette: "dark" as const },
      ];

  await runTetrassGenerate({
    login: login ?? "sample",
    token,
    outputs,
    useSample,
    workspaceRoot: ROOT,
  });
}

const cmd = process.argv[2];
if (cmd === "generate") {
  generateCli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.error("Usage: node dist/main.js generate");
  process.exit(1);
}
