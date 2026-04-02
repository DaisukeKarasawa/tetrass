import type { RotationIndex, TetrominoType } from "./types.js";

/** Relative offsets from piece origin (top-left of bounding box) for each rotation. */
const SHAPES: Record<TetrominoType, readonly (readonly (readonly [number, number])[])[]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  M: [
    [[0, 0]],
    [[0, 0]],
    [[0, 0]],
    [[0, 0]],
  ],
};

const TYPE_ORDER: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export function getCells(
  type: TetrominoType,
  rotation: RotationIndex,
  x: number,
  y: number,
): [number, number][] {
  const rot = rotation;
  return SHAPES[type][rot].map(([dx, dy]) => [x + dx, y + dy] as [number, number]);
}

export function getBoundingHeight(type: TetrominoType, rotation: RotationIndex): number {
  const cells = SHAPES[type][rotation];
  let maxY = 0;
  for (const [, dy] of cells) maxY = Math.max(maxY, dy);
  return maxY + 1;
}

export function getBoundingWidth(type: TetrominoType, rotation: RotationIndex): number {
  const cells = SHAPES[type][rotation];
  let maxX = 0;
  for (const [dx] of cells) maxX = Math.max(maxX, dx);
  return maxX + 1;
}

export function iterateTypesInOrder(): TetrominoType[] {
  return [...TYPE_ORDER];
}

export const ROTATIONS: RotationIndex[] = [0, 1, 2, 3];
