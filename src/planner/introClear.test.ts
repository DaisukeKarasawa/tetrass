import { describe, expect, it } from "vitest";

import { assertIntroValid, planScriptedDoubleClearIntro } from "./introClear.js";

describe("introClear", () => {
  it("builds a deterministic line-clear prelude", () => {
    const steps = planScriptedDoubleClearIntro();
    expect(steps.length).toBeGreaterThanOrEqual(10);
    expect(steps.some((s) => s.placement.type === "I")).toBe(true);
    expect(steps.some((s) => s.placement.type === "M")).toBe(true);
  });

  it("assertIntroValid accepts the planned intro", () => {
    expect(() => assertIntroValid(planScriptedDoubleClearIntro())).not.toThrow();
  });

  it("assertIntroValid rejects an empty script", () => {
    expect(() => assertIntroValid([])).toThrow(/Intro must clear at least one line/);
  });

  it("plans a monomino-only line-clear intro on small boards", () => {
    const steps = planScriptedDoubleClearIntro(5, 7);
    expect(steps).toHaveLength(7);
    expect(steps.slice(0, 5).every((s) => s.placement.type === "M")).toBe(true);
    expect(steps[5].placement.type).toBe("I");
    expect(steps[6].placement.type).toBe("M");
    expect(steps[5].placement.y).toBe(5);
    expect(steps[6].placement.y).toBe(6);
    expect(steps.slice(0, 5).every((s) => s.placement.y === 6)).toBe(true);
    expect(() => assertIntroValid(steps, 5, 7)).not.toThrow();
  });
});
