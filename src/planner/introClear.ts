import { applyPlacement, createEmptyBoard, isValidLock } from "../domain/board.js";
import type { ReplayStep } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";

/**
 * Deterministic line-clear prelude that works on any board:
 * 1) Fill the last row with monominos (guarantees at least one clear).
 * 2) Fill the last row again with horizontal I pieces + monomino remainder.
 * This guarantees an empty-board end state and mixed piece classes on wide boards.
 */
export function planScriptedDoubleClearIntro(
  boardWidth = BOARD_WIDTH,
  boardHeight = BOARD_HEIGHT,
): ReplayStep[] {
  if (boardWidth <= 0 || boardHeight <= 0) return [];
  const y = boardHeight - 1;
  const steps: ReplayStep[] = [];

  // Phase 1: force one clean line clear with monominos.
  for (let x = 0; x < boardWidth; x++) {
    steps.push({ placement: { type: "M", rotation: 0, x, y } });
  }

  // Phase 2: another clear using tetrominoes when possible.
  if (boardHeight >= 2) {
    const tetroY = boardHeight - 2;
    let x = 0;
    while (x + 3 < boardWidth) {
      steps.push({ placement: { type: "I", rotation: 0, x, y: tetroY } });
      x += 4;
    }
    for (; x < boardWidth; x++) {
      steps.push({ placement: { type: "M", rotation: 0, x, y } });
    }
  }
  return steps;
}

export function assertIntroValid(
  intro: ReplayStep[],
  boardWidth = BOARD_WIDTH,
  boardHeight = BOARD_HEIGHT,
): void {
  const board = createEmptyBoard(boardWidth, boardHeight);
  let totalClears = 0;
  for (const st of intro) {
    if (!isValidLock(board, st.placement)) {
      throw new Error(`Invalid intro lock: ${JSON.stringify(st.placement)}`);
    }
    totalClears += applyPlacement(board, st.placement).linesCleared;
  }
  if (totalClears < 1) throw new Error("Intro must clear at least one line.");
  const empty = board.every((row) => row.every((c) => c === 0));
  if (!empty) throw new Error("Intro must end on an empty board.");
}
