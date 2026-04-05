import { describe, expect, it } from "vitest";

import { resolveGenerateOptions } from "./resolveGenerateOptions.js";

describe("resolveGenerateOptions", () => {
  describe("github-action", () => {
    it("requires INPUT_GITHUB_USER_NAME", () => {
      expect(() =>
        resolveGenerateOptions(
          { INPUT_OUTPUTS: "./img/a.svg", GITHUB_WORKSPACE: "/ws", GITHUB_TOKEN: "t" },
          { context: "github-action" },
        ),
      ).toThrow(/INPUT_GITHUB_USER_NAME is required/);
    });

    it("rejects invalid login format", () => {
      expect(() =>
        resolveGenerateOptions(
          {
            INPUT_GITHUB_USER_NAME: "bad..name",
            INPUT_OUTPUTS: "./img/a.svg",
            GITHUB_WORKSPACE: "/ws",
            GITHUB_TOKEN: "t",
          },
          { context: "github-action" },
        ),
      ).toThrow(/Invalid GitHub username format/);
    });

    it("rejects logins with consecutive hyphens", () => {
      expect(() =>
        resolveGenerateOptions(
          {
            INPUT_GITHUB_USER_NAME: "bad--name",
            INPUT_OUTPUTS: "./img/a.svg",
            GITHUB_WORKSPACE: "/ws",
            GITHUB_TOKEN: "t",
          },
          { context: "github-action" },
        ),
      ).toThrow(/Invalid GitHub username format/);
    });

    it("requires GITHUB_TOKEN when not in sample mode", () => {
      expect(() =>
        resolveGenerateOptions(
          {
            INPUT_GITHUB_USER_NAME: "octocat",
            INPUT_OUTPUTS: "./img/a.svg",
            GITHUB_WORKSPACE: "/ws",
          },
          { context: "github-action" },
        ),
      ).toThrow(/GITHUB_TOKEN is required/);
    });

    it("requires GITHUB_WORKSPACE in github-action context", () => {
      expect(() =>
        resolveGenerateOptions(
          {
            INPUT_GITHUB_USER_NAME: "octocat",
            INPUT_OUTPUTS: "./img/a.svg",
            GITHUB_TOKEN: "tok",
          },
          { context: "github-action" },
        ),
      ).toThrow(/GITHUB_WORKSPACE is not set/);
    });

    it("returns options when valid", () => {
      const opts = resolveGenerateOptions(
        {
          INPUT_GITHUB_USER_NAME: "octocat",
          INPUT_OUTPUTS: "./img/a.svg",
          GITHUB_WORKSPACE: "/ws",
          GITHUB_TOKEN: "tok",
        },
        { context: "github-action" },
      );
      expect(opts.login).toBe("octocat");
      expect(opts.token).toBe("tok");
      expect(opts.workspaceRoot).toBe("/ws");
      expect(opts.outputs).toHaveLength(1);
      expect(opts.allowUnauthenticatedFallback).toBeUndefined();
    });
  });

  describe("cli", () => {
    it("throws when no login and not sample mode", () => {
      expect(() =>
        resolveGenerateOptions({}, { context: "cli", repoRoot: "/repo" }),
      ).toThrow(/GITHUB_LOGIN or GITHUB_REPOSITORY_OWNER/);
    });

    it("uses default img paths when TETRASS_OUTPUTS unset", () => {
      const opts = resolveGenerateOptions(
        { TETRASS_USE_SAMPLE: "1" },
        { context: "cli", repoRoot: "/repo" },
      );
      expect(opts.login).toBe("sample");
      expect(opts.outputs.map((o) => o.filePath)).toEqual([
        "/repo/img/tetrass.svg",
        "/repo/img/tetrass-dark.svg",
      ]);
      expect(opts.allowUnauthenticatedFallback).toBe(false);
    });

    it("prefers GITHUB_LOGIN over GITHUB_REPOSITORY_OWNER", () => {
      const opts = resolveGenerateOptions(
        {
          GITHUB_LOGIN: "  alice  ",
          GITHUB_REPOSITORY_OWNER: "bob",
          TETRASS_USE_SAMPLE: "1",
        },
        { context: "cli", repoRoot: "/r" },
      );
      expect(opts.login).toBe("alice");
    });

    it("rejects invalid login format like github-action", () => {
      expect(() =>
        resolveGenerateOptions(
          {
            GITHUB_LOGIN: "bad..name",
            TETRASS_USE_SAMPLE: "1",
          },
          { context: "cli", repoRoot: "/repo" },
        ),
      ).toThrow(/Invalid GitHub username format/);
    });

    it("does not validate synthetic sample login when no env login is set", () => {
      const opts = resolveGenerateOptions(
        { TETRASS_USE_SAMPLE: "1" },
        { context: "cli", repoRoot: "/repo" },
      );
      expect(opts.login).toBe("sample");
    });
  });
});
