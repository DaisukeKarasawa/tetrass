import { describe, expect, it, vi } from "vitest";
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

  it("returns empty for whitespace-only input", () => {
    const out = parseOutputLines("  \n\t\r\n", "/repo");
    expect(out).toEqual([]);
  });

  it("ignores comments and blank lines", () => {
    const raw = `# comment

./img/a.svg
  # another
./img/b.svg?palette=dark
`;
    const out = parseOutputLines(raw, "/repo");
    expect(out).toEqual([
      { filePath: "/repo/img/a.svg", palette: "light" },
      { filePath: "/repo/img/b.svg", palette: "dark" },
    ]);
  });

  it("supports CRLF line endings", () => {
    const raw = "./img/a.svg\r\n./img/b.svg?palette=dark\r\n";
    const out = parseOutputLines(raw, "/repo");
    expect(out).toEqual([
      { filePath: "/repo/img/a.svg", palette: "light" },
      { filePath: "/repo/img/b.svg", palette: "dark" },
    ]);
  });

  it("warns and defaults to light for unknown palette", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = parseOutputLines("./img/a.svg?palette=weird", "/repo");
    expect(out).toEqual([{ filePath: "/repo/img/a.svg", palette: "light" }]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("rejects paths outside workspace root", () => {
    expect(() => parseOutputLines("../escape.svg", "/repo")).toThrow(
      /outside workspace root/,
    );
  });
});
