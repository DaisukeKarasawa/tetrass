import { describe, expect, it } from "vitest";

import { GRID_VISIBLE_WEEKS, GRID_WEEKDAYS } from "../domain/grass.js";
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
    /** Keep in sync with `svgRenderer`: 18px cell + 2px gutter, PAD 2 */
    const step = 20;
    const pad = 2;
    const boardW = GRID_VISIBLE_WEEKS * step + pad * 2;
    const boardH = GRID_WEEKDAYS * step + pad * 2;

    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const groups = splitBoardIntoColumnGroups(board, meta);
    const segments = buildDropSchedule(groups);
    const svg = buildGrassDropSvg(segments, PALETTE_DARK);
    const svg2 = buildGrassDropSvg(segments, PALETTE_DARK);

    expect(svg).toBe(svg2);
    expect(svg).toContain('repeatCount="indefinite"');
    expect(svg).toContain('id="cG1"');
    expect(svg).toContain('id="cG4"');
    expect(svg).toContain('id="grassDrops"');
    expect(svg).toContain(`width="${boardW}"`);
    expect(svg).toContain(`height="${boardH}"`);
    expect(svg).toContain(`viewBox="0 0 ${boardW} ${boardH}"`);
  });

  it("uses light canvas and empty cell colors", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const segments = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(segments, PALETTE_LIGHT);
    expect(svg).toContain(PALETTE_LIGHT.canvas);
    expect(svg).toContain('id="cE"');
  });

  it("keeps grassDrops present but empty when the board is all zeros (stable id)", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const segments = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(segments, PALETTE_DARK);
    expect(svg).toContain('<g id="grassDrops">');
    expect(svg).not.toContain("<animate");
    expect(svg).toMatch(/<g id="grassDrops">\s*<\/g>/);
  });

  it("renders non-zero grass symbols with light palette fills", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const segments = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(segments, PALETTE_LIGHT);
    expect(svg).toContain(`fill="${PALETTE_LIGHT.level1}"`);
    expect(svg).toContain(`fill="${PALETTE_LIGHT.level4}"`);
    expect(svg).toContain('href="#cG1"');
    expect(svg).toContain('href="#cG4"');
  });

  it("does not duplicate the leading keyTimes 0 when the first group starts at 0ms", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const segments = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(segments, PALETTE_DARK);
    expect(svg).not.toMatch(/keyTimes="0;0\.0+/);
  });
});