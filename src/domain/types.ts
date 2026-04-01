export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export type Cell = 0 | 1;

export type Board = Cell[][];

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
}

export interface ReplayScript {
  steps: ReplayStep[];
}
