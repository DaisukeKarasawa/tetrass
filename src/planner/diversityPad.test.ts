import { describe, expect, it } from "vitest";
import { assertDiversityPadValid, planDiversityPadAfterIntro } from "./diversityPad.js";

describe("diversityPad", () => {
  it("returns deterministic legacy pad on canonical board", () => {
    const pad = planDiversityPadAfterIntro();
    expect(pad.length).toBeGreaterThan(0);
    assertDiversityPadValid(pad);
  });

  it("returns empty pad on small boards", () => {
    const pad = planDiversityPadAfterIntro(7, 7);
    expect(pad).toEqual([]);
    expect(() => assertDiversityPadValid(pad, 7, 7)).not.toThrow();
  });
});
