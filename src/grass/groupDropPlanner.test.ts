import { describe, expect, it } from "vitest";

import { createEmptyLevelBoard, GRID_VISIBLE_WEEKS, groupColumnRanges } from "../domain/grass.js";
import {
  buildDropSchedule,
  DROP_DURATION_MS,
  HOLD_AFTER_LAST_MS,
  splitBoardIntoColumnGroups,
  totalCycleMs,
} from "./groupDropPlanner.js";
import { contributionDaysToLevelBoard, type ContributionDay } from "../io/contributions.js";

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

describe("buildDropSchedule", () => {
  it("starts each group after the previous drop finishes", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const groups = splitBoardIntoColumnGroups(board, meta);
    const segs = buildDropSchedule(groups);
    expect(segs).toHaveLength(9);
    for (let i = 0; i < segs.length; i++) {
      expect(segs[i]!.startMs).toBe(i * DROP_DURATION_MS);
    }
  });
});

describe("totalCycleMs", () => {
  it("returns hold-only duration when there are no segments", () => {
    expect(totalCycleMs([])).toBe(HOLD_AFTER_LAST_MS);
  });

  it("extends through the last drop plus hold", () => {
    const { board, meta } = contributionDaysToLevelBoard([]);
    const segs = buildDropSchedule(splitBoardIntoColumnGroups(board, meta));
    const last = segs[segs.length - 1]!;
    expect(totalCycleMs(segs)).toBe(last.startMs + last.dropDurationMs + HOLD_AFTER_LAST_MS);
  });
});
