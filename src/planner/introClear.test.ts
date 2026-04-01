import { describe, expect, it } from "vitest";

import { BOARD_HEIGHT } from "../domain/types.js";
import { assertIntroValid, planScriptedDoubleClearIntro } from "./introClear.js";

describe("introClear", () => {
  it("plans five O locks on rows 18–19", () => {
    const steps = planScriptedDoubleClearIntro();
    expect(steps).toHaveLength(5);
    for (const st of steps) {
      expect(st.placement.type).toBe("O");
      expect(st.placement.rotation).toBe(0);
      expect(st.placement.y).toBe(BOARD_HEIGHT - 2);
    }
    expect(steps.map((s) => s.placement.x)).toEqual([0, 2, 4, 6, 8]);
  });

  it("assertIntroValid accepts the planned intro", () => {
    expect(() => assertIntroValid(planScriptedDoubleClearIntro())).not.toThrow();
  });

  it("assertIntroValid rejects an empty script", () => {
    expect(() => assertIntroValid([])).toThrow(/Intro must clear exactly two lines/);
  });
});
