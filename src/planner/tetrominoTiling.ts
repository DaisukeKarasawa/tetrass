import {
  applyPlacementNoClear,
  boardsEqual,
  cloneBoard,
  createEmptyBoard,
  getBoardDimensions,
  isValidLock,
} from "../domain/board.js";
import { getCells } from "../domain/tetromino.js";
import { iterateTypesInOrder, ROTATIONS } from "../domain/tetromino.js";
import {
  type Board,
  type PiecePlacement,
  type ReplayStep,
  type RotationIndex,
  type TetrominoType,
} from "../domain/types.js";

const TYPE_ORDER = iterateTypesInOrder();

/** Lowest placement origin row to try (negative allows options whose shape extends above the well). */
const TILING_CANDIDATE_MIN_ORIGIN_Y = -4;

/** Cap DFS recursion volume (each `dfs()` entry counts as one visit). Scales with mask size. */
const TILING_DFS_VISIT_BUDGET_BASE = 500_000;
const TILING_DFS_VISIT_BUDGET_PER_GRASS_CELL = 15_000;
/** Avoid combinatorial blow-up on large masks; rely on monomino fallback there. */
const TILING_EXACT_COVER_MAX_GRASS_CELLS = 80;

interface NormalizedShape {
  cells: [number, number][];
  minX: number;
  minY: number;
}

/** Normalized shape cells plus offset from raw origin to min-corner origin. */
function normalizedShape(type: TetrominoType, rotation: 0 | 1 | 2 | 3): NormalizedShape {
  const raw = getCells(type, rotation, 0, 0);
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of raw) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  return {
    cells: raw.map(([x, y]) => [x - minX, y - minY] as [number, number]),
    minX,
    minY,
  };
}

export interface TilingResult {
  steps: ReplayStep[];
  trimmedBoard: Board;
  trimmedCells: number;
}

function countDistinctTypes(steps: ReplayStep[]): number {
  const used = new Set<TetrominoType>();
  for (const st of steps) used.add(st.placement.type);
  return used.size;
}

function grassCells(board: Board): [number, number][] {
  const { width, height } = getBoardDimensions(board);
  const out: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (board[y][x]) out.push([x, y]);
    }
  }
  return out;
}

