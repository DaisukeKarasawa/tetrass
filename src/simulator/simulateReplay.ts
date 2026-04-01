import { applyPlacement, cloneBoard, createEmptyBoard, isValidLock } from "../domain/board.js";
import { getCells } from "../domain/tetromino.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Board,
  type PiecePlacement,
  type ReplayScript,
} from "../domain/types.js";

/** Spawn Y offset so every mino starts above row 0 (drop animation enters from above the well). */
const SPAWN_ROWS_ABOVE_LOCK = 24;

/** Upper bound on sampled Y steps per piece during soft-drop animation (excluding lock frames). */
const MAX_SOFT_DROP_SAMPLE_STEPS = 8;

function placementFits(board: Board, cells: [number, number][]): boolean {
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH) return false;
    if (cy >= BOARD_HEIGHT) return false;
    if (cy >= 0 && board[cy][cx] === 1) return false;
  }
  return true;
}

export interface SimulationFrame {
  board: Board;
  /** Active piece during drop animation; null when locked. */
  active: PiecePlacement | null;
  linesClearedThisLock: number;
}

export interface SimulationResult {
  frames: SimulationFrame[];
  finalBoard: Board;
  totalLineClears: number;
  usedTypes: Set<string>;
}

/** Spawn well above the lock row so all cells start above the visible board. */
function spawnAboveLock(p: PiecePlacement): PiecePlacement {
  return { ...p, y: p.y - SPAWN_ROWS_ABOVE_LOCK };
}

function dropStride(dropRows: number): number {
  if (dropRows <= 0) return 1;
  return Math.max(1, Math.ceil(dropRows / MAX_SOFT_DROP_SAMPLE_STEPS));
}

/**
 * Expand replay into frames for SVG: sampled soft-drop (bounded frames per piece) + lock + post-lock board.
 */
export function simulateReplayForFrames(script: ReplayScript): SimulationResult {
  const board = createEmptyBoard();
  const frames: SimulationFrame[] = [];
  let totalLineClears = 0;
  const usedTypes = new Set<string>();

  frames.push({ board: cloneBoard(board), active: null, linesClearedThisLock: 0 });

  for (const step of script.steps) {
    const lock = step.placement;
    usedTypes.add(lock.type);
    if (!isValidLock(board, lock)) {
      throw new Error(`Invalid lock placement: ${JSON.stringify(lock)}`);
    }

    let current: PiecePlacement = spawnAboveLock(lock);
    const targetY = lock.y;
    const stride = dropStride(targetY - current.y);

    frames.push({ board: cloneBoard(board), active: current, linesClearedThisLock: 0 });

    while (current.y < targetY) {
      const nextY = Math.min(targetY, current.y + stride);
      const next = { ...current, y: nextY };
      const cells = getCells(next.type, next.rotation, next.x, next.y);
      if (!placementFits(board, cells)) break;
      current = next;
      if (current.y < targetY) {
        frames.push({ board: cloneBoard(board), active: current, linesClearedThisLock: 0 });
      }
    }

    while (current.y < targetY) {
      const next = { ...current, y: current.y + 1 };
      const cells = getCells(next.type, next.rotation, next.x, next.y);
      if (!placementFits(board, cells)) break;
      current = next;
    }

    if (current.x !== lock.x || current.y !== lock.y || current.rotation !== lock.rotation) {
      throw new Error(
        `Drop did not reach lock: got ${JSON.stringify(current)} want ${JSON.stringify(lock)}`,
      );
    }

    frames.push({ board: cloneBoard(board), active: current, linesClearedThisLock: 0 });

    const { linesCleared } = applyPlacement(board, lock);
    totalLineClears += linesCleared;

    frames.push({
      board: cloneBoard(board),
      active: null,
      linesClearedThisLock: linesCleared,
    });
  }

  return { frames, finalBoard: board, totalLineClears, usedTypes };
}

/** Fast path: apply script without per-frame expansion (verification). */
export function simulateReplayFast(script: ReplayScript): SimulationResult {
  const board = createEmptyBoard();
  let totalLineClears = 0;
  const usedTypes = new Set<string>();
  for (const step of script.steps) {
    usedTypes.add(step.placement.type);
    if (!isValidLock(board, step.placement)) {
      throw new Error(`Invalid lock placement: ${JSON.stringify(step.placement)}`);
    }
    totalLineClears += applyPlacement(board, step.placement).linesCleared;
  }
  return { frames: [], finalBoard: board, totalLineClears, usedTypes };
}
