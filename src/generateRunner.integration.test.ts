import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./io/contributions.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./io/contributions.js")>();
  return {
    ...mod,
    fetchContributionCalendar: vi.fn(() =>
      Promise.resolve({
        weeks: [{ contributionDays: mod.buildSampleContributionDays() }],
      }),
    ),
  };
});

import { buildSampleContributionDays, fetchContributionCalendar } from "./io/contributions.js";
import { planAndVerifyReplay, runTetrassGenerate } from "./generateRunner.js";
import {
  assertSvgFinalBoardMatchesTarget,
  summarizeSvgReplay,
} from "./verify/svgFinalStateMatcher.js";

describe("runTetrassGenerate (integration)", () => {
  beforeEach(() => {
    vi.mocked(fetchContributionCalendar).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes an SVG when useSample is true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tetrass-int-"));
    const out = join(dir, "out.svg");
    await runTetrassGenerate({
      login: "octocat",
      useSample: true,
      outputs: [{ filePath: out, palette: "light" }],
      workspaceRoot: dir,
    });
    const text = await readFile(out, "utf8");
    expect(text).toContain("<svg");
    expect(text).toContain("Tetrass");
    expect(text).toContain('href="#cG"');
    const { grassTarget, fast } = planAndVerifyReplay(buildSampleContributionDays());
    expect(() => assertSvgFinalBoardMatchesTarget(text, grassTarget)).not.toThrow();
    const stats = summarizeSvgReplay(text);
    expect(stats.frames.length).toBeGreaterThan(1);
    expect(stats.hadSingleCellActiveFrame).toBe(true);
    expect(stats.hadMultiCellActiveFrame).toBe(true);
    expect(stats.hadRowClearLikeTransition).toBe(true);
    // On canonical 10x20 we require >=4 types; on 53x7 sample we require >=2.
    const minTypes = fast.finalBoard.length >= 20 && fast.finalBoard[0]?.length >= 10 ? 4 : 2;
    expect(fast.usedTypes.size).toBeGreaterThanOrEqual(minTypes);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(1_200_000);
    await rm(dir, { recursive: true, force: true });
    // Full pipeline + second planAndVerifyReplay for SVG/board assertions can exceed 60s on slow CI runners.
  }, 120_000);

  it("uses fetch path when not in sample mode and writes SVG", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tetrass-api-"));
    const out = join(dir, "api.svg");
    await runTetrassGenerate({
      login: "octocat",
      token: "fake-token",
      useSample: false,
      outputs: [{ filePath: out, palette: "light" }],
      workspaceRoot: dir,
    });
    expect(fetchContributionCalendar).toHaveBeenCalledWith("octocat", "fake-token");
    const text = await readFile(out, "utf8");
    expect(text).toContain("<svg");
    expect(text).toContain('href="#cG"');
    const { grassTarget } = planAndVerifyReplay(buildSampleContributionDays());
    expect(() => assertSvgFinalBoardMatchesTarget(text, grassTarget)).not.toThrow();
    await rm(dir, { recursive: true, force: true });
  }, 120_000);

  it("keeps a non-empty grass target for sample contribution data", () => {
    const { grassTarget } = planAndVerifyReplay(buildSampleContributionDays());
    let grass = 0;
    for (const row of grassTarget) {
      for (const c of row) if (c) grass++;
    }
    expect(grass).toBeGreaterThan(0);
  });
});
