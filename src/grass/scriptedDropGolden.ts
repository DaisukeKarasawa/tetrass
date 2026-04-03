import type { GrassPlacement, StrictDropFrame } from "../domain/grass.js";

/** Sort placements for stable snapshot compares. */
export function normalizePlacements(placements: GrassPlacement[]): GrassPlacement[] {
  return [...placements].sort((a, b) => {
    if (a.absX !== b.absX) return a.absX - b.absX;
    if (a.absY !== b.absY) return a.absY - b.absY;
    if (a.sourceX !== b.sourceX) return a.sourceX - b.sourceX;
    return a.sourceY - b.sourceY;
  });
}

/**
 * Golden schedule frames for band index 1 (week columns x=6..11) with grass only at
 * (9,4), (10,4), (11,1), (11,2) — level 1. Other bands empty.
 * Coordinates are 0-based board indices (x = week column, y = GitHub weekday).
 */
export function expectedBand1FourGrassStrictFrames(): StrictDropFrame[] {
  const L = 1 as const;
  return [
    { placements: [] },
    {
      placements: [
        { absX: 9, absY: 0, sourceX: 9, sourceY: 4, level: L },
        { absX: 10, absY: 0, sourceX: 10, sourceY: 4, level: L },
        { absX: 11, absY: 0, sourceX: 11, sourceY: 2, level: L },
      ],
    },
    {
      placements: [
        { absX: 9, absY: 1, sourceX: 9, sourceY: 4, level: L },
        { absX: 10, absY: 1, sourceX: 10, sourceY: 4, level: L },
        { absX: 11, absY: 1, sourceX: 11, sourceY: 2, level: L },
      ],
    },
    {
      placements: [
        { absX: 9, absY: 2, sourceX: 9, sourceY: 4, level: L },
        { absX: 10, absY: 2, sourceX: 10, sourceY: 4, level: L },
        { absX: 11, absY: 2, sourceX: 11, sourceY: 2, level: L },
      ],
    },
    {
      placements: [
        { absX: 9, absY: 3, sourceX: 9, sourceY: 4, level: L },
        { absX: 10, absY: 3, sourceX: 10, sourceY: 4, level: L },
        { absX: 11, absY: 0, sourceX: 11, sourceY: 1, level: L },
        { absX: 11, absY: 2, sourceX: 11, sourceY: 2, level: L },
      ],
    },
    {
      placements: [
        { absX: 9, absY: 4, sourceX: 9, sourceY: 4, level: L },
        { absX: 10, absY: 4, sourceX: 10, sourceY: 4, level: L },
        { absX: 11, absY: 1, sourceX: 11, sourceY: 1, level: L },
        { absX: 11, absY: 2, sourceX: 11, sourceY: 2, level: L },
      ],
    },
  ];
}
