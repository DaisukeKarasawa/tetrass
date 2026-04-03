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
import { expectedGroup0TwoCellColumnFrames, normalizeGolden } from "./strictDropFixture.js";

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
    const schedule = buildStrictDropSchedule(groups);
    expect(schedule.frames).toHaveLength(8);
    expect(schedule.frames[0]!.placements).toEqual([]);
    const expected = expectedGroup0TwoCellColumnFrames();
    for (let i = 0; i < 8; i++) {
      const got = normalizeGolden(
        schedule.frames[i]!.placements.map((p) => ({
          displayX: p.absX,
          displayY: p.absY,
          sourceX: p.sourceX,
          sourceY: p.sourceY,
          level: p.level,
        })),
      );
      expect(got).toEqual(normalizeGolden(expected[i]!));
    }
  });
});

describe("buildDropSchedule", () => {
  it("returns a schedule with step duration and nine group-derived frame chunks", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const groups = splitBoardIntoColumnGroups(board, meta);
    const schedule = buildDropSchedule(groups);
    expect(schedule.stepDurationMs).toBe(STRICT_STEP_MS);
    expect(schedule.frames).toHaveLength(0);
    expect(schedule.holdAfterLastMs).toBe(HOLD_AFTER_LAST_MS);
  });

  it("runs groups strictly left-to-right: later group frames never appear before earlier group finishes", () => {
    const board = createEmptyLevelBoard();
    board[0]![0] = 1;
    board[0]![6] = 1;
    const meta = board.map((row, y) =>
      row.map((_, x) => ({
        date: `d-${y}-${x}`,
        contributionCount: board[y]![x]! > 0 ? 1 : 0,
      })),
    );
    const schedule = buildStrictDropSchedule(splitBoardIntoColumnGroups(board, meta));
    expect(schedule.frames.length).toBeGreaterThanOrEqual(2);
    const firstGroupXMax = groupColumnRanges()[0]!.xEndInclusive;
    const secondGroupXMin = groupColumnRanges()[1]!.xStart;
    let seenSecond = false;
    for (const fr of schedule.frames) {
      const hasSecond = fr.placements.some((p) => p.absX >= secondGroupXMin);
      const hasFirst = fr.placements.some((p) => p.absX <= firstGroupXMax);
      if (hasSecond) seenSecond = true;
      if (hasFirst && seenSecond) {
        throw new Error("Expected group 0 to finish before group 1 placements appear");
      }
    }
    const idxSecond = schedule.frames.findIndex((fr) =>
      fr.placements.some((p) => p.absX >= secondGroupXMin),
    );
    let idxFirstLast = -1;
    for (let i = schedule.frames.length - 1; i >= 0; i--) {
      if (schedule.frames[i]!.placements.some((p) => p.absX <= firstGroupXMax)) {
        idxFirstLast = i;
        break;
      }
    }
    expect(idxSecond).toBeGreaterThan(idxFirstLast);
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
    const schedule = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
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
    const schedule = buildStrictDropSchedule(splitBoardIntoColumnGroups(board, meta));
    expect(totalCycleMs(schedule)).toBe(8 * STRICT_STEP_MS + HOLD_AFTER_LAST_MS);
  });
});
