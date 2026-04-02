import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./io/contributions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./io/contributions.js")>();
  return {
    ...actual,
    fetchContributionCalendar: vi.fn(),
  };
});

import { fetchContributionCalendar } from "./io/contributions.js";
import { runTetrassGenerate } from "./generateRunner.js";

describe("runTetrassGenerate / unauthenticated fetch failure", () => {
  beforeEach(() => {
    vi.mocked(fetchContributionCalendar).mockReset();
    vi.mocked(fetchContributionCalendar).mockRejectedValue(new Error("fetch failed"));
  });

  it("throws when no token and allowUnauthenticatedFallback is false", async () => {
    await expect(
      runTetrassGenerate({
        login: "octocat",
        outputs: [{ filePath: join(tmpdir(), "tetrass-unauth-test.svg"), palette: "light" }],
        useSample: false,
        allowUnauthenticatedFallback: false,
      }),
    ).rejects.toThrow(/GITHUB_TOKEN|TETRASS_ALLOW_UNAUTH_FALLBACK|TETRASS_USE_SAMPLE/);
  });

  it("falls back to sample when no token and allowUnauthenticatedFallback is true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tetrass-fb-"));
    const out = join(dir, "out.svg");
    await expect(
      runTetrassGenerate({
        login: "octocat",
        outputs: [{ filePath: out, palette: "light" }],
        useSample: false,
        allowUnauthenticatedFallback: true,
      }),
    ).resolves.toBeUndefined({ timeout: 60_000 } as unknown as number);
    await rm(dir, { recursive: true, force: true });
  });
});
