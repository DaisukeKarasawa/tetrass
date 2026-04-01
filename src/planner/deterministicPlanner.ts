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
 * + exact tetromino tiling of grass. If the raw mask is not tileable, trim grass from the top until tileable.
 */
export interface PlannedReplay {
  script: ReplayScript;
  /** Board the main phase builds; may be a trimmed subset of the raw contribution mask. */
  grassTarget: Board;
}

export function planDeterministicReplay(target: Board): PlannedReplay {
  const intro = planScriptedDoubleClearIntro();
  assertIntroValid(intro);
  const pad = planDiversityPadAfterIntro();
  assertDiversityPadValid(pad);

  const { steps: mainSteps, trimmedBoard, trimmedCells } = tileTargetWithTrimming(target, 0);

  if (trimmedCells > 0) {
    console.warn(
      `Contribution mask trimmed ${trimmedCells} cell(s) (top-first) so tetromino tiling is possible.`,
    );
  }

  const all = [...intro, ...pad, ...mainSteps];
  if (countDistinctTypes(all) < 4) {
    throw new Error(`Shape diversity failed: only ${countDistinctTypes(all)} types in full replay.`);
  }

  return { script: { steps: all }, grassTarget: trimmedBoard };
}
