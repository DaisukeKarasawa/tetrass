import { describe, expect, it } from "vitest";

import { GROUP_COLUMN_COUNTS, type GroupIndex } from "../domain/grass.js";
import { OVERVIEW_GRASS_COORDS_BY_GROUP, localGrassToAbsolute, specAbsoluteKeysForGroup } from "./overviewGrassCoords.js";

describe("overviewGrassCoords", () => {
  it("lists nine bands matching GROUP_COLUMN_COUNTS widths", () => {
    expect(OVERVIEW_GRASS_COORDS_BY_GROUP).toHaveLength(9);
    for (let gi = 0; gi < 9; gi++) {
      const w = GROUP_COLUMN_COUNTS[gi]!;
      for (const [col, row] of OVERVIEW_GRASS_COORDS_BY_GROUP[gi]!) {
        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(w);
        expect(row).toBeGreaterThanOrEqual(1);
        expect(row).toBeLessThanOrEqual(7);
      }
    }
  });

  it("maps local coords into unique absolute cells per band", () => {
    for (let gi = 0; gi < 9; gi++) {
      const g = gi as GroupIndex;
      const keys = specAbsoluteKeysForGroup(g);
      const coords = OVERVIEW_GRASS_COORDS_BY_GROUP[g]!;
      expect(keys.size).toBe(coords.length);
      for (const [c, r] of coords) {
        const { x, y } = localGrassToAbsolute(g, c, r);
        expect(keys.has(`${x},${y}`)).toBe(true);
      }
    }
  });
});
