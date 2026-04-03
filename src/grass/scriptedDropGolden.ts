import type { GrassLevel, LevelBoard } from "../domain/grass.js";
import { createEmptyLevelBoard } from "../domain/grass.js";

function snapFromAbs(
  placements: readonly { absX: number; absY: number; level: GrassLevel }[],
): LevelBoard {
  const b = createEmptyLevelBoard();
  for (const p of placements) {
    b[p.absY]![p.absX] = p.level;
  }
  return b;
}

/**
 * Golden schedule frames for band index 1 (week columns x=6..11) with grass only at
 * (9,4), (10,4), (11,1), (11,2) — level 1. Other bands empty.
 */
export function expectedBand1FourGrassStrictFrames(): LevelBoard[] {
  const L = 1 as GrassLevel;
  return [
    createEmptyLevelBoard(),
    snapFromAbs([
      { absX: 9, absY: 0, level: L },
      { absX: 10, absY: 0, level: L },
      { absX: 11, absY: 0, level: L },
    ]),
    snapFromAbs([
      { absX: 9, absY: 1, level: L },
      { absX: 10, absY: 1, level: L },
      { absX: 11, absY: 1, level: L },
    ]),
    snapFromAbs([
      { absX: 9, absY: 2, level: L },
      { absX: 10, absY: 2, level: L },
      { absX: 11, absY: 2, level: L },
    ]),
    snapFromAbs([
      { absX: 9, absY: 3, level: L },
      { absX: 10, absY: 3, level: L },
      { absX: 11, absY: 0, level: L },
      { absX: 11, absY: 2, level: L },
    ]),
    snapFromAbs([
      { absX: 9, absY: 4, level: L },
      { absX: 10, absY: 4, level: L },
      { absX: 11, absY: 1, level: L },
      { absX: 11, absY: 2, level: L },
    ]),
  ];
}
