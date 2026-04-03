/** GitHub profile contribution grid: 7 weekdays × 53 visible weeks. */
export const GRID_WEEKDAYS = 7;
export const GRID_VISIBLE_WEEKS = 53;

/**
 * Column widths for the nine drop groups (left → right).
 * Sum must equal {@link GRID_VISIBLE_WEEKS}.
 */
export const GROUP_COLUMN_COUNTS = [6, 6, 6, 6, 6, 6, 6, 6, 5] as const;

export type GroupIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 0 = no contributions (empty cell UI); 1..4 = GitHub contribution intensity. */
export type GrassLevel = 0 | 1 | 2 | 3 | 4;

/** Non-empty grass cell only (drop layers use this; empty grid uses level 0 elsewhere). */
export type GrassDropLevel = Exclude<GrassLevel, 0>;

/** Row-major board: `board[y][x]` — y weekday 0..6, x week column 0..52. */
export type LevelBoard = GrassLevel[][];

/** Per-day fields from GitHub (also used for empty cells as placeholders). */
export interface GrassCellMeta {
  date: string;
  contributionCount: number;
}

export interface GrassCell {
  x: number;
  y: number;
  level: GrassDropLevel;
  date: string;
  contributionCount: number;
}

/** One of the nine column bands; only cells with level > 0 are listed. */
export interface GrassColumnGroup {
  index: GroupIndex;
  xStart: number;
  xEndInclusive: number;
  cells: GrassCell[];
}

/**
 * Full-grid SMIL timeline: each entry is the visible 53×7 heatmap for one discrete step.
 * `frames[0]` is always all zeros (empty-cell UI everywhere).
 * Columns left of the animating band match the final `board`; columns right of the band are zero until their band runs.
 */
export interface GrassStrictSchedule {
  stepDurationMs: number;
  holdAfterLastMs: number;
  frames: LevelBoard[];
}

export function assertGroupColumnCounts(): void {
  const s = GROUP_COLUMN_COUNTS.reduce((a, b) => a + b, 0);
  if (s !== GRID_VISIBLE_WEEKS) {
    throw new Error(`GROUP_COLUMN_COUNTS must sum to ${GRID_VISIBLE_WEEKS}, got ${s}`);
  }
}

/** Inclusive column ranges [xStart, xEnd] for each group. */
export function groupColumnRanges(): ReadonlyArray<{ xStart: number; xEndInclusive: number }> {
  assertGroupColumnCounts();
  const out: { xStart: number; xEndInclusive: number }[] = [];
  let x = 0;
  for (const w of GROUP_COLUMN_COUNTS) {
    out.push({ xStart: x, xEndInclusive: x + w - 1 });
    x += w;
  }
  return out;
}

/** Empty level board (all zeros), GitHub-sized. */
export function createEmptyLevelBoard(): LevelBoard {
  return Array.from({ length: GRID_WEEKDAYS }, () =>
    Array.from({ length: GRID_VISIBLE_WEEKS }, () => 0 as GrassLevel),
  );
}
