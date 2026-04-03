/**
 * Canonical group-local grass coordinates (source of truth for shape tests).
 * Convention: (col, row) with col 1..6 (or 1..5 in band 9), row 1..7 = Sunday..Saturday
 * matching GitHub weekday 0 at row 1.
 */
import type { GroupIndex } from "../domain/grass.js";
import { groupColumnRanges } from "../domain/grass.js";

/** [col, row] pairs per band index 0..8 */
export const OVERVIEW_GRASS_COORDS_BY_GROUP: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [1, 3],
    [1, 7],
  ],
  [
    [4, 5],
    [5, 5],
    [6, 2],
    [6, 3],
  ],
  [
    [1, 3],
    [1, 4],
    [3, 7],
    [4, 1],
    [4, 2],
    [4, 3],
    [4, 5],
    [5, 1],
    [5, 2],
    [5, 3],
    [5, 4],
    [5, 5],
    [6, 5],
    [6, 6],
  ],
  [
    [1, 5],
    [2, 3],
    [3, 1],
    [3, 2],
    [3, 3],
    [4, 2],
    [4, 3],
    [4, 5],
    [5, 4],
    [6, 1],
    [6, 2],
    [6, 3],
    [6, 6],
    [6, 7],
  ],
  [
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 2],
    [2, 4],
    [2, 5],
    [2, 6],
    [3, 2],
    [3, 3],
    [3, 4],
    [3, 5],
    [4, 2],
    [4, 3],
    [4, 4],
    [5, 2],
    [5, 3],
    [5, 4],
    [5, 7],
    [6, 5],
  ],
  [
    [3, 4],
    [4, 4],
    [5, 7],
    [6, 1],
    [6, 5],
    [6, 6],
  ],
  [
    [2, 4],
    [2, 5],
    [2, 6],
    [2, 7],
    [4, 1],
    [4, 2],
    [4, 3],
    [4, 4],
    [4, 5],
    [5, 1],
    [5, 2],
    [5, 4],
    [5, 6],
    [6, 1],
    [6, 4],
    [6, 5],
    [6, 6],
    [6, 7],
  ],
  [
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 4],
    [2, 5],
    [2, 6],
    [2, 7],
    [3, 1],
    [3, 2],
    [3, 3],
    [3, 4],
    [3, 5],
    [3, 6],
    [4, 1],
    [4, 2],
    [4, 3],
    [4, 4],
    [4, 5],
    [4, 6],
    [4, 7],
    [5, 3],
    [5, 4],
    [5, 5],
    [5, 6],
    [5, 7],
    [6, 1],
    [6, 2],
    [6, 3],
    [6, 4],
    [6, 6],
    [6, 7],
  ],
  [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 5],
    [1, 6],
    [1, 7],
    [2, 4],
    [2, 5],
    [2, 6],
    [3, 3],
    [3, 5],
    [3, 6],
    [3, 7],
    [4, 1],
    [4, 4],
    [4, 5],
    [4, 6],
    [4, 7],
    [5, 1],
    [5, 4],
    [5, 5],
    [5, 6],
  ],
];

export function localGrassToAbsolute(groupIndex: GroupIndex, col: number, row: number): { x: number; y: number } {
  const ranges = groupColumnRanges();
  const { xStart, xEndInclusive } = ranges[groupIndex]!;
  const width = xEndInclusive - xStart + 1;
  if (col < 1 || col > width) {
    throw new Error(`Group ${groupIndex}: local col ${col} out of range 1..${width}`);
  }
  if (row < 1 || row > 7) {
    throw new Error(`Group ${groupIndex}: local row ${row} out of range 1..7`);
  }
  return { x: xStart + (col - 1), y: row - 1 };
}

/** Absolute (x,y) keys "x,y" sorted for stable comparison */
export function specAbsoluteKeysForGroup(groupIndex: GroupIndex): Set<string> {
  const coords = OVERVIEW_GRASS_COORDS_BY_GROUP[groupIndex]!;
  const s = new Set<string>();
  for (const [c, r] of coords) {
    const { x, y } = localGrassToAbsolute(groupIndex, c, r);
    s.add(`${x},${y}`);
  }
  return s;
}
