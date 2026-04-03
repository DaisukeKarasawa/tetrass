import type { GrassCell, GrassColumnGroup, GrassDropLevel, GrassLevel, GrassStrictSchedule, LevelBoard } from "../domain/grass.js";
import { GRID_VISIBLE_WEEKS, GRID_WEEKDAYS, createEmptyLevelBoard } from "../domain/grass.js";

/** Duration of each discrete frame in the strict drop timeline. */
export const STRICT_STEP_MS = 80;
/** Hold the completed board before looping. */
export const HOLD_AFTER_LAST_MS = 1800;

/** Per-column frame: weekday row y (0..6) → level at that display row. */
type ColSnapshot = Map<number, GrassLevel>;

function cellAtY(cellsInCol: GrassCell[], y: number): GrassCell {
  const c = cellsInCol.find((x) => x.y === y);
  if (!c) throw new Error(`Missing grass cell at weekday y=${y}`);
  return c;
}

/**
 * Within one week column: larger y (later weekday) settles before smaller y.
 * Each falling cell appears at display row 0 and steps down until it lands; then the next source row animates.
 */
function columnSnapshots(cellsInCol: GrassCell[]): ColSnapshot[] {
  if (cellsInCol.length === 0) return [];

  const ys = [...new Set(cellsInCol.map((c) => c.y))].sort((a, b) => a - b);
  const missions = [...ys].sort((a, b) => b - a);
  const settled = new Set<number>();
  const frames: ColSnapshot[] = [];

  const levelAt = (y: number): GrassDropLevel => cellAtY(cellsInCol, y).level;

  const settledSnap = (): ColSnapshot => {
    const m = new Map<number, GrassLevel>();
    for (const y of [...settled].sort((a, b) => a - b)) {
      m.set(y, levelAt(y));
    }
    return m;
  };

  for (let mi = 0; mi < missions.length; mi++) {
    const y_t = missions[mi]!;
    const lvl = levelAt(y_t);
    for (let d = 0; d < y_t; d++) {
      const pl = new Map<number, GrassLevel>(settledSnap());
      pl.set(d, lvl);
      frames.push(pl);
    }
    settled.add(y_t);
    const nextY = missions[mi + 1];
    // Hold settled-only before the next mission so parallel bands stay aligned (shorter columns
    // wait on the grid). Skip when the next cell is Sunday (y=0): two-cell column golden needs
    // Saturday to land and Sunday to appear in adjacent steps without an extra hold-only frame.
    if (nextY !== undefined && nextY > 0) {
      frames.push(settledSnap());
    }
  }
  frames.push(settledSnap());
  return frames;
}

function colStateAt(snapshots: ColSnapshot[], stepIndex: number): ColSnapshot {
  if (snapshots.length === 0) return new Map();
  const idx = Math.min(stepIndex, snapshots.length - 1);
  return snapshots[idx]!;
}

function buildGroupLevelBoardFrames(g: GrassColumnGroup, board: LevelBoard): LevelBoard[] {
  const { xStart, xEndInclusive } = g;
  const colSnaps: ColSnapshot[][] = [];
  for (let x = xStart; x <= xEndInclusive; x++) {
    const cells = g.cells.filter((c) => c.x === x);
    colSnaps.push(columnSnapshots(cells));
  }

  const maxLen = colSnaps.reduce((m, arr) => Math.max(m, arr.length), 0);
  if (maxLen === 0) return [];

  const out: LevelBoard[] = [];
  for (let i = 0; i < maxLen; i++) {
    const snap = createEmptyLevelBoard();
    for (let y = 0; y < GRID_WEEKDAYS; y++) {
      for (let x = 0; x < GRID_VISIBLE_WEEKS; x++) {
        if (x < xStart) {
          snap[y]![x] = board[y]![x]!;
        } else if (x > xEndInclusive) {
          snap[y]![x] = 0;
        }
      }
    }
    let colIdx = 0;
    for (let x = xStart; x <= xEndInclusive; x++) {
      const state = colStateAt(colSnaps[colIdx]!, i);
      colIdx++;
      for (let y = 0; y < GRID_WEEKDAYS; y++) {
        snap[y]![x] = state.get(y) ?? 0;
      }
    }
    out.push(snap);
  }
  return out;
}

/**
 * Build full 53×7 frame sequence: first frame all empty; then each band left→right.
 * Inside a band, week columns animate in parallel; shorter columns hold their last state until the longest finishes.
 */
export function buildScriptedStrictDropSchedule(board: LevelBoard, groups: GrassColumnGroup[]): GrassStrictSchedule {
  const orderedBands = [...groups].sort((a, b) => a.xStart - b.xStart || a.index - b.index);
  const anyGrass = orderedBands.some((g) => g.cells.length > 0);
  if (!anyGrass) {
    return {
      stepDurationMs: STRICT_STEP_MS,
      holdAfterLastMs: HOLD_AFTER_LAST_MS,
      frames: [],
    };
  }

  const frames: LevelBoard[] = [createEmptyLevelBoard()];
  for (const g of orderedBands) {
    const chunk = buildGroupLevelBoardFrames(g, board);
    for (const f of chunk) frames.push(f);
  }
  return {
    stepDurationMs: STRICT_STEP_MS,
    holdAfterLastMs: HOLD_AFTER_LAST_MS,
    frames,
  };
}

export function totalCycleMs(schedule: GrassStrictSchedule): number {
  const { frames, stepDurationMs, holdAfterLastMs } = schedule;
  if (frames.length === 0) return holdAfterLastMs;
  return frames.length * stepDurationMs + holdAfterLastMs;
}
