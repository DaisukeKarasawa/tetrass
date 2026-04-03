import { describe, expect, it } from "vitest";

import { createEmptyLevelBoard, GRID_VISIBLE_WEEKS, groupColumnRanges } from "../domain/grass.js";
import {
  buildDropSchedule,
  buildStrictDropSchedule,
  HOLD_AFTER_LAST_MS,
  splitBoardIntoColumnGroups,
  STRICT_STEP_MS,
  totalCycleMs,
} from "./groupDropPlanner.js";
import { contributionDaysToLevelBoard, type ContributionDay } from "../io/contributions.js";
import { expectedBand1FourGrassStrictFrames } from "./scriptedDropGolden.js";
import { expectedGroup0TwoCellColumnFrames, levelBoardFromGoldenCells } from "./strictDropFixture.js";

describe("groupColumnRanges", () => {
  it("sums to 53 columns with eight 6-wide bands and one 5-wide", () => {
    const ranges = groupColumnRanges();
    expect(ranges).toHaveLength(9);
    let x = 0;
    for (let i = 0; i < ranges.length; i++) {
      const w = ranges[i]!.xEndInclusive - ranges[i]!.xStart + 1;
      expect(w).toBe(i < 8 ? 6 : 5);
      expect(ranges[i]!.xStart).toBe(x);
      x += w;
    }
    expect(x).toBe(GRID_VISIBLE_WEEKS);
  });
});

describe("splitBoardIntoColumnGroups", () => {
  it("partitions grass cells by column band without duplicates", () => {
    const days: ContributionDay[] = [
      { date: "2024-01-01", weekday: 0, contributionCount: 1, contributionLevel: "FIRST_QUARTILE" },
      { date: "2024-01-02", weekday: 1, contributionCount: 1, contributionLevel: "SECOND_QUARTILE" },
    ];
    const { board, meta } = contributionDaysToLevelBoard(days);
    const groups = splitBoardIntoColumnGroups(board, meta);
    expect(groups).toHaveLength(9);
    const all = groups.flatMap((g) => g.cells);
    const keys = new Set(all.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(all.length);

    let expectedGrass = 0;
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[0]!.length; x++) {
        if (board[y]![x]! > 0) expectedGrass++;
      }
    }
    expect(all.length).toBe(expectedGrass);
  });

  it("places a cell in the correct group by x range", () => {
    const board = createEmptyLevelBoard();
    board[3]![7] = 2;
    const meta = board.map((row, y) =>
      row.map((_, x) => ({
        date: `d-${y}-${x}`,
        contributionCount: board[y]![x]! > 0 ? 1 : 0,
      })),
    );
    const groups = splitBoardIntoColumnGroups(board, meta);
    const g1 = groups[1]!;
    expect(g1.xStart).toBe(6);
    expect(g1.xEndInclusive).toBe(11);
    expect(g1.cells.some((c) => c.x === 7 && c.y === 3)).toBe(true);
  });
});

describe("buildStrictDropSchedule / golden group0", () => {
  it("matches strict 8-frame drop (leading empty + 7 steps) for one column with two grass cells (y=0 and y=6)", () => {
    const board = createEmptyLevelBoard();
    board[0]![2] = 1;
    board[6]![2] = 1;
    const meta = board.map((row, y) =>
      row.map((_, x) => ({
        date: `d-${y}-${x}`,
        contributionCount: board[y]![x]! > 0 ? 1 : 0,
      })),
    );
    const groups = splitBoardIntoColumnGroups(board, meta);
    const schedule = buildStrictDropSchedule(board, groups);
    expect(schedule.frames).toHaveLength(8);
    const expected = expectedGroup0TwoCellColumnFrames();
    for (let i = 0; i < 8; i++) {
      expect(schedule.frames[i]).toEqual(levelBoardFromGoldenCells(expected[i]!));
    }
  });
});

