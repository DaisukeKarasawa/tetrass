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

  it("tiles a full row using noLineClear so the final board matches the target exactly", () => {
    const oneFullRow = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) oneFullRow[BOARD_HEIGHT - 1][x] = 1;

    const { steps, trimmedBoard } = tileTargetWithTrimming(oneFullRow, 0);
    const replay = simulateReplayFast({ steps });
    // With noLineClear, the full row stays intact and trimmedBoard equals the original target.
    expect(replay.finalBoard).toEqual(trimmedBoard);
    expect(trimmedBoard).toEqual(oneFullRow);
  });

  it("handles a single isolated cell via monomino (no trimming)", () => {
    const target = boardFromCoords([[0, 0]]);
    const { steps, trimmedBoard } = tileTargetWithTrimming(target, 0);
    expect(steps.length).toBe(1);
    expect(steps[0].placement.type).toBe("M");
    const replay = simulateReplayFast({ steps });
    expect(replay.finalBoard).toEqual(trimmedBoard);
    expect(trimmedBoard).toEqual(target);
  });

  it("tiles a fully filled board using monominos without error", () => {
    const full = createEmptyBoard();
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) full[y][x] = 1;
    }
    const { steps, trimmedBoard } = tileTargetWithTrimming(full, 0);
    expect(steps.length).toBeGreaterThan(0);
    const replay = simulateReplayFast({ steps });
    expect(replay.finalBoard).toEqual(trimmedBoard);
    expect(trimmedBoard).toEqual(full);
  });

  it("handles small targets with odd cell counts using monominos", () => {
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
    // All 5 cells are preserved (no trimming).
    expect(grass).toBe(5);
    expect(trimmedBoard).toEqual(target);
  });

  it("uses a mix of tetrominoes and monominos for non-divisible-by-4 targets", () => {
    // 5 cells: should produce 1 tetromino + 1 monomino (or 5 monominos)
    const target = boardFromCoords([
      [0, 18],
      [1, 18],
      [0, 19],
      [1, 19],
      [2, 19],
    ]);
    const { steps, trimmedBoard } = tileTargetWithTrimming(target, 0);
    expect(steps.length).toBeGreaterThan(0);
    const hasMono = steps.some((s) => s.placement.type === "M");
    expect(hasMono).toBe(true);
    const replay = simulateReplayFast({ steps });
    expect(replay.finalBoard).toEqual(trimmedBoard);
    expect(trimmedBoard).toEqual(target);
  });
});
