import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildSampleContributionDays,
  contributionDaysToTargetBoard,
  fetchContributionCalendar,
  flattenContributionDays,
} from "./io/contributions.js";
import { planDeterministicReplay } from "./planner/deterministicPlanner.js";
import { buildAnimatedSvg, PALETTE_DARK, PALETTE_LIGHT } from "./renderer/svgRenderer.js";
import type { SvgPalette } from "./renderer/svgRenderer.js";
import { simulateReplayForFrames, simulateReplayFast } from "./simulator/simulateReplay.js";
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
}

function paletteFor(kind: OutputPalette): SvgPalette {
  return kind === "dark" ? PALETTE_DARK : PALETTE_LIGHT;
}

/**
 * Fetch contributions, plan deterministic replay, verify, write one SVG per output target.
 */
export async function runTetrassGenerate(opts: GenerateOptions): Promise<void> {
  const { login, token, outputs, useSample } = opts;
  if (outputs.length === 0) throw new Error("At least one output path is required.");

  let days;
  if (useSample) {
    days = buildSampleContributionDays();
    console.warn("Using deterministic sample contributions (offline/sample mode).");
  } else {
    try {
      const cal = await fetchContributionCalendar(login, token);
      days = flattenContributionDays(cal);
    } catch (e) {
      if (!token) {
        console.warn("GitHub fetch failed without token; falling back to sample contributions.", e);
        days = buildSampleContributionDays();
      } else {
        throw e;
      }
    }
  }

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

  const { frames } = simulateReplayForFrames(script);

  const needLight = outputs.some((o) => o.palette === "light");
  const needDark = outputs.some((o) => o.palette === "dark");
  const lightSvg = needLight ? buildAnimatedSvg(frames, paletteFor("light")) : null;
  const darkSvg = needDark ? buildAnimatedSvg(frames, paletteFor("dark")) : null;

  for (const out of outputs) {
    const svg = out.palette === "dark" ? darkSvg! : lightSvg!;
    const dir = dirname(out.filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(out.filePath, svg, "utf8");
  }

  console.log(
    `Wrote ${outputs.length} file(s) (${frames.length} frames, ${script.steps.length} locks, ${fast.totalLineClears} line clears).`,
  );
}

/** Resolve a path from the GitHub Actions `outputs` multiline string (snk-style). */
export function parseOutputLines(raw: string, workspaceRoot: string): OutputTarget[] {
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
    }

    const abs = resolve(workspaceRoot, filePart);
    result.push({ filePath: abs, palette });
  }
  return result;
}
