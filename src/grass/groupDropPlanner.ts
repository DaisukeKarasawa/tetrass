import {
  type GrassCell,
  type GrassCellMeta,
  type GrassColumnGroup,
  type GroupDropSegment,
  type GroupIndex,
  type LevelBoard,
  GRID_VISIBLE_WEEKS,
  GRID_WEEKDAYS,
  groupColumnRanges,
} from "../domain/grass.js";

/** Sequential drops: each group starts when the previous lands. */
export const DROP_DURATION_MS = 420;
export const HOLD_AFTER_LAST_MS = 1800;
/** Pixels above the board where falling groups start (multiple of cell pitch is nice visually). */
export const FALL_OFFSET_CELLS = 14;

export function splitBoardIntoColumnGroups(board: LevelBoard, meta: GrassCellMeta[][]): GrassColumnGroup[] {
  const ranges = groupColumnRanges();
  if (board.length !== GRID_WEEKDAYS) {
    throw new Error(`Expected board height ${GRID_WEEKDAYS}, got ${board.length}`);
  }
  const w = board[0]?.length ?? 0;
  if (w !== GRID_VISIBLE_WEEKS) {
    throw new Error(`Expected board width ${GRID_VISIBLE_WEEKS}, got ${w}`);
  }

  const groups: GrassColumnGroup[] = [];
  for (let gi = 0; gi < ranges.length; gi++) {
    const { xStart, xEndInclusive } = ranges[gi]!;
    const cells: GrassCell[] = [];
    for (let y = 0; y < GRID_WEEKDAYS; y++) {
      for (let x = xStart; x <= xEndInclusive; x++) {
        const level = board[y]![x]!;
        if (level === 0) continue;
        const m = meta[y]?.[x];
        if (!m) {
          throw new Error(`Missing meta for grass cell at (${x},${y})`);
        }
        cells.push({
          x,
          y,
          level,
          date: m.date,
          contributionCount: m.contributionCount,
        });
      }
    }
    groups.push({
      index: gi as GroupIndex,
      xStart,
      xEndInclusive,
      cells,
    });
  }
  return groups;
}

/** Build meta grid aligned with board (same shape); empty cells can use placeholder meta. */
export function buildDropSchedule(groups: GrassColumnGroup[]): GroupDropSegment[] {
  let t = 0;
  const segments: GroupDropSegment[] = [];
  for (const g of groups) {
    segments.push({
      groupIndex: g.index,
      startMs: t,
      dropDurationMs: DROP_DURATION_MS,
      fallOffsetCells: FALL_OFFSET_CELLS,
      cells: g.cells,
    });
    t += DROP_DURATION_MS;
  }
  return segments;
}

export function totalCycleMs(segments: GroupDropSegment[]): number {
  if (segments.length === 0) return HOLD_AFTER_LAST_MS;
  const last = segments[segments.length - 1]!;
  return last.startMs + last.dropDurationMs + HOLD_AFTER_LAST_MS;
}
