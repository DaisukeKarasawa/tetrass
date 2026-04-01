import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSampleContributionDays,
  contributionDaysToTargetBoard,
  fetchContributionCalendar,
  flattenContributionDays,
} from "./io/contributions.js";
import { planDeterministicReplay } from "./planner/deterministicPlanner.js";
import { buildAnimatedSvg, PALETTE_DARK, PALETTE_LIGHT } from "./renderer/svgRenderer.js";
import { simulateReplayForFrames, simulateReplayFast } from "./simulator/simulateReplay.js";
import { assertFinalMatchesTarget } from "./verify/finalBoardMatcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function generate(): Promise<void> {
  const useSample =
    process.env.TETRASS_USE_SAMPLE === "1" || process.env.TETRASS_OFFLINE === "1";

  let days;
  if (useSample) {
    days = buildSampleContributionDays();
    console.warn("Using deterministic sample contributions (TETRASS_USE_SAMPLE or TETRASS_OFFLINE).");
  } else {
    const login = process.env.GITHUB_LOGIN ?? process.env.GITHUB_REPOSITORY_OWNER;
    if (!login) {
      throw new Error(
        "Set GITHUB_LOGIN or GITHUB_REPOSITORY_OWNER, or TETRASS_USE_SAMPLE=1 for offline mode.",
      );
    }
    const token = process.env.GITHUB_TOKEN;
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
  const imgDir = join(ROOT, "img");
  await mkdir(imgDir, { recursive: true });

  const lightSvg = buildAnimatedSvg(frames, PALETTE_LIGHT);
  const darkSvg = buildAnimatedSvg(frames, PALETTE_DARK);
  await writeFile(join(imgDir, "tetrass.svg"), lightSvg, "utf8");
  await writeFile(join(imgDir, "tetrass-dark.svg"), darkSvg, "utf8");

  console.log(
    `Wrote img/tetrass.svg and img/tetrass-dark.svg (${frames.length} frames, ${script.steps.length} locks, ${fast.totalLineClears} line clears).`,
  );
}

const cmd = process.argv[2];
if (cmd === "generate") {
  generate().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.error("Usage: node dist/main.js generate");
  process.exit(1);
}
