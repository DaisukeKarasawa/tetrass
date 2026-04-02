import { describe, expect, it } from "vitest";

import { buildDropSchedule, splitBoardIntoColumnGroups } from "../grass/groupDropPlanner.js";
import { buildSampleContributionDays, contributionDaysToLevelBoard } from "../io/contributions.js";
import { buildGrassDropSvg, PALETTE_DARK, PALETTE_LIGHT, sanitizeGrassPalette, validateColor } from "./svgRenderer.js";

describe("validateColor / sanitizeGrassPalette", () => {
  it("rejects injectiony palette strings", () => {
    expect(validateColor('url("evil")')).toMatch(/^#/);
    const bad = sanitizeGrassPalette({
      ...PALETTE_LIGHT,
      level4: '"><script',
    });
    expect(bad.level4).toMatch(/^#/);
  });
});

describe("buildGrassDropSvg", () => {
  it("emits a looping SVG with level symbols and expected dimensions", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const groups = splitBoardIntoColumnGroups(board, meta);
    const segments = buildDropSchedule(groups);
    const svg = buildGrassDropSvg(segments, PALETTE_DARK);

    expect(svg).toContain('repeatCount="indefinite"');
    expect(svg).toContain('id="cG1"');
    expect(svg).toContain('id="cG4"');
    expect(svg).toContain('id="grassDrops"');
    expect(svg).toContain('width="958"');
    expect(svg).toContain('height="130"');
  });

  it("uses light canvas and empty cell colors", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const segments = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(segments, PALETTE_LIGHT);
    expect(svg).toContain(PALETTE_LIGHT.canvas);
    expect(svg).toContain('id="cE"');
  });
});
