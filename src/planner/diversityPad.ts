import { applyPlacement, createEmptyBoard, isValidLock } from "../domain/board.js";
import { BOARD_HEIGHT, type ReplayStep } from "../domain/types.js";

function defaultEmbeddedPad(boardHeight: number): ReplayStep[] {
  /** Bottom band of the pad (same row index idea as `planScriptedDoubleClearIntro` O locks). */
  const yLow = boardHeight - 2;
  /** One row above `yLow` (piece bounding-box top Y). */
  const yHigh = boardHeight - 3;
  /**
   * Precomputed sequence (empty board -> line clear(s) -> empty) using I, J, L.
   * Together with the intro and main phases, the full replay can satisfy diversity goals.
   */
  return [
    { placement: { type: "I", rotation: 0, x: 0, y: yLow } },
    { placement: { type: "I", rotation: 0, x: 0, y: yHigh } },
    { placement: { type: "I", rotation: 0, x: 5, y: yLow } },
    { placement: { type: "J", rotation: 2, x: 7, y: yHigh } },
    { placement: { type: "L", rotation: 2, x: 4, y: yHigh } },
  ];
}

export function planDiversityPadAfterIntro(
  boardWidth = 10,
  boardHeight = BOARD_HEIGHT,
): ReplayStep[] {
  // Use the deterministic diversity pad on sufficiently large boards.
  // Requirements:
  // - width >= 10 so fixed x positions fit safely
  // - height >= 3 so yHigh/yLow rows exist
  if (boardWidth >= 10 && boardHeight >= 3) {
    return defaultEmbeddedPad(boardHeight).map((step) => ({ placement: { ...step.placement } }));
  }
  // Intro already guarantees line clear + mixed types for non-canonical boards.
  return [];
}

export function assertDiversityPadValid(
  pad: ReplayStep[],
  boardWidth = 10,
  boardHeight = BOARD_HEIGHT,
): void {
  if (pad.length === 0) return;
  let b = createEmptyBoard(boardWidth, boardHeight);
  let clears = 0;
  const nonO = new Set<string>();
  for (const st of pad) {
    if (!isValidLock(b, st.placement)) {
      throw new Error(`Invalid pad lock: ${JSON.stringify(st.placement)}`);
    }
    clears += applyPlacement(b, st.placement).linesCleared;
    if (st.placement.type !== "O") nonO.add(st.placement.type);
  }
  const emptyEnd = b.every((row) => row.every((c) => c === 0));
  if (!emptyEnd) throw new Error("Diversity pad must end empty.");
  if (clears < 1) throw new Error("Diversity pad must clear at least one line.");
  if (nonO.size < 3) throw new Error("Diversity pad must use at least 3 non-O tetromino types.");
}
