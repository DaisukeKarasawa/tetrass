export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L" | "M";

export type Cell = 0 | 1;

export type Board = Cell[][];

export interface BoardDimensions {
  width: number;
  height: number;
}

export type RotationIndex = 0 | 1 | 2 | 3;

export interface PiecePlacement {
  type: TetrominoType;
  rotation: RotationIndex;
  /** Leftmost column of the piece bounding box in playfield coordinates. */
  x: number;
  /** Top row of the piece bounding box in playfield coordinates. */
  y: number;
}

export interface ReplayStep {
  placement: PiecePlacement;
  /** When true, line clears are suppressed for this step (used during graph-building phase). */
  noLineClear?: boolean;
}

export interface ReplayScript {
  steps: ReplayStep[];
  /** Optional board width for dynamic layouts (defaults to BOARD_WIDTH when omitted). */
  boardWidth?: number;
  /** Optional board height for dynamic layouts (defaults to BOARD_HEIGHT when omitted). */
  boardHeight?: number;
}
