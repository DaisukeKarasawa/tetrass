/**
 * Golden expectations for strict drop: group 0 only, board with grass at (2,0) and (2,6).
 * Coordinates are 0-based absolute (x week, y weekday).
 * Each snapshot lists display positions -> source (level) for that frame.
 */
import type { GrassDropLevel, LevelBoard } from "../domain/grass.js";
import { createEmptyLevelBoard } from "../domain/grass.js";

export type GoldenCell = {
  displayX: number;
  displayY: number;
  sourceX: number;
  sourceY: number;
  level: GrassDropLevel;
};

/** Normalize placements for snapshot compare (sorted by display then source). */
export function normalizeGolden(cells: GoldenCell[]): GoldenCell[] {
  return [...cells].sort((a, b) => {
    if (a.displayX !== b.displayX) return a.displayX - b.displayX;
    if (a.displayY !== b.displayY) return a.displayY - b.displayY;
    if (a.sourceX !== b.sourceX) return a.sourceX - b.sourceX;
    return a.sourceY - b.sourceY;
  });
}

/** Build a full 53×7 board from golden display cells (other cells stay 0). */
export function levelBoardFromGoldenCells(cells: GoldenCell[]): LevelBoard {
  const b = createEmptyLevelBoard();
  for (const c of cells) {
    b[c.displayY]![c.displayX] = c.level;
  }
  return b;
}

/** Expected 8 frames: leading all-empty, then 7 drop steps for group 0, column x=2, grass at y=0 and y=6, level 1. */
export function expectedGroup0TwoCellColumnFrames(): GoldenCell[][] {
  const L = 1 as GrassDropLevel;
  return [
    [],
    [{ displayX: 2, displayY: 0, sourceX: 2, sourceY: 6, level: L }],
    [{ displayX: 2, displayY: 1, sourceX: 2, sourceY: 6, level: L }],
    [{ displayX: 2, displayY: 2, sourceX: 2, sourceY: 6, level: L }],
    [{ displayX: 2, displayY: 3, sourceX: 2, sourceY: 6, level: L }],
    [{ displayX: 2, displayY: 4, sourceX: 2, sourceY: 6, level: L }],
    [{ displayX: 2, displayY: 5, sourceX: 2, sourceY: 6, level: L }],
    [
      { displayX: 2, displayY: 6, sourceX: 2, sourceY: 6, level: L },
      { displayX: 2, displayY: 0, sourceX: 2, sourceY: 0, level: L },
    ],
  ];
}
