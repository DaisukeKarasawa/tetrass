import { describe, expect, it } from "vitest";

import { createEmptyBoard } from "../domain/board.js";
import type { Board } from "../domain/types.js";
import { simulateReplayFast } from "../simulator/simulateReplay.js";
import { tileTargetWithTrimming } from "./tetrominoTiling.js";

function boardFromCoords(coords: Array<[number, number]>): Board {
  const b = createEmptyBoard();
  for (const [x, y] of coords) {
    b[y][x] = 1;
  }
  return b;
}

describe("tileTargetWithTrimming", () => {
  it("returns replay steps that are lock-valid in sequence", () => {
    const target = boardFromCoords([
      [0, 18],
      [1, 18],
      [0, 19],
      [1, 19],
      [2, 18],
      [3, 18],
      [2, 19],
      [3, 19],
    ]);

    const { steps, trimmedBoard } = tileTargetWithTrimming(target, 0);
    expect(steps.length).toBeGreaterThan(0);

    const replay = simulateReplayFast({ steps });
    expect(replay.finalBoard).toEqual(trimmedBoard);
  });
});
