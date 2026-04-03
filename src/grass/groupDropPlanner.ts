import {
  type GrassCell,
  type GrassCellMeta,
  type GrassColumnGroup,
  type GrassDropLevel,
  type GrassPlacement,
  type GrassStrictSchedule,
  type StrictDropFrame,
  type GroupIndex,
  type LevelBoard,
  GRID_VISIBLE_WEEKS,
  GRID_WEEKDAYS,
  groupColumnRanges,
} from "../domain/grass.js";

/** Duration of each discrete frame in the strict drop timeline. */
export const STRICT_STEP_MS = 80;
/** Hold the completed board before looping. */
export const HOLD_AFTER_LAST_MS = 1800;

type CellRef = { sx: number; sy: number; level: GrassDropLevel };

/** One column's timeline: each entry is displayRow -> source ref for that frame. */
type ColumnFrame = Map<number, CellRef>;

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
    // If the next mission is row 0, it adds no fall frames — omit a lone "settled only"
    // frame so the final state includes both cells in one frame (matches golden / UX).
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
 * Build strict left-to-right group drop: within each group, columns run in parallel;
 * each column drops bottom grass first, then upper, with discrete row steps.
 */
export function buildStrictDropSchedule(groups: GrassColumnGroup[]): GrassStrictSchedule {
  const allPlacements: GrassPlacement[][] = [];
  for (const g of groups) {
    const gf = buildGroupFrames(g);
    for (const p of gf) {
      allPlacements.push(p);
    }
  }
  const frames: StrictDropFrame[] = allPlacements.map((placements) => ({ placements }));
  return {
    stepDurationMs: STRICT_STEP_MS,
    frames,
    holdAfterLastMs: HOLD_AFTER_LAST_MS,
  };
}

/** @deprecated Use {@link buildStrictDropSchedule}; kept as stable name for callers. */
export function buildDropSchedule(groups: GrassColumnGroup[]): GrassStrictSchedule {
  return buildStrictDropSchedule(groups);
}

export function totalCycleMs(schedule: GrassStrictSchedule): number {
  const { frames, stepDurationMs, holdAfterLastMs } = schedule;
  if (frames.length === 0) return holdAfterLastMs;
  return frames.length * stepDurationMs + holdAfterLastMs;
}
