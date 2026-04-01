import { describe, expect, it } from "vitest";
import { assertDiversityPadValid, planDiversityPadAfterIntro } from "./diversityPad.js";

describe("diversityPad", () => {
  it("finds a valid pad", () => {
    const pad = planDiversityPadAfterIntro();
    expect(pad.length).toBeGreaterThan(0);
    assertDiversityPadValid(pad);
  });
});
