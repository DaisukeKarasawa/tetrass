import { describe, expect, it } from "vitest";

import { buildSampleContributionDays, contributionDaysToTargetBoard } from "../io/contributions.js";
import { planDeterministicReplay } from "../planner/deterministicPlanner.js";
import { buildAnimatedSvg, PALETTE_LIGHT } from "../renderer/svgRenderer.js";
import { simulateReplayForFrames } from "../simulator/simulateReplay.js";
import {
  assertSvgFinalBoardMatchesTarget,
  summarizeSvgReplay,
} from "./svgFinalStateMatcher.js";

describe("svgFinalStateMatcher", () => {
  it("extracts replay summary and validates final frame board", () => {
    const target = contributionDaysToTargetBoard(buildSampleContributionDays());
    const { script, grassTarget } = planDeterministicReplay(target);
    const { frames } = simulateReplayForFrames(script);
    const svg = buildAnimatedSvg(frames, PALETTE_LIGHT);

    const summary = summarizeSvgReplay(svg);
    expect(summary.frames.length).toBeGreaterThan(0);
    expect(summary.hadSingleCellActiveFrame).toBe(true);
    expect(summary.hadMultiCellActiveFrame).toBe(true);
    assertSvgFinalBoardMatchesTarget(svg, grassTarget);
  });
});
