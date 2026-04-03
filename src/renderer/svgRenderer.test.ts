import { describe, expect, it } from "vitest";

import { GRID_VISIBLE_WEEKS, GRID_WEEKDAYS } from "../domain/grass.js";
import { buildDropSchedule, splitBoardIntoColumnGroups } from "../grass/groupDropPlanner.js";
import { buildSampleContributionDays, contributionDaysToLevelBoard } from "../io/contributions.js";
import {
  buildGrassDropSvg,
  PALETTE_DARK,
  PALETTE_LIGHT,
  sanitizeGrassPalette,
  validateColor,
} from "./svgRenderer.js";

function expectStrictIncreasingKeyTimes(kt: string): void {
  const parts = kt.split(";").map(Number);
  for (let i = 1; i < parts.length; i++) {
    expect(parts[i]).toBeGreaterThan(parts[i - 1]!);
  }
}

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
  it("uses tx,ty pairs for translate animateTransform values (vertical motion, not horizontal)", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_DARK);
    const translateValues = [...svg.matchAll(/type="translate"[^>]*values="([^"]*)"/g)].map((m) => m[1]!);
    expect(translateValues.length).toBeGreaterThan(0);
    for (const vals of translateValues) {
      for (const pair of vals.split(";")) {
        expect(pair).toMatch(/^-?\d+(?:\.\d+)?\s-?\d+(?:\.\d+)?$/);
      }
    }
  });

  it("emits a looping SVG with level symbols and expected dimensions", () => {
    /** Keep in sync with `svgRenderer`: 18px cell + 2px gutter, PAD 2 */
    const step = 20;
    const pad = 2;
    const boardW = GRID_VISIBLE_WEEKS * step + pad * 2;
    const boardH = GRID_WEEKDAYS * step + pad * 2;

    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const groups = splitBoardIntoColumnGroups(board, meta);
    const schedule = buildDropSchedule(groups);
    const svg = buildGrassDropSvg(schedule, PALETTE_DARK);
    const svg2 = buildGrassDropSvg(schedule, PALETTE_DARK);

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
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_LIGHT);
    expect(svg).toContain(PALETTE_LIGHT.canvas);
    expect(svg).toContain('id="cE"');
  });

  it("keeps grassDrops present but empty when the board is all zeros (stable id)", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_DARK);
    expect(svg).toContain('<g id="grassDrops">');
    expect(svg).not.toContain("<animate");
    expect(svg).toMatch(/<g id="grassDrops">\s*<\/g>/);
  });

  it("renders non-zero grass symbols with light palette fills", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_LIGHT);
    expect(svg).toContain(`fill="${PALETTE_LIGHT.level1}"`);
    expect(svg).toContain(`fill="${PALETTE_LIGHT.level4}"`);
    expect(svg).toContain('href="#cG1"');
    expect(svg).toContain('href="#cG4"');
  });

  it("does not duplicate the leading keyTimes 0 when the first group starts at 0ms", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_DARK);
    expect(svg).not.toMatch(/keyTimes="0;0\.0+/);
  });

  it("keeps smil keyTimes strictly increasing in rendered SVG output", () => {
    const { board, meta } = contributionDaysToLevelBoard(buildSampleContributionDays());
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_DARK);
    const allKeyTimes = [...svg.matchAll(/keyTimes="([^"]*)"/g)].map((m) => m[1]!);
    expect(allKeyTimes.length).toBeGreaterThan(0);
    for (const kt of allKeyTimes) {
      expectStrictIncreasingKeyTimes(kt);
    }
  });
});
