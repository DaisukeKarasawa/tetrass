import { describe, expect, it } from "vitest";

import { createEmptyBoard } from "../domain/board.js";
import type { Board } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";
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

  it("only accepts tilings whose replay ends on the target grass (line clears included)", () => {
    const twoFullRows = createEmptyBoard();
    for (let y = BOARD_HEIGHT - 2; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) twoFullRows[y][x] = 1;
    }

    const { steps, trimmedBoard } = tileTargetWithTrimming(twoFullRows, 0);
    const replay = simulateReplayFast({ steps });
    expect(replay.finalBoard).toEqual(trimmedBoard);
    expect(trimmedBoard).not.toEqual(twoFullRows);
  });

  it("rejects solutions that discard every grass cell when the input had contributions", () => {
    const target = boardFromCoords([[0, 0]]);
    expect(() => tileTargetWithTrimming(target, 0)).toThrow(/discarding all grass cells/i);
  });
});
