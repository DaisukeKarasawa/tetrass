import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ContributionCalendar,
  type ContributionDay,
  buildSampleContributionDays,
  contributionCalendarToLevelBoard,
  contributionDaysToLevelBoard,
  contributionLevelToGrassLevel,
  fetchContributionCalendar,
  flattenContributionDays,
} from "./contributions.js";

describe("flattenContributionDays", () => {
  it("concatenates weeks in order", () => {
    const cal: ContributionCalendar = {
      weeks: [
        {
          contributionDays: [
            { date: "2024-01-01", weekday: 1, contributionCount: 1, contributionLevel: "FIRST_QUARTILE" },
          ],
        },
        {
          contributionDays: [
            { date: "2024-01-08", weekday: 1, contributionCount: 0, contributionLevel: "NONE" },
          ],
        },
      ],
    };
    expect(flattenContributionDays(cal)).toEqual([
      { date: "2024-01-01", weekday: 1, contributionCount: 1, contributionLevel: "FIRST_QUARTILE" },
      { date: "2024-01-08", weekday: 1, contributionCount: 0, contributionLevel: "NONE" },
    ]);
  });
});

describe("contributionLevelToGrassLevel", () => {
  it("maps GitHub enums to 0..4", () => {
    expect(contributionLevelToGrassLevel("NONE")).toBe(0);
    expect(contributionLevelToGrassLevel("FIRST_QUARTILE")).toBe(1);
    expect(contributionLevelToGrassLevel("SECOND_QUARTILE")).toBe(2);
    expect(contributionLevelToGrassLevel("THIRD_QUARTILE")).toBe(3);
    expect(contributionLevelToGrassLevel("FOURTH_QUARTILE")).toBe(4);
  });
});

describe("contributionCalendarToLevelBoard", () => {
  it("maps API week index to x (partial first/last weeks do not shift columns)", () => {
    const cal: ContributionCalendar = {
      weeks: [
        {
          contributionDays: [
            { date: "2024-01-03", weekday: 2, contributionCount: 1, contributionLevel: "THIRD_QUARTILE" },
          ],
        },
        { contributionDays: [] },
      ],
    };
    const { board, meta } = contributionCalendarToLevelBoard(cal);
    expect(board[2]![51]).toBe(3);
    expect(meta[2]![51]!.date).toBe("2024-01-03");
  });

  it("right-aligns to the last 53 weeks when the API returns more than 53", () => {
    const weeks: ContributionCalendar["weeks"] = Array.from({ length: 54 }, (_, wi) => ({
      contributionDays:
        wi === 0
          ? [{ date: "trimmed-only", weekday: 3, contributionCount: 9, contributionLevel: "FOURTH_QUARTILE" as const }]
          : wi === 53
            ? [{ date: "visible-last", weekday: 3, contributionCount: 2, contributionLevel: "FIRST_QUARTILE" as const }]
            : [],
    }));
    const { board, meta } = contributionCalendarToLevelBoard({ weeks });
    expect(board[3]![0]).toBe(0);
    expect(meta[3]![0]!.date.startsWith("pad-")).toBe(true);
    expect(board[3]![52]).toBe(1);
    expect(meta[3]![52]!.date).toBe("visible-last");
  });
});

describe("contributionDaysToLevelBoard", () => {
  it("maps GitHub-native coordinates: x=week index, y=weekday", () => {
    const days: ContributionDay[] = [
      { date: "2024-01-01", weekday: 0, contributionCount: 0, contributionLevel: "NONE" },
      { date: "2024-01-02", weekday: 1, contributionCount: 0, contributionLevel: "NONE" },
      { date: "2024-01-03", weekday: 2, contributionCount: 1, contributionLevel: "THIRD_QUARTILE" },
      { date: "2024-01-04", weekday: 3, contributionCount: 0, contributionLevel: "NONE" },
      { date: "2024-01-05", weekday: 4, contributionCount: 0, contributionLevel: "NONE" },
      { date: "2024-01-06", weekday: 5, contributionCount: 0, contributionLevel: "NONE" },
      { date: "2024-01-07", weekday: 6, contributionCount: 0, contributionLevel: "NONE" },
      { date: "2024-01-08", weekday: 0, contributionCount: 2, contributionLevel: "FOURTH_QUARTILE" },
    ];
    const { board, meta } = contributionDaysToLevelBoard(days);
    expect(board).toHaveLength(7);
    expect(board[0]).toHaveLength(53);
    expect(board[2][51]).toBe(3);
    expect(board[0][52]).toBe(4);
    expect(board[6][52]).toBe(0);
    expect(meta[2][51].date).toBe("2024-01-03");
    expect(meta[0][52].date).toBe("2024-01-08");
  });

  it("infers weekday from ISO date when weekday is omitted", () => {
    const days: ContributionDay[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2024-01-0${i + 1}`,
      contributionCount: 1,
      contributionLevel: "SECOND_QUARTILE" as const,
    }));
    const { board } = contributionDaysToLevelBoard(days);
    expect(board[2][52]).toBe(2);
  });

  it("maps sample days to deterministic non-trivial weekly profile", () => {
    const { board } = contributionDaysToLevelBoard(buildSampleContributionDays());
    expect(board).toHaveLength(7);
    expect(board[0].length).toBe(53);

    expect(board[0].every((c) => c === 0)).toBe(true);
    expect(board[6].every((c) => c === 0)).toBe(true);

    expect(board[1].some((c) => c > 0)).toBe(true);
    expect(board[5].some((c) => c > 0)).toBe(true);

    let nonZero = 0;
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[0]!.length; x++) if (board[y]![x]! > 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
  });
});

describe("fetchContributionCalendar", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns calendar on successful GraphQL response", async () => {
    const cal: ContributionCalendar = {
      weeks: [
        { contributionDays: [{ date: "2024-01-01", contributionCount: 0, contributionLevel: "NONE" }] },
      ],
    };
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: { user: { contributionsCollection: { contributionCalendar: cal } } },
          }),
      } as Response),
    );

    await expect(fetchContributionCalendar("alice", "tok")).resolves.toEqual(cal);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.github.com/graphql",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
  });

  it("throws when the GraphQL request exceeds the wall-clock timeout", async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const sig = init?.signal;
          if (!sig) {
            reject(new Error("expected AbortSignal"));
            return;
          }
          const onAbort = (): void => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          };
          if (sig.aborted) {
            onAbort();
            return;
          }
          sig.addEventListener("abort", onAbort, { once: true });
        });
      });
      const p = fetchContributionCalendar("u", "tok");
      const assertion = expect(p).rejects.toThrow(/timed out after 30000ms/);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws on GraphQL errors payload", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ errors: [{ message: "Not found" }] }),
      } as Response),
    );
    await expect(fetchContributionCalendar("ghost")).rejects.toThrow(/Not found/);
  });

  it("throws when calendar missing", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { user: null } }),
      } as Response),
    );
    await expect(fetchContributionCalendar("x")).rejects.toThrow(/No contribution calendar/);
  });

  it("truncates non-OK response body in error message", async () => {
    const long = "e".repeat(600);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        text: () => Promise.resolve(long),
      } as Response),
    );
    let caught: unknown;
    try {
      await fetchContributionCalendar("u");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toContain("502");
    expect(msg.length).toBeLessThan(long.length + 80);
  });
});
