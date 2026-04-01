import type { ReplayStep } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";
import { simulateReplayFast } from "../simulator/simulateReplay.js";

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
  const r = simulateReplayFast({ steps: intro });
  if (r.totalLineClears < 1) throw new Error("Intro must perform at least one line clear.");
  const empty = r.finalBoard.every((row) => row.every((c) => c === 0));
  if (!empty) throw new Error("Intro must end on an empty board.");
}
