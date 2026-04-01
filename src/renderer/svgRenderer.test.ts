import { describe, expect, it } from "vitest";

import { planScriptedDoubleClearIntro } from "../planner/introClear.js";
import { simulateReplayForFrames } from "../simulator/simulateReplay.js";
import { buildAnimatedSvg, PALETTE_LIGHT } from "./svgRenderer.js";

describe("buildAnimatedSvg", () => {
  it("throws when there are no frames", () => {
    expect(() => buildAnimatedSvg([], PALETTE_LIGHT)).toThrow(/No frames to render/);
  });

  it("returns a root svg with expected dimensions and animation structure", () => {
    const { frames } = simulateReplayForFrames({ steps: planScriptedDoubleClearIntro() });
    const svg = buildAnimatedSvg(frames, PALETTE_LIGHT);
    expect(svg).toMatch(/^<\?xml version="1.0"/);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="184"');
    expect(svg).toContain('height="364"');
    expect(svg).toContain('viewBox="0 0 184 364"');
    expect(svg).toContain("<defs>");
    expect(svg).toContain('id="cE"');
    expect(svg).toContain('id="cG"');
    expect(svg).toContain('id="cH"');
    expect(svg).toContain("<animate");
    expect(svg).toContain("repeatCount=\"indefinite\"");
  });
});
