import { getCells } from "./tetromino.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Board,
  type BoardDimensions,
  type Cell,
  type PiecePlacement,
} from "./types.js";

export function createEmptyBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT): Board {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 0 as Cell),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function getBoardDimensions(board: Board): BoardDimensions {
  const height = board.length;
  const width = height > 0 ? board[0].length : 0;
  return { width, height };
}

export function boardKey(board: Board): string {
  const { width, height } = getBoardDimensions(board);
  let s = `${width}x${height}:`;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s += board[y][x] ? "1" : "0";
    }
  }
  return s;
}

export function boardsEqual(a: Board, b: Board): boolean {
  return boardKey(a) === boardKey(b);
}

/** Clear full rows and apply gravity (standard Tetris). Returns number of lines cleared. */
export function clearFullRows(board: Board): number {
  const { width, height } = getBoardDimensions(board);
  let cleared = 0;
  const newRows: Cell[][] = [];
  for (let y = height - 1; y >= 0; y--) {
    const full = board[y].every((c) => c === 1);
    if (full) cleared++;
    else newRows.push([...board[y]]);
  }
  while (newRows.length < height) {
    newRows.push(Array.from({ length: width }, () => 0 as Cell));
  }
  newRows.reverse();
  for (let y = 0; y < height; y++) {
    board[y] = newRows[y];
  }
  return cleared;
}

export function countFilled(board: Board): number {
  const { width, height } = getBoardDimensions(board);
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (board[y][x]) n++;
  }
  return n;
}

function lockCellsOverlapStack(board: Board, cells: [number, number][]): { ok: boolean; reason?: string } {
  const { width, height } = getBoardDimensions(board);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      return { ok: false, reason: "out_of_bounds" };
    }
    if (board[cy][cx] === 1) return { ok: false, reason: "overlap" };
  }
  return { ok: true };
}

function pieceCanMoveDownOnBoard(board: Board, p: PiecePlacement): boolean {
  const { height } = getBoardDimensions(board);
  const cells = getCells(p.type, p.rotation, p.x, p.y + 1);
  for (const [cx, cy] of cells) {
    if (cy >= height) return false;
    if (cy < 0) continue;
    if (board[cy][cx] === 1) return false;
  }
  return true;
}

/**
 * Valid lock: in bounds, no overlap with stack, cannot move down (standard Tetris lock rule).
 * Monominos ("M") use a relaxed rule: in bounds + no overlap only (no gravity check),
 * because single cells may need to be placed at positions unreachable via straight drop.
 */
export function isValidLock(board: Board, p: PiecePlacement): boolean {
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  if (!lockCellsOverlapStack(board, cells).ok) return false;
  if (p.type === "M") return true;
  return !pieceCanMoveDownOnBoard(board, p);
}

export function applyPlacement(board: Board, p: PiecePlacement): { linesCleared: number } {
  const { width, height } = getBoardDimensions(board);
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
  return { linesCleared: clearFullRows(board) };
}

/** Place piece cells without clearing full rows (used during graph-building phase). */
export function applyPlacementNoClear(board: Board, p: PiecePlacement): void {
  const { width, height } = getBoardDimensions(board);
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
}
