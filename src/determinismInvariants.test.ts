import { describe, expect, it } from "vitest";

import {
  GRID_VISIBLE_WEEKS,
  createEmptyLevelBoard,
  groupColumnRanges,
  type GrassLevel,
} from "./domain/grass.js";
import {
  buildStrictDropSchedule,
  splitBoardIntoColumnGroups,
} from "./grass/groupDropPlanner.js";
import {
  contributionCalendarToLevelBoard,
  contributionLevelToGrassLevel,
  type ContributionCalendar,
} from "./io/contributions.js";
import { buildGrassDropSvg, PALETTE_LIGHT } from "./renderer/svgRenderer.js";

/**
 * Evidence for CodeRabbit "Determinism invariants evidence":
 * - Stable GitHub API contributionLevel → level board → rendered grass symbol hrefs.
 * - Nine-band column partition + strict discrete schedule stability for the same input.
 */

const ALL_API_LEVELS = [
  "NONE",
  "FIRST_QUARTILE",
  "SECOND_QUARTILE",
  "THIRD_QUARTILE",
  "FOURTH_QUARTILE",
] as const;

describe("Determinism: API contributionLevel → board → SVG symbols", () => {
  it("keeps a fixed contributionLevel→grass level table (0..4)", () => {
    expect(ALL_API_LEVELS.map(contributionLevelToGrassLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it("maps GraphQL calendar weeks to board cells and grassDrops use matching #cG1..#cG4 hrefs", () => {
    const cal: ContributionCalendar = {
      weeks: [
        {
          contributionDays: [
            { date: "2024-06-03", weekday: 0, contributionCount: 2, contributionLevel: "FIRST_QUARTILE" },
            { date: "2024-06-04", weekday: 1, contributionCount: 3, contributionLevel: "SECOND_QUARTILE" },
            { date: "2024-06-05", weekday: 2, contributionCount: 4, contributionLevel: "THIRD_QUARTILE" },
            { date: "2024-06-06", weekday: 3, contributionCount: 5, contributionLevel: "FOURTH_QUARTILE" },
            { date: "2024-06-07", weekday: 4, contributionCount: 0, contributionLevel: "NONE" },
          ],
        },
      ],
    };

    const { board, meta } = contributionCalendarToLevelBoard(cal);
    const x = GRID_VISIBLE_WEEKS - 1;
    expect(board[0]![x]).toBe(1);
    expect(board[1]![x]).toBe(2);
    expect(board[2]![x]).toBe(3);
    expect(board[3]![x]).toBe(4);
    expect(board[4]![x]).toBe(0);

    const schedule = buildStrictDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const svg = buildGrassDropSvg(schedule, PALETTE_LIGHT);

    const grassStart = svg.indexOf('<g id="grassDrops">');
    expect(grassStart).toBeGreaterThan(-1);
    const grassSlice = svg.slice(grassStart);

    expect(grassSlice).toContain('href="#cG1"');
    expect(grassSlice).toContain('href="#cG2"');
    expect(grassSlice).toContain('href="#cG3"');
    expect(grassSlice).toContain('href="#cG4"');
    expect(grassSlice).not.toContain('href="#cG0"');
  });
});

/** Shared fixture: one level-1 cell per band at (xStart, 0). */
function createOneCellPerBandFixture() {
  const ranges = groupColumnRanges();
  const board = createEmptyLevelBoard();
  const meta = board.map((row, y) =>
    row.map((_, x) => ({
      date: `d-${y}-${x}`,
      contributionCount: board[y]![x]! > 0 ? 1 : 0,
    })),
  );
  for (let gi = 0; gi < 9; gi++) {
    const x = ranges[gi]!.xStart;
    board[0]![x] = 1 as GrassLevel;
    meta[0]![x] = { date: `seed-${gi}`, contributionCount: 1 };
  }
  return { ranges, board, meta };
}

describe("Determinism: nine-band schedule & strict discrete model", () => {
  it("places one grass per band on column xStart at weekday row 0 (partition invariant)", () => {
    const { ranges, board, meta } = createOneCellPerBandFixture();
    const groups = splitBoardIntoColumnGroups(board, meta);
    expect(groups).toHaveLength(9);
    for (let gi = 0; gi < 9; gi++) {
      expect(groups[gi]!.cells).toHaveLength(1);
      expect(groups[gi]!.cells[0]!.x).toBe(ranges[gi]!.xStart);
      expect(groups[gi]!.cells[0]!.y).toBe(0);
      expect(groups[gi]!.xStart).toBe(ranges[gi]!.xStart);
      expect(groups[gi]!.xEndInclusive).toBe(ranges[gi]!.xEndInclusive);
    }
  });

  it("produces identical GrassStrictSchedule when rebuilt from the same board (stable discrete merge)", () => {
    const { board, meta } = createOneCellPerBandFixture();
    const g1 = splitBoardIntoColumnGroups(board, meta);
    const g2 = splitBoardIntoColumnGroups(board, meta);
    expect(buildStrictDropSchedule(g1)).toEqual(buildStrictDropSchedule(g2));
  });

  it("keeps a golden frame count for the 9-band one-cell-per-band fixture (regression guard)", () => {
    const { board, meta } = createOneCellPerBandFixture();
    const schedule = buildStrictDropSchedule(splitBoardIntoColumnGroups(board, meta));
    /** One discrete frame per group (single y=0 cell at each band's xStart). */
    expect(schedule.frames).toHaveLength(9);
  });
});
