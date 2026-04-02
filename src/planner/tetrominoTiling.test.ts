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
    const oneFullRow = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) oneFullRow[BOARD_HEIGHT - 1][x] = 1;

    const { steps, trimmedBoard } = tileTargetWithTrimming(oneFullRow, 0);
    const replay = simulateReplayFast({ steps });
    expect(replay.finalBoard).toEqual(trimmedBoard);
    expect(trimmedBoard).not.toEqual(oneFullRow);
  });

  it("rejects solutions that discard every grass cell when the input had contributions", () => {
    const target = boardFromCoords([[0, 0]]);
    expect(() => tileTargetWithTrimming(target, 0)).toThrow(/discarding all grass cells/i);
  });

  it("fails when trimming would keep too little of a non-trivial target", () => {
    const full = createEmptyBoard();
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) full[y][x] = 1;
    }
    expect(() => tileTargetWithTrimming(full, 0)).toThrow(/acceptable retention/i);
  });

  it("does not apply retention guard to very small targets", () => {
    const target = boardFromCoords([
      [0, 18],
      [1, 18],
      [0, 19],
      [1, 19],
      [2, 18],
    ]);
    const { trimmedBoard } = tileTargetWithTrimming(target, 0);
    let grass = 0;
    for (const row of trimmedBoard) {
      for (const c of row) if (c) grass++;
    }
    expect(grass).toBeGreaterThan(0);
  });
});
