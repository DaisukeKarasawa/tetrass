import { boardsEqual } from "../domain/board.js";
import type { Board } from "../domain/types.js";

export function assertFinalMatchesTarget(finalBoard: Board, target: Board): void {
  if (!boardsEqual(finalBoard, target)) {
    throw new Error("Final board does not match target grass board.");
  }
}