function buildOptionsForTarget(target: Board): Map<string, PiecePlacement[]> {
  const { width, height } = getBoardDimensions(target);
  const grass = new Set(grassCells(target).map(([x, y]) => `${x},${y}`));
  const options = new Map<string, PiecePlacement[]>();

  for (const type of TYPE_ORDER) {
    for (const rotation of ROTATIONS) {
      const { cells: rel, minX, minY } = normalizedShape(type, rotation);
      for (let ax = 0; ax < width; ax++) {
        for (let ay = TILING_CANDIDATE_MIN_ORIGIN_Y; ay < height; ay++) {
          const abs: [number, number][] = rel.map(([dx, dy]) => [ax + dx, ay + dy] as [number, number]);
          let ok = true;
          for (const [cx, cy] of abs) {
            if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
              ok = false;
              break;
            }
            if (!grass.has(`${cx},${cy}`)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          // Keep placement origin aligned with normalized cells.
          const p: PiecePlacement = { type, rotation, x: ax - minX, y: ay - minY };
          for (const [cx, cy] of abs) {
            const k = `${cx},${cy}`;
            const arr = options.get(k) ?? [];
            arr.push(p);
            options.set(k, arr);
          }
        }
      }
    }
  }
  return options;
}

/**
 * Try to find an exact tetromino cover for the target grass cells.
 * Uses `applyPlacementNoClear` so full rows in the target do not trigger line clears
 * during validation; the final board must exactly match the target.
 */
function tryTile(target: Board, minDistinctTypes: number): ReplayStep[] | null {
  const { width, height } = getBoardDimensions(target);
  const grass = grassCells(target);
  if (grass.length === 0) return minDistinctTypes === 0 ? [] : null;
  if (grass.length % 4 !== 0) return null;

  const optionsByCell = buildOptionsForTarget(target);
  const filled = new Set<string>();
  const usedPlacements: PiecePlacement[] = [];
  const typeUsed = new Set<TetrominoType>();
  const maxDfsVisits = TILING_DFS_VISIT_BUDGET_BASE + grass.length * TILING_DFS_VISIT_BUDGET_PER_GRASS_CELL;
  let dfsVisitCount = 0;

  /** `grass` is row-major (y then x) from {@link grassCells}, so the first unfilled cell is min (y, x). */
  function pickNextCell(): [number, number] | null {
    for (const [x, y] of grass) {
      if (!filled.has(`${x},${y}`)) return [x, y];
    }
    return null;
  }

  function dfs(): boolean {
    if (dfsVisitCount >= maxDfsVisits) return false;
    dfsVisitCount++;
    const next = pickNextCell();
    if (!next) {
      if (typeUsed.size >= minDistinctTypes) return true;
      return false;
    }
    const [nx, ny] = next;
    const opts = optionsByCell.get(`${nx},${ny}`) ?? [];
    const sorted = [...opts].sort((a, b) => {
      const au = typeUsed.has(a.type) ? 1 : 0;
      const bu = typeUsed.has(b.type) ? 1 : 0;
      if (au !== bu) return au - bu;
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return ai - bi;
      if (a.rotation !== b.rotation) return a.rotation - b.rotation;
      if (a.x !== b.x) return a.x - b.x;
      return a.y - b.y;
    });

    for (const p of sorted) {
      const cells = getCells(p.type, p.rotation, p.x, p.y);
      const keys = cells.map(([cx, cy]) => `${cx},${cy}`);
      if (keys.some((k) => filled.has(k))) continue;
      let allGrass = true;
      for (const [cx, cy] of cells) {
        if (cx < 0 || cx >= width || cy < 0 || cy >= height || !target[cy][cx]) {
          allGrass = false;
          break;
        }
      }
      if (!allGrass) continue;

      for (const k of keys) filled.add(k);
      usedPlacements.push(p);
      const addedType = !typeUsed.has(p.type);
      if (addedType) typeUsed.add(p.type);
      if (dfs()) return true;
      if (addedType) typeUsed.delete(p.type);
      usedPlacements.pop();
      for (const k of keys) filled.delete(k);
    }
    return false;
  }

  if (!dfs()) return null;

  // Exact cover search may produce a non-lockable order. Reorder bottom-up and
  // verify each lock against evolving board state (no line clears).
  const ordered = [...usedPlacements].sort((a, b) => {
    if (a.y !== b.y) return b.y - a.y;
    if (a.x !== b.x) return a.x - b.x;
    const ai = TYPE_ORDER.indexOf(a.type);
    const bi = TYPE_ORDER.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    return a.rotation - b.rotation;
  });

  const board = createEmptyBoard(width, height);
  for (const p of ordered) {
    if (!isValidLock(board, p)) return null;
    applyPlacementNoClear(board, p);
  }

  if (!boardsEqual(board, target)) {
    return null;
  }

  return ordered.map((placement) => ({ placement, noLineClear: true }));
}

/**
 * Build monomino replay steps for the given cell positions.
 * Each monomino is tagged with `noLineClear: true`.
 */
function buildMonominoSteps(positions: [number, number][]): ReplayStep[] {
  return positions.map(([x, y]) => ({
    placement: { type: "M" as TetrominoType, rotation: 0 as RotationIndex, x, y },
    noLineClear: true,
  }));
}

/**
 * Merge tetromino and monomino steps, sort bottom-up, and validate the combined
 * sequence against an empty board using `applyPlacementNoClear`.
 * Returns the ordered steps if valid, or null if any lock fails.
 */
function mergeAndValidate(
  target: Board,
  tetrominoSteps: ReplayStep[],
  monoSteps: ReplayStep[],
): ReplayStep[] | null {
  const { width, height } = getBoardDimensions(target);
  const allSteps = [...tetrominoSteps, ...monoSteps];

  // Sort by bottom cell of each piece (highest y first = bottom-up placement order).
  allSteps.sort((a, b) => {
    const aCells = getCells(a.placement.type, a.placement.rotation, a.placement.x, a.placement.y);
    const bCells = getCells(b.placement.type, b.placement.rotation, b.placement.x, b.placement.y);
    const aMaxY = Math.max(...aCells.map(([, cy]) => cy));
    const bMaxY = Math.max(...bCells.map(([, cy]) => cy));
    if (aMaxY !== bMaxY) return bMaxY - aMaxY;
    if (a.placement.x !== b.placement.x) return a.placement.x - b.placement.x;
    return 0;
  });

  const board = createEmptyBoard(width, height);
  for (const step of allSteps) {
    if (!isValidLock(board, step.placement)) return null;
    applyPlacementNoClear(board, step.placement);
  }

  if (!boardsEqual(board, target)) return null;
  return allSteps;
}

/**
 * Tile the target grass cells using tetrominoes and monominos.
 *
 * Strategy:
 * 1. If grass count is divisible by 4, try pure tetromino tiling.
 * 2. Otherwise, iteratively extract cells (top-first) as monominos until the
 *    remaining cells are tileable by tetrominoes.
 * 3. Combine tetromino and monomino steps, validate the merged sequence.
 * 4. If DFS-based tiling fails entirely, fall back to all-monomino placement.
 *
 * No trimming: the returned `trimmedBoard` always equals the original target,
 * ensuring the final animation matches the user's actual contribution history.
 */
export function tileTargetWithTrimming(
  target: Board,
  minDistinctTypes: number,
): TilingResult {
  const allGrass = grassCells(target);
  if (allGrass.length === 0) {
    return { steps: [], trimmedBoard: cloneBoard(target), trimmedCells: 0 };
  }

  const width = target[0]?.length ?? 0;
  const height = target.length;
  const mayUseExactCover =
    (width >= 8 || height >= 8) && allGrass.length <= TILING_EXACT_COVER_MAX_GRASS_CELLS;

  // --- Fast path: pure tetromino tiling ---
  if (mayUseExactCover && allGrass.length % 4 === 0) {
    const steps = tryTile(target, minDistinctTypes);
    if (steps) {
      return { steps, trimmedBoard: cloneBoard(target), trimmedCells: 0 };
    }
  }

  // --- Mixed path: extract cells as monominos until the rest is tileable ---
  const reduced = cloneBoard(target);
  const removedCells: [number, number][] = [];

  for (let i = 0; i < allGrass.length; i++) {
    const currentGrass = grassCells(reduced);
    if (currentGrass.length === 0) break;

    // Remove one cell (top-first = smallest y, then smallest x).
    currentGrass.sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]));
    const [rx, ry] = currentGrass[0];
    reduced[ry][rx] = 0;
    removedCells.push([rx, ry]);

    // Try tetromino tiling when the remaining count is divisible by 4.
    const remCount = grassCells(reduced).length;
    if (remCount === 0) break;
    if (remCount % 4 !== 0) continue;

    if (!mayUseExactCover || remCount > TILING_EXACT_COVER_MAX_GRASS_CELLS) continue;
    const tetrominoSteps = tryTile(reduced, 0);
    if (!tetrominoSteps || tetrominoSteps.length === 0) continue;

    // Build combined steps and validate.
    const monoSteps = buildMonominoSteps(removedCells);
    const merged = mergeAndValidate(target, tetrominoSteps, monoSteps);
    if (merged) {
      if (countDistinctTypes(merged) < minDistinctTypes) continue;
      return { steps: merged, trimmedBoard: cloneBoard(target), trimmedCells: 0 };
    }
  }

  // --- Fallback: all cells as monominos ---
  // Always succeeds because monominos have relaxed lock rules.
  const allMonoSteps = buildMonominoSteps(allGrass);
  // Sort bottom-up (highest y first).
  allMonoSteps.sort((a, b) => {
    if (a.placement.y !== b.placement.y) return b.placement.y - a.placement.y;
    return a.placement.x - b.placement.x;
  });
  const monoTypeCount = countDistinctTypes(allMonoSteps);
  if (monoTypeCount < minDistinctTypes) {
    throw new Error(
      `Could not tile target with required piece diversity: need >=${minDistinctTypes} types, got ${monoTypeCount}.`,
    );
  }

  const board = createEmptyBoard(width, height);
  for (const step of allMonoSteps) {
    if (!isValidLock(board, step.placement)) {
      throw new Error("Internal error: monomino lock validation failed.");
    }
    applyPlacementNoClear(board, step.placement);
  }
  if (!boardsEqual(board, target)) {
    throw new Error("Internal error: all-monomino fallback did not reproduce target.");
  }

  return { steps: allMonoSteps, trimmedBoard: cloneBoard(target), trimmedCells: 0 };
}
