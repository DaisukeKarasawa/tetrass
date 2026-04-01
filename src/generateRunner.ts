import { constants as fsConstants, existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Board, ReplayScript } from "./domain/types.js";
import {
  buildSampleContributionDays,
  contributionDaysToTargetBoard,
  fetchContributionCalendar,
  flattenContributionDays,
  type ContributionDay,
} from "./io/contributions.js";
import { planDeterministicReplay } from "./planner/deterministicPlanner.js";
import { buildAnimatedSvg, PALETTE_DARK, PALETTE_LIGHT } from "./renderer/svgRenderer.js";
import type { SvgPalette } from "./renderer/svgRenderer.js";
import {
  simulateReplayForFrames,
  simulateReplayFast,
  type SimulationResult,
} from "./simulator/simulateReplay.js";
import { assertFinalMatchesTarget } from "./verify/finalBoardMatcher.js";

export type OutputPalette = "light" | "dark";

export interface OutputTarget {
  /** Absolute path to write SVG. */
  filePath: string;
  palette: OutputPalette;
}

export interface GenerateOptions {
  login: string;
  token?: string;
  outputs: OutputTarget[];
  /** Force sample data (no API). */
  useSample?: boolean;
  /**
   * CLI opt-in: when true and no token, use deterministic sample data if the GitHub fetch fails.
   * The composite action must not set this; use `useSample` or pass `GITHUB_TOKEN` instead.
   */
  allowUnauthenticatedFallback?: boolean;
  /** Restrict outputs to this workspace root when set. */
  workspaceRoot?: string;
}

function paletteFor(kind: OutputPalette): SvgPalette {
  return kind === "dark" ? PALETTE_DARK : PALETTE_LIGHT;
}

type FetchContributionOpts = Pick<
  GenerateOptions,
  "login" | "token" | "useSample" | "allowUnauthenticatedFallback"
>;

/**
 * Load contribution calendar days: GitHub API, or deterministic sample (offline / fallback).
 */
