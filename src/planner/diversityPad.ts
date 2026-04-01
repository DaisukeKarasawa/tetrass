import { applyPlacement, cloneBoard } from "../domain/board.js";
import { isValidLock } from "../simulator/simulateReplay.js";
import type { ReplayStep } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";

/**
 * Precomputed sequence (empty board -> line clear(s) -> empty) using I, J, L.
 * Together with the all-O intro, the full prefix uses 4+ tetromino types.
 */
const EMBEDDED_PAD: ReplayStep[] = [
  { placement: { type: "I", rotation: 0, x: 0, y: 18 } },
  { placement: { type: "I", rotation: 0, x: 0, y: 17 } },
  { placement: { type: "I", rotation: 0, x: 5, y: 18 } },
  { placement: { type: "J", rotation: 2, x: 7, y: 17 } },
  { placement: { type: "L", rotation: 2, x: 4, y: 17 } },
];

export function planDiversityPadAfterIntro(): ReplayStep[] {
  return EMBEDDED_PAD;
}

export function assertDiversityPadValid(pad: ReplayStep[]): void {
  const empty = Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => 0 as 0 | 1),
  );
  let b = cloneBoard(empty);
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
