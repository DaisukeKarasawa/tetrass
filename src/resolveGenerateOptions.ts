import { join } from "node:path";

import { parseOutputLines, type GenerateOptions } from "./generateRunner.js";

/** Same rule as GitHub username / org login (defensive; CLI does not require this when using sample mode). */
const GITHUB_LOGIN_LIKE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export type ResolveGenerateOptionsArgs =
  | { context: "cli"; repoRoot: string }
  | { context: "github-action" };

/**
 * Build {@link GenerateOptions} from process-like env for CLI or GitHub Actions composite entrypoints.
 * Throws with the same messages the former inline logic used.
 */
export function resolveGenerateOptions(
  env: NodeJS.ProcessEnv,
  args: ResolveGenerateOptionsArgs,
): GenerateOptions {
  const useSample = env.TETRASS_USE_SAMPLE === "1" || env.TETRASS_OFFLINE === "1";
  const token = env.GITHUB_TOKEN?.trim() || undefined;

  if (args.context === "cli") {
    const repoRoot = args.repoRoot;
    const login =
      env.GITHUB_LOGIN?.trim() ||
      env.GITHUB_REPOSITORY_OWNER?.trim() ||
      env.INPUT_GITHUB_USER_NAME?.trim();
    if (!login && !useSample) {
      throw new Error(
        "Set GITHUB_LOGIN or GITHUB_REPOSITORY_OWNER, or TETRASS_USE_SAMPLE=1 for offline mode.",
      );
    }
    const outputsEnv = env.TETRASS_OUTPUTS?.trim();
    const outputs = outputsEnv
      ? parseOutputLines(outputsEnv, repoRoot)
      : [
          { filePath: join(repoRoot, "img", "tetrass.svg"), palette: "light" as const },
          { filePath: join(repoRoot, "img", "tetrass-dark.svg"), palette: "dark" as const },
        ];
    return {
      login: login ?? "sample",
      token,
      outputs,
      useSample,
      allowUnauthenticatedFallback: env.TETRASS_ALLOW_UNAUTH_FALLBACK === "1",
      workspaceRoot: repoRoot,
    };
  }

  const login = env.INPUT_GITHUB_USER_NAME?.trim();
  if (!login) {
    throw new Error("INPUT_GITHUB_USER_NAME is required.");
  }
  if (!GITHUB_LOGIN_LIKE.test(login)) {
    throw new Error("Invalid GitHub username format.");
  }

  const outputsRaw = env.INPUT_OUTPUTS ?? "";
  const workspace = env.GITHUB_WORKSPACE ?? process.cwd();
  const outputs = parseOutputLines(outputsRaw, workspace);
  if (outputs.length === 0) {
    throw new Error("INPUT_OUTPUTS must list at least one output path.");
  }
  if (!useSample && !token) {
    throw new Error(
      "GITHUB_TOKEN is required unless using sample/offline mode (set TETRASS_USE_SAMPLE=1 or TETRASS_OFFLINE=1).",
    );
  }

  return {
    login,
    token,
    outputs,
    useSample,
    workspaceRoot: workspace,
  };
}
