import { describe, expect, it } from "vitest";
import { parseOutputLines } from "./generateRunner.js";

describe("parseOutputLines", () => {
  it("parses light and github-dark palette", () => {
    const raw = `  ./img/a.svg
./img/b.svg?palette=github-dark
`;
    const out = parseOutputLines(raw, "/repo");
    expect(out).toEqual([
      { filePath: "/repo/img/a.svg", palette: "light" },
      { filePath: "/repo/img/b.svg", palette: "dark" },
    ]);
  });
});
