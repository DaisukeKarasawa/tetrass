import type { Board, ReplayScript, ReplayStep, TetrominoType } from "../domain/types.js";
import { getBoardDimensions } from "../domain/board.js";
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
  const { width, height } = getBoardDimensions(target);
  const intro = planScriptedDoubleClearIntro(width, height);
  const introTypeCount = countDistinctTypes(intro);
  assertIntroValid(intro, width, height);
  const pad = planDiversityPadAfterIntro(width, height);
  assertDiversityPadValid(pad, width, height);

  // Diversity target: canonical 10x20 requires >=4; smaller boards allow >=2.
  const minDistinctTypes = width >= 10 && height >= 20 ? 4 : 2;
  const minDistinctTypesFromMain = Math.max(0, minDistinctTypes - introTypeCount);
  const { steps: mainSteps, trimmedBoard } = tileTargetWithTrimming(target, minDistinctTypesFromMain);

  const all = [...intro, ...pad, ...mainSteps];
  if (countDistinctTypes(all) < minDistinctTypes) {
    throw new Error(`Shape diversity failed: only ${countDistinctTypes(all)} types in full replay.`);
  }

  const script: ReplayScript = { steps: all, boardWidth: width, boardHeight: height };
  return { script, grassTarget: trimmedBoard };
}
