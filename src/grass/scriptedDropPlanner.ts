import type {
  GrassCell,
  GrassColumnGroup,
  GrassDropLevel,
  GrassPlacement,
  GrassStrictSchedule,
  StrictDropFrame,
} from "../domain/grass.js";

/** Duration of each discrete frame in the strict drop timeline. */
export const STRICT_STEP_MS = 80;
/** Hold the completed board before looping. */
export const HOLD_AFTER_LAST_MS = 1800;

type CellRef = { sx: number; sy: number; level: GrassDropLevel };

/** One column's timeline: each entry is displayRow -> source ref for that frame. */
type ColumnFrame = Map<number, CellRef>;

/**
 * Scripted drop (per column): for each week column, non-empty cells fall in discrete row steps.
 * Within a column, lower rows (larger y / later weekdays) settle first; upper cells then fall
 * through empty display slots above them. Between columns in the same band, timelines advance in
 * lockstep (shared frame index); shorter columns hold their last state (parallel merge).
 */
function columnTimeline(absX: number, cellsInCol: GrassCell[]): ColumnFrame[] {
  if (cellsInCol.length === 0) return [];
  const ys = [...new Set(cellsInCol.map((c) => c.y))].sort((a, b) => a - b);
  const missions = [...ys].reverse();
  const settled = new Set<number>();
  const frames: ColumnFrame[] = [];

  const cellAtY = (y: number): GrassCell => cellsInCol.find((c) => c.y === y)!;

  const settledMap = (): ColumnFrame => {
    const m = new Map<number, CellRef>();
    for (const y of [...settled].sort((a, b) => a - b)) {
      const c = cellAtY(y);
      m.set(y, { sx: absX, sy: y, level: c.level });
    }
    return m;
  };

  for (let mi = 0; mi < missions.length; mi++) {
    const y_t = missions[mi]!;
    const c = cellAtY(y_t);
    for (let d = 0; d < y_t; d++) {
      const pl = settledMap();
      pl.set(d, { sx: absX, sy: y_t, level: c.level });
      frames.push(pl);
    }
    settled.add(y_t);
    const nextY = missions[mi + 1];
    if (nextY === undefined) {
      frames.push(settledMap());
    } else if (nextY > 0) {
      frames.push(settledMap());
    }
  }
  return frames;
}

function mergeColumnFrames(timelines: { absX: number; frames: ColumnFrame[] }[]): GrassPlacement[][] {
  const maxLen = timelines.reduce((m, t) => Math.max(m, t.frames.length), 0);
  if (maxLen === 0) return [];

  const out: GrassPlacement[][] = [];
  for (let ti = 0; ti < maxLen; ti++) {
    const placements: GrassPlacement[] = [];
    for (const { absX, frames } of timelines) {
      if (frames.length === 0) continue;
      const idx = Math.min(ti, frames.length - 1);
      const m = frames[idx]!;
      const rows = [...m.keys()].sort((a, b) => a - b);
      for (const dy of rows) {
        const ref = m.get(dy)!;
        placements.push({
          absX,
          absY: dy,
          sourceX: ref.sx,
          sourceY: ref.sy,
          level: ref.level,
        });
      }
    }
    out.push(placements);
  }
  return out;
}

function buildGroupFrames(g: GrassColumnGroup): GrassPlacement[][] {
  const timelines: { absX: number; frames: ColumnFrame[] }[] = [];
  for (let x = g.xStart; x <= g.xEndInclusive; x++) {
    const colCells = g.cells.filter((c) => c.x === x);
    timelines.push({ absX: x, frames: columnTimeline(x, colCells) });
  }
  return mergeColumnFrames(timelines);
}

/**
 * Build strict left-to-right band schedule using the scripted discrete model (see module doc).
 * Prepends one empty frame when any band has motion so the loop starts on an all-empty grid.
 */
export function buildScriptedStrictDropSchedule(groups: GrassColumnGroup[]): GrassStrictSchedule {
  const orderedBands = [...groups].sort((a, b) => a.xStart - b.xStart || a.index - b.index);
  const allPlacements: GrassPlacement[][] = [];
  for (const g of orderedBands) {
    const gf = buildGroupFrames(g);
    for (const p of gf) {
      allPlacements.push(p);
    }
  }
  const frames: StrictDropFrame[] = allPlacements.map((placements) => ({ placements }));
  if (frames.length > 0) {
    frames.unshift({ placements: [] });
  }
  return {
    stepDurationMs: STRICT_STEP_MS,
    frames,
    holdAfterLastMs: HOLD_AFTER_LAST_MS,
  };
}

export function totalCycleMs(schedule: GrassStrictSchedule): number {
  const { frames, stepDurationMs, holdAfterLastMs } = schedule;
  if (frames.length === 0) return holdAfterLastMs;
  return frames.length * stepDurationMs + holdAfterLastMs;
}
