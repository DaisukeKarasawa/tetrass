import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";
import {
  type ContributionCalendar,
  type ContributionDay,
  buildSampleContributionDays,
  contributionDaysToTargetBoard,
  fetchContributionCalendar,
  flattenContributionDays,
} from "./contributions.js";

describe("flattenContributionDays", () => {
  it("concatenates weeks in order", () => {
    const cal: ContributionCalendar = {
      weeks: [
        { contributionDays: [{ date: "2024-01-01", contributionCount: 1 }] },
        { contributionDays: [{ date: "2024-01-08", contributionCount: 0 }] },
      ],
    };
    expect(flattenContributionDays(cal)).toEqual([
      { date: "2024-01-01", contributionCount: 1 },
      { date: "2024-01-08", contributionCount: 0 },
    ]);
  });
});

describe("contributionDaysToTargetBoard", () => {
  it("maps bottom row left-to-right then upward; pads short history with zeros", () => {
    const days: ContributionDay[] = [{ date: "2024-12-31", contributionCount: 1 }];
    const board = contributionDaysToTargetBoard(days);
    expect(board[0][9]).toBe(1);
    expect(board[19][0]).toBe(0);
    let ones = 0;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) if (board[y][x]) ones++;
    }
    expect(ones).toBe(1);
  });

  it("fills the board when the last 200 days all have contributions", () => {
    const days: ContributionDay[] = Array.from({ length: 200 }, (_, i) => ({
      date: `d${i}`,
      contributionCount: 1,
    }));
    const board = contributionDaysToTargetBoard(days);
    expect(board.every((row) => row.every((c) => c === 1))).toBe(true);
  });

  it("uses only the last 200 days of a longer history", () => {
    const days: ContributionDay[] = Array.from({ length: 250 }, (_, i) => ({
      date: `d${i}`,
      contributionCount: i >= 50 ? 1 : 0,
    }));
    const board = contributionDaysToTargetBoard(days);
    expect(board.every((row) => row.every((c) => c === 1))).toBe(true);
  });

  it("maps sample days to a small tileable O-shaped grass cluster at the bottom-left", () => {
    const board = contributionDaysToTargetBoard(buildSampleContributionDays());
    expect(board[19][0]).toBe(1);
    expect(board[19][1]).toBe(1);
    expect(board[18][0]).toBe(1);
    expect(board[18][1]).toBe(1);
    let ones = 0;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) if (board[y][x]) ones++;
    }
    expect(ones).toBe(4);
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
      weeks: [{ contributionDays: [{ date: "2024-01-01", contributionCount: 0 }] }],
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
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
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