export async function fetchOrBuildContributionDays(opts: FetchContributionOpts): Promise<ContributionDay[]> {
  const { login, token, useSample, allowUnauthenticatedFallback = false } = opts;
  if (useSample) {
    console.warn("Using deterministic sample contributions (offline/sample mode).");
    return buildSampleContributionDays();
  }
  try {
    const cal = await fetchContributionCalendar(login, token);
    return flattenContributionDays(cal);
  } catch (e) {
    if (!token) {
      if (allowUnauthenticatedFallback) {
        console.warn(
          "GitHub fetch failed without token; falling back to sample contributions (TETRASS_ALLOW_UNAUTH_FALLBACK=1).",
        );
        return buildSampleContributionDays();
      }
      throw new Error(
        "GitHub fetch failed with no GITHUB_TOKEN. Set GITHUB_TOKEN for real contribution data, use TETRASS_USE_SAMPLE=1 (or TETRASS_OFFLINE=1) for offline sample mode, or set TETRASS_ALLOW_UNAUTH_FALLBACK=1 for CLI-only opt-in when an unauthenticated fetch fails.",
      );
    }
    throw new Error(`GitHub API request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface PlannedVerifiedReplay {
  script: ReplayScript;
  grassTarget: Board;
  fast: SimulationResult;
}

/** Map days → grass mask, plan replay, fast-simulate, and run acceptance checks. */
export function planAndVerifyReplay(days: ContributionDay[]): PlannedVerifiedReplay {
  const target = contributionDaysToTargetBoard(days);
  const { script, grassTarget } = planDeterministicReplay(target);
  const fast = simulateReplayFast(script);
  assertFinalMatchesTarget(fast.finalBoard, grassTarget);
  if (fast.totalLineClears < 1) {
    throw new Error("Acceptance failed: no line clears in replay.");
  }
  if (fast.usedTypes.size < 4) {
    throw new Error(`Acceptance failed: need >=4 piece types, got ${fast.usedTypes.size}`);
  }
  return { script, grassTarget, fast };
}

function resolveWorkspaceRoots(workspaceRoot: string | undefined): {
  workspaceRootResolved: string | null;
  workspaceRootCanonical: string | null;
} {
  const workspaceRootResolved = workspaceRoot ? resolve(workspaceRoot) : null;
  let workspaceRootCanonical: string | null = null;
  if (workspaceRootResolved) {
    try {
      workspaceRootCanonical = realpathSync(workspaceRootResolved);
    } catch {
      workspaceRootCanonical = workspaceRootResolved;
    }
  }
  return { workspaceRootResolved, workspaceRootCanonical };
}

export interface RenderAndWriteOpts {
  script: ReplayScript;
  fast: SimulationResult;
  outputs: OutputTarget[];
  workspaceRootResolved: string | null;
  workspaceRootCanonical: string | null;
}

/** Expand frames, render SVG per palette (cached), write each output path. */
export async function renderAndWriteReplayOutputs(opts: RenderAndWriteOpts): Promise<void> {
  const { script, fast, outputs, workspaceRootCanonical } = opts;
  const { frames } = simulateReplayForFrames(script);
  const svgByPalette = new Map<OutputPalette, string>();

  for (const out of outputs) {
    let filePath = out.filePath;
    if (workspaceRootCanonical) {
      assertPathInsideRoot(filePath, workspaceRootCanonical, { requireProperDescendant: true });
    }
    let svg = svgByPalette.get(out.palette);
    if (!svg) {
      svg = buildAnimatedSvg(frames, paletteFor(out.palette));
      svgByPalette.set(out.palette, svg);
    }
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    let writeTarget = filePath;
    if (workspaceRootCanonical) {
      const realDir = realpathSync(dir);
      assertPathInsideRoot(realDir, workspaceRootCanonical);
      writeTarget = resolve(realDir, basename(filePath));
      assertPathInsideRoot(writeTarget, workspaceRootCanonical);
      await writeUtf8FileRejectSymlinkTarget(writeTarget, svg);
    } else {
      await writeFile(writeTarget, svg, "utf8");
    }
  }

  console.log(
    `Wrote ${outputs.length} file(s) (${frames.length} frames, ${script.steps.length} locks, ${fast.totalLineClears} line clears).`,
  );
}

/**
 * Fetch contributions, plan deterministic replay, verify, write one SVG per output target.
 */
export async function runTetrassGenerate(opts: GenerateOptions): Promise<void> {
  const { login, token, outputs, useSample, workspaceRoot, allowUnauthenticatedFallback } = opts;
  if (outputs.length === 0) throw new Error("At least one output path is required.");

  const days = await fetchOrBuildContributionDays({
    login,
    token,
    useSample,
    allowUnauthenticatedFallback,
  });
  const { script, fast } = planAndVerifyReplay(days);
  const { workspaceRootResolved, workspaceRootCanonical } = resolveWorkspaceRoots(workspaceRoot);
  const outputsForRender =
    workspaceRootResolved != null
      ? outputs.map((o) => ({
          ...o,
          filePath: canonicalizeOutputPathUnderWorkspace(resolve(o.filePath), workspaceRootResolved),
        }))
      : outputs;
  await renderAndWriteReplayOutputs({
    script,
    fast,
    outputs: outputsForRender,
    workspaceRootResolved,
    workspaceRootCanonical,
  });
}

/** Resolve a path from the GitHub Actions `outputs` multiline string (snk-style). */
export function parseOutputLines(raw: string, workspaceRoot: string): OutputTarget[] {
  const normalizedRoot = resolve(workspaceRoot);
  const lines = raw.split(/\r?\n/);
  const result: OutputTarget[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let filePart = trimmed;
    let palette: OutputPalette = "light";
    const q = trimmed.indexOf("?");
    if (q >= 0) {
      filePart = trimmed.slice(0, q).trim();
      const query = trimmed.slice(q + 1);
      const params = new URLSearchParams(query);
      const pal = params.get("palette");
      if (pal === "github-dark" || pal === "dark") palette = "dark";
      else if (pal && pal !== "light") {
        console.warn(
          `Unrecognized palette '${pal}' for output '${filePart}'; defaulting to light.`,
        );
      }
    }

    if (!filePart) {
      throw new Error(`Invalid output path: '${trimmed}'`);
    }
    const abs = resolve(workspaceRoot, filePart);
    const filePath = canonicalizeOutputPathUnderWorkspace(abs, normalizedRoot);
    result.push({ filePath, palette });
  }
  return result;
}

function assertPathInsideRoot(
  filePath: string,
  root: string,
  opts?: { requireProperDescendant?: boolean },
): void {
  const resolvedPath = resolve(filePath);
  const resolvedRoot = resolve(root);
  const rel = relative(resolvedRoot, resolvedPath);
  if (isAbsolute(rel)) {
    throw new Error(`Output path '${filePath}' is outside workspace root '${root}'.`);
  }
  if (opts?.requireProperDescendant && (rel === "" || rel === ".")) {
    throw new Error(`Output path '${filePath}' must be a file under workspace root '${root}'.`);
  }
  if (rel === "") return;
  if (rel.startsWith("..") || rel.includes(`${sep}..${sep}`) || rel === "..") {
    throw new Error(`Output path '${filePath}' is outside workspace root '${root}'.`);
  }
}

function canonicalWorkspaceRootDir(workspaceResolved: string): string {
  try {
    return realpathSync(workspaceResolved);
  } catch {
    return workspaceResolved;
  }
}

/**
 * Resolve symlinks on existing path prefixes so a lexically in-repo path cannot escape via e.g. `img -> /tmp`.
 * Tail segments that do not exist yet are appended under the last resolved directory.
 */
function canonicalizeOutputPathUnderWorkspace(lexicalAbs: string, workspaceResolved: string): string {
  const rootCanon = canonicalWorkspaceRootDir(workspaceResolved);
  assertPathInsideRoot(lexicalAbs, workspaceResolved, { requireProperDescendant: true });
  const rel = relative(workspaceResolved, lexicalAbs);
  const parts = rel.split(sep).filter((p) => p.length > 0);
  let cur = rootCanon;
  for (let i = 0; i < parts.length; i++) {
    const step = join(cur, parts[i]);
    if (existsSync(step)) {
      cur = realpathSync(step);
      assertPathInsideRoot(cur, rootCanon);
    } else {
      cur = join(cur, ...parts.slice(i));
      break;
    }
  }
  assertPathInsideRoot(cur, rootCanon);
  return cur;
}

function isErrnoCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as NodeJS.ErrnoException).code === code;
}

/**
 * Write UTF-8 text without following a symlink at the final path component (Unix: O_NOFOLLOW).
 * Mitigates escape via pre-existing symlink at the output path after directory checks.
 */
async function writeUtf8FileRejectSymlinkTarget(filePath: string, data: string): Promise<void> {
  if (fsConstants.O_NOFOLLOW === undefined) {
    try {
      const st = await lstat(filePath);
      if (st.isSymbolicLink()) {
        throw new Error(`Refusing to write through symbolic link: '${filePath}'`);
      }
    } catch (e) {
      if (!isErrnoCode(e, "ENOENT")) throw e;
    }
    await writeFile(filePath, data, "utf8");
    return;
  }

  const flags =
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(filePath, flags, 0o644);
  } catch (e) {
    if (isErrnoCode(e, "ELOOP")) {
      throw new Error(`Refusing to open symbolic link as output: '${filePath}'`);
    }
    throw e;
  }
  try {
    await handle.writeFile(data, "utf8");
  } finally {
    await handle.close();
  }
}
