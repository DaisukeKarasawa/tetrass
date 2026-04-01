import { applyPlacement, createEmptyBoard, isValidLock } from "../domain/board.js";
import { BOARD_HEIGHT, type ReplayStep } from "../domain/types.js";

/** Bottom band of the pad (same row index idea as `planScriptedDoubleClearIntro` O locks). */
const DIVERSITY_PAD_Y_LOW = BOARD_HEIGHT - 2;
/** One row above `DIVERSITY_PAD_Y_LOW` (piece bounding-box top Y). */
const DIVERSITY_PAD_Y_HIGH = BOARD_HEIGHT - 3;

/**
 * Precomputed sequence (empty board -> line clear(s) -> empty) using I, J, L.
 * Together with the all-O intro, the full prefix uses 4+ tetromino types.
 */
const EMBEDDED_PAD: ReplayStep[] = [
  { placement: { type: "I", rotation: 0, x: 0, y: DIVERSITY_PAD_Y_LOW } },
  { placement: { type: "I", rotation: 0, x: 0, y: DIVERSITY_PAD_Y_HIGH } },
  { placement: { type: "I", rotation: 0, x: 5, y: DIVERSITY_PAD_Y_LOW } },
  { placement: { type: "J", rotation: 2, x: 7, y: DIVERSITY_PAD_Y_HIGH } },
  { placement: { type: "L", rotation: 2, x: 4, y: DIVERSITY_PAD_Y_HIGH } },
];

export function planDiversityPadAfterIntro(): ReplayStep[] {
  return EMBEDDED_PAD.map((step) => ({ placement: { ...step.placement } }));
}

export function assertDiversityPadValid(pad: ReplayStep[]): void {
  let b = createEmptyBoard();
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
