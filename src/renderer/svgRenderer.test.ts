import { describe, expect, it } from "vitest";

import { planScriptedDoubleClearIntro } from "../planner/introClear.js";
import { simulateReplayForFrames } from "../simulator/simulateReplay.js";
import { buildAnimatedSvg, PALETTE_LIGHT, sanitizePalette, validateColor } from "./svgRenderer.js";

describe("validateColor", () => {
  it("accepts hex #rgb and #rrggbb", () => {
    expect(validateColor("#abc")).toBe("#abc");
    expect(validateColor("#aBcDeF")).toBe("#aBcDeF");
  });

  it("accepts rgb() and rgba()", () => {
    expect(validateColor("rgb(0, 128, 255)")).toBe("rgb(0, 128, 255)");
    expect(validateColor("rgba(10, 20, 30, 0.5)")).toBe("rgba(10, 20, 30, 0.5)");
    expect(validateColor("rgb(0%, 50%, 100%)")).toBe("rgb(0%, 50%, 100%)");
  });

  it("accepts whitelisted named colors", () => {
    expect(validateColor("teal")).toBe("teal");
    expect(validateColor("ReD")).toBe("red");
  });

  it("replaces dangerous or unsupported values with default", () => {
    expect(validateColor('red" onload=alert(1)')).toBe("#ebedf0");
    expect(validateColor("url(#x)")).toBe("#ebedf0");
    expect(validateColor("expression(1)")).toBe("#ebedf0");
    expect(validateColor("#gg0000")).toBe("#ebedf0");
    expect(validateColor("notacolorname")).toBe("#ebedf0");
  });
});

describe("sanitizePalette", () => {
  it("normalizes each field independently", () => {
    expect(
      sanitizePalette({
        empty: "#ebedf0",
        grass: 'bad"',
        ghost: "rgb(0, 0, 0)",
      }),
    ).toEqual({
      empty: "#ebedf0",
      grass: "#ebedf0",
      ghost: "rgb(0, 0, 0)",
    });
  });
});

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

  it("does not embed raw malicious palette strings into fill attributes", () => {
    const { frames } = simulateReplayForFrames({ steps: planScriptedDoubleClearIntro() });
    const evil = '" onload=alert(1) x="';
    const svg = buildAnimatedSvg(frames, {
      empty: evil,
      grass: "#216e39",
      ghost: "#9be9a8",
    });
    expect(svg).not.toContain(evil);
    expect(svg).toContain('fill="#ebedf0"');
  });
});
