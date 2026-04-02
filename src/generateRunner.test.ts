import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { parseOutputLines, runTetrassGenerate } from "./generateRunner.js";

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

  it.skipIf(process.platform === "win32")(
    "rejects output path whose directory is a symlink outside workspace",
    async () => {
      const ws = resolve(await mkdtemp(join(tmpdir(), "tetrass-parse-")));
      const outside = resolve(await mkdtemp(join(tmpdir(), "tetrass-ext-parse-")));
      await mkdir(outside, { recursive: true });
      await symlink(outside, join(ws, "img"));
      expect(() => parseOutputLines("./img/a.svg", ws)).toThrow(
        /outside workspace root/,
      );
      await rm(ws, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    },
  );
});

describe("runTetrassGenerate", () => {
  it.skipIf(process.platform === "win32")("rejects an output path that is a symlink", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "tetrass-ws-"));
    const outside = await mkdtemp(join(tmpdir(), "tetrass-ext-"));
    const remoteFile = join(outside, "target.svg");
    await writeFile(remoteFile, "<svg/>", "utf8");
    const outputSymlink = join(workspace, "out.svg");
    await symlink(remoteFile, outputSymlink);

    // Smaller timeout because the error should be thrown early by path guards.
    await expect(
      runTetrassGenerate({
        login: "octocat",
        useSample: true,
        outputs: [{ filePath: outputSymlink, palette: "light" }],
        workspaceRoot: workspace,
      }),
    ).rejects.toThrow(/outside workspace root|symbolic link/i);

    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }, 60000);
});
