import type { Board, ReplayScript, ReplayStep, TetrominoType } from "../domain/types.js";
import { assertDiversityPadValid, planDiversityPadAfterIntro } from "./diversityPad.js";
import { assertIntroValid, planScriptedDoubleClearIntro } from "./introClear.js";
import { tileTargetWithTrimming } from "./tetrominoTiling.js";

function countDistinctTypes(steps: ReplayStep[]): number {
  const s = new Set<TetrominoType>();
  for (const st of steps) s.add(st.placement.type);
  return s.size;
}

/**
 * Deterministic replay: O intro (line clears) + diversity pad (>=3 non-O types, line clear, back to empty)
 * + tetromino/monomino tiling of grass. Single cells that cannot be covered by tetrominoes are placed
 * as monominos so the final board exactly matches the original contribution mask (no trimming).
 */
export interface PlannedReplay {
  script: ReplayScript;
  /** Board the main phase builds; equals the original contribution mask (no trimming). */
  grassTarget: Board;
}

export function planDeterministicReplay(target: Board): PlannedReplay {
  const intro = planScriptedDoubleClearIntro();
  assertIntroValid(intro);
  const pad = planDiversityPadAfterIntro();
  assertDiversityPadValid(pad);

  const { steps: mainSteps, trimmedBoard } = tileTargetWithTrimming(target, 0);

  const all = [...intro, ...pad, ...mainSteps];
  if (countDistinctTypes(all) < 4) {
    throw new Error(`Shape diversity failed: only ${countDistinctTypes(all)} types in full replay.`);
  }

  return { script: { steps: all }, grassTarget: trimmedBoard };
}
