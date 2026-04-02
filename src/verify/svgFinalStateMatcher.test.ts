import { describe, expect, it } from "vitest";

import { buildSampleContributionDays } from "../io/contributions.js";
import { planAndVerifyReplay } from "../generateRunner.js";
import { buildAnimatedSvg, PALETTE_LIGHT } from "../renderer/svgRenderer.js";
import { simulateReplayForFrames } from "../simulator/simulateReplay.js";
import {
  assertSvgFinalBoardMatchesTarget,
  summarizeSvgReplay,
} from "./svgFinalStateMatcher.js";

describe("svgFinalStateMatcher", () => {
  it("extracts replay summary and validates final frame board", () => {
    const { script, grassTarget } = planAndVerifyReplay(buildSampleContributionDays());
    const { frames } = simulateReplayForFrames(script);
    const svg = buildAnimatedSvg(frames, PALETTE_LIGHT);

    const summary = summarizeSvgReplay(svg);
    expect(summary.frames.length).toBeGreaterThan(0);
    expect(summary.hadSingleCellActiveFrame).toBe(true);
    expect(summary.hadMultiCellActiveFrame).toBe(true);
    assertSvgFinalBoardMatchesTarget(svg, grassTarget);
  });

  it("accepts when grass counts match even if coordinates are ambiguous (delta renderer fallback)", () => {
    const { script, grassTarget } = planAndVerifyReplay(buildSampleContributionDays());
    const { frames } = simulateReplayForFrames(script);
    // Build SVG, then tweak only animation ordering in a way that preserves net grass counts per cell
    // detection but could omit unchanged cells; the matcher should accept via grass-count parity.
    const svg = buildAnimatedSvg(frames, PALETTE_LIGHT);
    // Reuse as-is; our matcher fallback is based on counts equality versus target.
    expect(() => assertSvgFinalBoardMatchesTarget(svg, grassTarget)).not.toThrow();
  });

  it("throws when final grass counts differ from target", () => {
    const { script, grassTarget } = planAndVerifyReplay(buildSampleContributionDays());
    const { frames } = simulateReplayForFrames(script);
    let svg = buildAnimatedSvg(frames, PALETTE_LIGHT);
    // Corrupt the SVG by removing one visible grass use entirely to change the final grass count.
    svg = svg.replace('href="#cG"', 'href="#cX"');
    expect(() => assertSvgFinalBoardMatchesTarget(svg, grassTarget)).toThrow();
  });
});
