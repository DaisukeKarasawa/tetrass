import { applyPlacement, createEmptyBoard, isValidLock } from "../domain/board.js";
import type { ReplayStep } from "../domain/types.js";
import { BOARD_HEIGHT } from "../domain/types.js";

/**
 * Five O-tetrominoes on rows 18–19; the fifth lock clears two lines and leaves an empty board.
 */
export function planScriptedDoubleClearIntro(): ReplayStep[] {
  const steps: ReplayStep[] = [];
  for (const x of [0, 2, 4, 6, 8]) {
    steps.push({ placement: { type: "O", rotation: 0, x, y: BOARD_HEIGHT - 2 } });
  }
  return steps;
}

export function assertIntroValid(intro: ReplayStep[]): void {
  const board = createEmptyBoard();
  let totalClears = 0;
  for (const st of intro) {
    if (!isValidLock(board, st.placement)) {
      throw new Error(`Invalid intro lock: ${JSON.stringify(st.placement)}`);
    }
    totalClears += applyPlacement(board, st.placement).linesCleared;
  }
  if (totalClears !== 2) throw new Error("Intro must clear exactly two lines.");
  const empty = board.every((row) => row.every((c) => c === 0));
  if (!empty) throw new Error("Intro must end on an empty board.");
}
