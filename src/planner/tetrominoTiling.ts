import { getCells } from "../domain/tetromino.js";
import { iterateTypesInOrder, ROTATIONS } from "../domain/tetromino.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Board,
  type PiecePlacement,
  type ReplayStep,
  type TetrominoType,
} from "../domain/types.js";

const TYPE_ORDER = iterateTypesInOrder();

/** All normalized placements: anchor at (0,0) min corner; list of [dx,dy] within bounding box. */
function normalizedShapeCells(type: TetrominoType, rotation: 0 | 1 | 2 | 3): [number, number][] {
  const raw = getCells(type, rotation, 0, 0);
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of raw) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  return raw.map(([x, y]) => [x - minX, y - minY] as [number, number]);
}

export interface TilingResult {
  steps: ReplayStep[];
  trimmedBoard: Board;
  trimmedCells: number;
}

function cloneBoard(b: Board): Board {
  return b.map((row) => [...row]);
}

function grassCells(board: Board): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board[y][x]) out.push([x, y]);
    }
  }
  return out;
}

function buildOptionsForTarget(target: Board): Map<string, PiecePlacement[]> {
  const grass = new Set(grassCells(target).map(([x, y]) => `${x},${y}`));
  const options = new Map<string, PiecePlacement[]>();

  for (const type of TYPE_ORDER) {
    for (const rotation of ROTATIONS) {
      const rel = normalizedShapeCells(type, rotation);
      for (let ax = 0; ax < BOARD_WIDTH; ax++) {
        for (let ay = -4; ay < BOARD_HEIGHT; ay++) {
          const abs: [number, number][] = rel.map(([dx, dy]) => [ax + dx, ay + dy] as [number, number]);
          let ok = true;
          for (const [cx, cy] of abs) {
            if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
              ok = false;
              break;
            }
            if (!grass.has(`${cx},${cy}`)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const p: PiecePlacement = { type, rotation, x: ax, y: ay };
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

function tryTile(target: Board, minDistinctTypes: number): ReplayStep[] | null {
  const grass = grassCells(target);
  if (grass.length === 0) return minDistinctTypes === 0 ? [] : null;
  if (grass.length % 4 !== 0) return null;

  const optionsByCell = buildOptionsForTarget(target);
  const filled = new Set<string>();
  const usedPlacements: PiecePlacement[] = [];
  const typeUsed = new Set<TetrominoType>();

  function pickNextCell(): [number, number] | null {
    let best: [number, number] | null = null;
    for (const [x, y] of grass) {
      const k = `${x},${y}`;
      if (filled.has(k)) continue;
      if (!best) {
        best = [x, y];
        continue;
      }
      if (y < best[1] || (y === best[1] && x < best[0])) best = [x, y];
    }
    return best;
  }

  function dfs(): boolean {
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
        if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT || !target[cy][cx]) {
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
  return usedPlacements.map((placement) => ({ placement }));
}

/**
 * Exact tetromino tiling of grass cells. If unsolvable, trim grass from top rows (small y first)
 * until solvable or empty.
 */
export function tileTargetWithTrimming(
  target: Board,
  minDistinctTypes: number,
): TilingResult {
  let trimmed = cloneBoard(target);
  let trimmedCells = 0;
  const maxGrass = BOARD_WIDTH * BOARD_HEIGHT;

  for (let attempt = 0; attempt <= maxGrass; attempt++) {
    const steps = tryTile(trimmed, minDistinctTypes);
    if (steps) {
      return { steps, trimmedBoard: trimmed, trimmedCells };
    }
    const cells = grassCells(trimmed);
    if (cells.length === 0) break;
    cells.sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]));
    const [rx, ry] = cells[0];
    trimmed[ry][rx] = 0;
    trimmedCells++;
  }

  throw new Error(
    "Could not tile target (even after trimming) with the required tetromino type diversity. Try a sparser contribution grid.",
  );
}
