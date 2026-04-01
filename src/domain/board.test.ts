import { describe, expect, it } from "vitest";
import { applyPlacement, clearFullRows, createEmptyBoard } from "./board.js";
import type { PiecePlacement } from "./types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "./types.js";

describe("clearFullRows", () => {
  it("clears a full row and drops blocks above", () => {
    const b = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) b[BOARD_HEIGHT - 1][x] = 1;
    b[BOARD_HEIGHT - 2][0] = 1;
    const n = clearFullRows(b);
    expect(n).toBe(1);
    expect(b[BOARD_HEIGHT - 1][0]).toBe(1);
    for (let x = 1; x < BOARD_WIDTH; x++) expect(b[BOARD_HEIGHT - 1][x]).toBe(0);
  });
});

describe("applyPlacement", () => {
  it("locks I flat on bottom and clears one line", () => {
    const b = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (x < 3 || x > 6) b[BOARD_HEIGHT - 1][x] = 1;
    }
    const p: PiecePlacement = { type: "I", rotation: 0, x: 3, y: BOARD_HEIGHT - 2 };
    const { linesCleared } = applyPlacement(b, p);
    expect(linesCleared).toBe(1);
    for (let x = 0; x < BOARD_WIDTH; x++) expect(b[BOARD_HEIGHT - 1][x]).toBe(0);
  });
});
