import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runTetrassGenerate } from "../generateRunner.js";
import { buildSampleContributionDays, contributionDaysToLevelBoard } from "../io/contributions.js";

describe("grass pipeline integration", () => {
  it("writes SVG whose grass cell count matches the level board", async () => {
    const ws = join(tmpdir(), `tetrass-grass-${Date.now()}`);
    await mkdir(ws, { recursive: true });
    const outPath = join(ws, "out.svg");
    try {
      await runTetrassGenerate({
        login: "sample",
        useSample: true,
        outputs: [{ filePath: outPath, palette: "dark" }],
        workspaceRoot: ws,
      });
      const svg = await readFile(outPath, "utf8");
      const { board } = contributionDaysToLevelBoard(buildSampleContributionDays());
      let grass = 0;
      for (let y = 0; y < board.length; y++) {
        for (let x = 0; x < board[0]!.length; x++) {
          if (board[y]![x]! > 0) grass++;
        }
      }
      const uses = [...svg.matchAll(/<use href="#cG[1-4]"/g)];
      expect(uses.length).toBe(grass);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });
});
