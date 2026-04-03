import type {
  GrassCell,
  GrassCellMeta,
  GrassColumnGroup,
  GrassStrictSchedule,
  GroupIndex,
  LevelBoard,
} from "../domain/grass.js";
import { GRID_VISIBLE_WEEKS, GRID_WEEKDAYS, groupColumnRanges } from "../domain/grass.js";
import { buildScriptedStrictDropSchedule } from "./scriptedDropPlanner.js";

export { HOLD_AFTER_LAST_MS, STRICT_STEP_MS, totalCycleMs } from "./scriptedDropPlanner.js";

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

/**
 * Build strict left-to-right band drop using the scripted discrete planner
 * ({@link buildScriptedStrictDropSchedule} in scriptedDropPlanner.ts).
 *
 * When there is at least one animated frame, a leading frame with empty placements is
 * prepended so the cycle starts with the contribution grid fully empty (grey cells only).
 */
export function buildStrictDropSchedule(groups: GrassColumnGroup[]): GrassStrictSchedule {
  return buildScriptedStrictDropSchedule(groups);
}

/**
 * Stable public entry for building the strict drop schedule (CLI, action, tests).
 * Delegates to {@link buildStrictDropSchedule}.
 */
export function buildDropSchedule(groups: GrassColumnGroup[]): GrassStrictSchedule {
  return buildStrictDropSchedule(groups);
}
