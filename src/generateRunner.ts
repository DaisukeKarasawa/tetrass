import { constants as fsConstants, existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  contributionCalendarToLevelBoard,
  fetchOrBuildContributionCalendar,
} from "./io/contributions.js";
import { buildGrassDropSvg, PALETTE_DARK, PALETTE_LIGHT, type GrassPalette } from "./renderer/svgRenderer.js";
import { buildDropSchedule, splitBoardIntoColumnGroups } from "./grass/groupDropPlanner.js";

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

function paletteFor(kind: OutputPalette): GrassPalette {
  return kind === "dark" ? PALETTE_DARK : PALETTE_LIGHT;
}

type FetchContributionOpts = Pick<
  GenerateOptions,
  "login" | "token" | "useSample" | "allowUnauthenticatedFallback"
>;

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

export async function renderAndWriteGrassOutputs(opts: {
  svgByPalette: Map<OutputPalette, string>;
  outputs: OutputTarget[];
  workspaceRootCanonical: string | null;
}): Promise<void> {
  const { svgByPalette, outputs, workspaceRootCanonical } = opts;

  for (const out of outputs) {
    let filePath = out.filePath;
    if (workspaceRootCanonical) {
      assertPathInsideRoot(filePath, workspaceRootCanonical, { requireProperDescendant: true });
    }
    const svg = svgByPalette.get(out.palette);
    if (!svg) {
      throw new Error(`Missing SVG for palette '${out.palette}'`);
    }
    const dir = dirname(filePath);
    let writeTarget = filePath;
    if (workspaceRootCanonical) {
      const dirParts = relative(workspaceRootCanonical, resolve(dir)).split(sep).filter((p) => p.length > 0);
      let validatedDir = workspaceRootCanonical;
      for (const part of dirParts) {
        const next = join(validatedDir, part);
        if (existsSync(next)) {
          validatedDir = realpathSync(next);
          assertPathInsideRoot(validatedDir, workspaceRootCanonical);
        } else {
          await mkdir(next, { recursive: true });
          validatedDir = realpathSync(next);
          assertPathInsideRoot(validatedDir, workspaceRootCanonical);
        }
      }
      writeTarget = resolve(validatedDir, basename(filePath));
      assertPathInsideRoot(writeTarget, workspaceRootCanonical);
      await writeUtf8FileRejectSymlinkTarget(writeTarget, svg);
    } else {
      await mkdir(dir, { recursive: true });
      await writeFile(writeTarget, svg, "utf8");
    }
  }

  console.log(`Wrote ${outputs.length} SVG file(s) (group-drop animation).`);
}

/**
 * Fetch contributions, build group-drop SVGs, write one file per output target.
 */
export async function runTetrassGenerate(opts: GenerateOptions): Promise<void> {
  const { login, token, outputs, useSample, workspaceRoot, allowUnauthenticatedFallback } = opts;
  if (outputs.length === 0) throw new Error("At least one output path is required.");

  const cal = await fetchOrBuildContributionCalendar({
    login,
    token,
    useSample,
    allowUnauthenticatedFallback,
  });
  const { board, meta } = contributionCalendarToLevelBoard(cal);
  const groups = splitBoardIntoColumnGroups(board, meta);
  const schedule = buildDropSchedule(groups);

  const { workspaceRootResolved, workspaceRootCanonical } = resolveWorkspaceRoots(workspaceRoot);
  const outputsForRender =
    workspaceRootResolved != null
      ? outputs.map((o) => ({
          ...o,
          filePath: canonicalizeOutputPathUnderWorkspace(resolve(o.filePath), workspaceRootResolved),
        }))
      : outputs;
  const seenOutputPaths = new Set<string>();
  for (const { filePath } of outputsForRender) {
    if (seenOutputPaths.has(filePath)) {
      throw new Error(`Duplicate output path resolved to '${filePath}'.`);
    }
    seenOutputPaths.add(filePath);
  }

  const neededPalettes = new Set(outputsForRender.map((o) => o.palette));
  const svgByPalette = new Map<OutputPalette, string>();
  if (neededPalettes.has("light")) {
    svgByPalette.set("light", buildGrassDropSvg(schedule, paletteFor("light")));
  }
  if (neededPalettes.has("dark")) {
    svgByPalette.set("dark", buildGrassDropSvg(schedule, paletteFor("dark")));
  }

  await renderAndWriteGrassOutputs({
    svgByPalette,
    outputs: outputsForRender,
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
        console.warn(`Unrecognized palette '${pal}' for output '${filePart}'; defaulting to light.`);
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
