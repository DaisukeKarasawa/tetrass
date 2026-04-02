import { getCells } from "./tetromino.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Board,
  type Cell,
  type PiecePlacement,
} from "./types.js";

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => 0 as Cell),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function boardKey(board: Board): string {
  let s = "";
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
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
  let cleared = 0;
  const newRows: Cell[][] = [];
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    const full = board[y].every((c) => c === 1);
    if (full) cleared++;
    else newRows.push([...board[y]]);
  }
  while (newRows.length < BOARD_HEIGHT) {
    newRows.push(Array.from({ length: BOARD_WIDTH }, () => 0 as Cell));
  }
  newRows.reverse();
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    board[y] = newRows[y];
  }
  return cleared;
}

export function countFilled(board: Board): number {
  let n = 0;
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) if (board[y][x]) n++;
  }
  return n;
}

function lockCellsOverlapStack(board: Board, cells: [number, number][]): { ok: boolean; reason?: string } {
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
      return { ok: false, reason: "out_of_bounds" };
    }
    if (board[cy][cx] === 1) return { ok: false, reason: "overlap" };
  }
  return { ok: true };
}

function pieceCanMoveDownOnBoard(board: Board, p: PiecePlacement): boolean {
  const cells = getCells(p.type, p.rotation, p.x, p.y + 1);
  for (const [cx, cy] of cells) {
    if (cy >= BOARD_HEIGHT) return false;
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
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
  return { linesCleared: clearFullRows(board) };
}

/** Place piece cells without clearing full rows (used during graph-building phase). */
export function applyPlacementNoClear(board: Board, p: PiecePlacement): void {
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
}