describe("scripted drop / band 1 four-grass golden", () => {
  it("matches golden frames for grass at (9,4),(10,4),(11,1),(11,2) only", () => {
    const board = createEmptyLevelBoard();
    board[4]![9] = 1;
    board[4]![10] = 1;
    board[1]![11] = 1;
    board[2]![11] = 1;
    const meta = board.map((row, y) =>
      row.map((_, x) => ({
        date: `d-${y}-${x}`,
        contributionCount: board[y]![x]! > 0 ? 1 : 0,
      })),
    );
    const groups = splitBoardIntoColumnGroups(board, meta);
    const schedule = buildStrictDropSchedule(board, groups);
    const expected = expectedBand1FourGrassStrictFrames();
    expect(schedule.frames).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(schedule.frames[i]).toEqual(expected[i]!);
    }
  });
});

function hasGrassInXRange(fr: ReturnType<typeof createEmptyLevelBoard>, xMin: number, xMax: number): boolean {
  for (let y = 0; y < fr.length; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (fr[y]![x]! > 0) return true;
    }
  }
  return false;
}

describe("buildDropSchedule", () => {
  it("returns a schedule with step duration and no frames when the board is all zeros", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const groups = splitBoardIntoColumnGroups(board, meta);
    const schedule = buildDropSchedule(board, groups);
    expect(schedule.stepDurationMs).toBe(STRICT_STEP_MS);
    expect(schedule.frames).toHaveLength(0);
    expect(schedule.holdAfterLastMs).toBe(HOLD_AFTER_LAST_MS);
  });

  it("runs groups strictly left-to-right: band-1 grass implies band-0 columns already match the final board", () => {
    const board = createEmptyLevelBoard();
    board[0]![0] = 1;
    board[0]![6] = 1;
    const meta = board.map((row, y) =>
      row.map((_, x) => ({
        date: `d-${y}-${x}`,
        contributionCount: board[y]![x]! > 0 ? 1 : 0,
      })),
    );
    const groups = splitBoardIntoColumnGroups(board, meta);
    const schedule = buildStrictDropSchedule(board, groups);
    expect(schedule.frames.length).toBeGreaterThanOrEqual(2);
    const r0 = groupColumnRanges()[0]!;
    const r1 = groupColumnRanges()[1]!;
    let seenBand1Grass = false;
    for (const fr of schedule.frames) {
      if (hasGrassInXRange(fr, r1.xStart, r1.xEndInclusive)) {
        seenBand1Grass = true;
        for (let y = 0; y < fr.length; y++) {
          for (let x = r0.xStart; x <= r0.xEndInclusive; x++) {
            expect(fr[y]![x]).toBe(board[y]![x]!);
          }
        }
      }
    }
    expect(seenBand1Grass).toBe(true);
  });
});

describe("totalCycleMs", () => {
  it("returns hold-only duration when there are no frames", () => {
    expect(
      totalCycleMs({ frames: [], stepDurationMs: STRICT_STEP_MS, holdAfterLastMs: HOLD_AFTER_LAST_MS }),
    ).toBe(HOLD_AFTER_LAST_MS);
  });

  it("extends through all frames plus hold", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const schedule = buildDropSchedule(board, splitBoardIntoColumnGroups(board, meta));
    expect(totalCycleMs(schedule)).toBe(schedule.frames.length * STRICT_STEP_MS + HOLD_AFTER_LAST_MS);
  });

  it("matches golden board frame count times step plus hold", () => {
    const board = createEmptyLevelBoard();
    board[0]![2] = 1;
    board[6]![2] = 1;
    const meta = board.map((row, y) =>
      row.map((_, x) => ({
        date: `d-${y}-${x}`,
        contributionCount: board[y]![x]! > 0 ? 1 : 0,
      })),
    );
    const schedule = buildStrictDropSchedule(board, splitBoardIntoColumnGroups(board, meta));
    expect(totalCycleMs(schedule)).toBe(8 * STRICT_STEP_MS + HOLD_AFTER_LAST_MS);
  });
});
