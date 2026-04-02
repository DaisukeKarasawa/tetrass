import type { Board } from "../domain/types.js";

export interface ContributionDay {
  date: string;
  weekday?: number;
  contributionCount: number;
}

export interface ContributionCalendar {
  weeks: { contributionDays: ContributionDay[] }[];
}

const MAX_HTTP_ERROR_BODY_CHARS = 500;

/** Wall-clock limit for GitHub GraphQL `fetch` (CLI may run without an outer job timeout). */
const GITHUB_GRAPHQL_FETCH_TIMEOUT_MS = 30_000;

function truncateForErrorLog(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function isAbortLike(e: unknown): boolean {
  if (e instanceof Error && e.name === "AbortError") return true;
  return typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError";
}

const GRAPHQL = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
          }
        }
      }
    }
  }
}
`;

export async function fetchContributionCalendar(
  login: string,
  token?: string,
): Promise<ContributionCalendar> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "tetrass-generator",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_GRAPHQL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: GRAPHQL, variables: { login } }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const raw = await res.text();
      const snippet = truncateForErrorLog(raw, MAX_HTTP_ERROR_BODY_CHARS);
      throw new Error(`GitHub GraphQL HTTP ${res.status}: ${snippet}`);
    }
    const body = (await res.json()) as {
      data?: { user?: { contributionsCollection?: { contributionCalendar: ContributionCalendar } } };
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      throw new Error(`GitHub GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`);
    }
    const cal = body.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) throw new Error("No contribution calendar returned (user missing or private?)");
    return cal;
  } catch (e) {
    if (isAbortLike(e)) {
      throw new Error(
        `GitHub GraphQL request timed out after ${GITHUB_GRAPHQL_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Flatten GitHub calendar to chronological day list (oldest first). */
export function flattenContributionDays(cal: ContributionCalendar): ContributionDay[] {
  const days: ContributionDay[] = [];
  for (const w of cal.weeks) {
    for (const d of w.contributionDays) days.push(d);
  }
  return days;
}

const GITHUB_WEEKDAYS = 7;
const GITHUB_VISIBLE_WEEKS = 53;

/** Length of the deterministic offline contribution calendar (>= playfield cell count). */
const SAMPLE_CONTRIBUTION_DAY_COUNT = 400;

function inferredWeekdayAt(day: ContributionDay): number {
  if (day.weekday != null) return day.weekday;
  const dow = new Date(`${day.date}T00:00:00Z`).getUTCDay();
  return dow;
}

/**
 * Map contributions to GitHub-native week grid:
 * - x = week index (chronological, oldest visible week at x=0)
 * - y = weekday (0..6, same axis as GitHub contributionDays.weekday)
 * contributionCount > 0 => grass (1).
 */
export function contributionDaysToTargetBoard(days: ContributionDay[]): Board {
  if (days.length === 0) {
    return Array.from({ length: GITHUB_WEEKDAYS }, () =>
      Array.from({ length: GITHUB_VISIBLE_WEEKS }, () => 0 as 0 | 1),
    );
  }
  const totalWeeks = Math.ceil(days.length / GITHUB_WEEKDAYS);
  const visibleWeeks = Math.min(GITHUB_VISIBLE_WEEKS, totalWeeks);
  const startDayIdx = Math.max(0, (totalWeeks - visibleWeeks) * GITHUB_WEEKDAYS);
  const visibleDays = days.slice(startDayIdx);
  // Always emit a GitHub-profile-sized board (53 visible weeks), right-aligning
  // the available weeks so sparse/short samples still map to the same viewport.
  const width = GITHUB_VISIBLE_WEEKS;
  const xOffset = GITHUB_VISIBLE_WEEKS - visibleWeeks;
  const board: Board = Array.from({ length: GITHUB_WEEKDAYS }, () =>
    Array.from({ length: width }, () => 0 as 0 | 1),
  );

  for (let i = 0; i < visibleDays.length; i++) {
    const day = visibleDays[i];
    const x = xOffset + Math.floor(i / GITHUB_WEEKDAYS);
    const y = inferredWeekdayAt(day);
    if (x >= 0 && x < width && y >= 0 && y < GITHUB_WEEKDAYS) {
      board[y][x] = day.contributionCount > 0 ? 1 : 0;
    }
  }
  return board;
}

/** Deterministic pseudo-calendar for offline generation (no API). */
export function buildSampleContributionDays(): ContributionDay[] {
  const days: ContributionDay[] = [];
  const start = new Date("2024-01-01T00:00:00Z");
  const sampleWeeks = Math.ceil(SAMPLE_CONTRIBUTION_DAY_COUNT / GITHUB_WEEKDAYS);
  /**
   * Deterministic "grass" profile for sample mode:
   * - Keep a visibly non-trivial animation when users run without API access
   * - Occupy a compact, exact-cover-friendly rectangle near the right edge of the
   *   53-week viewport so tiling can engage and use multiple tetromino types.
   *   Specifically, use the last 16 weeks and weekdays 1..5 => 16*5 = 80 cells.
   *   (80 is <= TILING_EXACT_COVER_MAX_GRASS_CELLS and divisible by 4.)
   * - Keep a visibly non-trivial animation when users run without API access
   */
  const sampleGrassCell = (week: number, weekday: number): boolean => {
    const last16Start = Math.max(0, sampleWeeks - 16);
    return week >= last16Start && weekday >= 1 && weekday <= 5;
  };
  for (let i = 0; i < SAMPLE_CONTRIBUTION_DAY_COUNT; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const week = Math.floor(i / GITHUB_WEEKDAYS);
    const weekday = d.getUTCDay();
    const contributionCount = sampleGrassCell(week, weekday) ? 1 : 0;
    days.push({ date, weekday, contributionCount });
  }
  return days;
}
