import { describe, expect, it } from "vitest";

import { planScriptedDoubleClearIntro } from "../planner/introClear.js";
import { simulateReplayFast, simulateReplayForFrames } from "./simulateReplay.js";

describe("simulateReplayFast", () => {
  it("returns empty final board after valid intro script with two line clears", () => {
    const intro = planScriptedDoubleClearIntro();
    const r = simulateReplayFast({ steps: intro });
    expect(r.totalLineClears).toBe(2);
    expect(r.finalBoard.every((row) => row.every((c) => c === 0))).toBe(true);
    expect(r.usedTypes.has("O")).toBe(true);
    expect(r.frames).toEqual([]);
  });

  it("accepts empty script", () => {
    const r = simulateReplayFast({ steps: [] });
    expect(r.totalLineClears).toBe(0);
    expect(r.usedTypes.size).toBe(0);
  });

  it("throws on invalid lock", () => {
    expect(() =>
      simulateReplayFast({
        steps: [{ placement: { type: "O", rotation: 0, x: 0, y: 0 } }],
      }),
    ).toThrow(/Invalid lock placement/);
  });
});

describe("simulateReplayForFrames", () => {
  it("produces frames including drop animation for intro", () => {
    const intro = planScriptedDoubleClearIntro();
    const r = simulateReplayForFrames({ steps: intro });
    expect(r.frames.length).toBeGreaterThan(intro.length);
    expect(r.totalLineClears).toBe(2);
    expect(r.finalBoard.every((row) => row.every((c) => c === 0))).toBe(true);
    expect(r.frames[0].active).toBeNull();
    expect(r.frames.some((f) => f.active !== null)).toBe(true);
  });

  it("throws on invalid lock like simulateReplayFast", () => {
    expect(() =>
      simulateReplayForFrames({
        steps: [{ placement: { type: "O", rotation: 0, x: 0, y: 0 } }],
      }),
    ).toThrow(/Invalid lock placement/);
  });
});
