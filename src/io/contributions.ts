import {
  type GrassCellMeta,
  type GrassLevel,
  type LevelBoard,
  GRID_VISIBLE_WEEKS,
  GRID_WEEKDAYS,
  createEmptyLevelBoard,
} from "../domain/grass.js";

export interface ContributionDay {
  date: string;
  weekday?: number;
  contributionCount: number;
  contributionLevel: ContributionLevelRaw;
}

export type ContributionLevelRaw =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export interface ContributionCalendar {
  weeks: { contributionDays: ContributionDay[] }[];
}

const MAX_HTTP_ERROR_BODY_CHARS = 500;
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
            contributionLevel
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
      throw new Error(`GitHub GraphQL request timed out after ${GITHUB_GRAPHQL_FETCH_TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function flattenContributionDays(cal: ContributionCalendar): ContributionDay[] {
  const days: ContributionDay[] = [];
  for (const w of cal.weeks) {
    for (const d of w.contributionDays) days.push(d);
  }
  return days;
}

/**
 * Wrap a flat day list into synthetic week buckets of up to 7 consecutive days (offline/sample only).
 * Real GitHub calendars should use {@link contributionCalendarToLevelBoard} with API `weeks` as-is.
 */
export function chunkDaysIntoWeeks(days: ContributionDay[]): ContributionCalendar {
  const weeks: { contributionDays: ContributionDay[] }[] = [];
  for (let i = 0; i < days.length; i += GRID_WEEKDAYS) {
    weeks.push({ contributionDays: days.slice(i, i + GRID_WEEKDAYS) });
  }
  return { weeks };
}

const SAMPLE_CONTRIBUTION_DAY_COUNT = 400;

function inferredWeekdayAt(day: ContributionDay): number {
  if (day.weekday != null) return day.weekday;
  return new Date(`${day.date}T00:00:00Z`).getUTCDay();
}

export function contributionLevelToGrassLevel(level: ContributionLevelRaw): GrassLevel {
  switch (level) {
    case "NONE":
      return 0;
    case "FIRST_QUARTILE":
      return 1;
    case "SECOND_QUARTILE":
      return 2;
    case "THIRD_QUARTILE":
      return 3;
    case "FOURTH_QUARTILE":
      return 4;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export interface LevelBoardWithMeta {
  board: LevelBoard;
  meta: GrassCellMeta[][];
}

/**
 * Map contributions to GitHub-native week grid using **API week boundaries**:
 * - `x` = index into the visible tail of `cal.weeks` (chronological; oldest visible column at smallest `x`)
 * - `y` = weekday (0..6, same axis as GitHub `contributionDays.weekday`)
 * Always emits a 53×7 viewport, right-aligning when fewer than 53 weeks exist.
 */
export function contributionCalendarToLevelBoard(cal: ContributionCalendar): LevelBoardWithMeta {
  const emptyMeta = (date: string): GrassCellMeta => ({ date, contributionCount: 0 });

  if (cal.weeks.length === 0) {
    const board = createEmptyLevelBoard();
    const meta: GrassCellMeta[][] = Array.from({ length: GRID_WEEKDAYS }, (_, y) =>
      Array.from({ length: GRID_VISIBLE_WEEKS }, (_, x) => emptyMeta(`empty-${y}-${x}`)),
    );
    return { board, meta };
  }

  const totalWeeks = cal.weeks.length;
  const visibleWeeks = Math.min(GRID_VISIBLE_WEEKS, totalWeeks);
  const startWeekIdx = Math.max(0, totalWeeks - visibleWeeks);
  const xOffset = GRID_VISIBLE_WEEKS - visibleWeeks;

  const board = createEmptyLevelBoard();
  const meta: GrassCellMeta[][] = Array.from({ length: GRID_WEEKDAYS }, (_, y) =>
    Array.from({ length: GRID_VISIBLE_WEEKS }, (_, x) => emptyMeta(`pad-${y}-${x}`)),
  );

  for (let wi = startWeekIdx; wi < totalWeeks; wi++) {
    const x = xOffset + (wi - startWeekIdx);
    for (const day of cal.weeks[wi]!.contributionDays) {
      const y = inferredWeekdayAt(day);
      if (x >= 0 && x < GRID_VISIBLE_WEEKS && y >= 0 && y < GRID_WEEKDAYS) {
        board[y]![x] = contributionLevelToGrassLevel(day.contributionLevel);
        meta[y]![x] = { date: day.date, contributionCount: day.contributionCount };
      }
    }
  }

  return { board, meta };
}

/**
 * Legacy helper: treat `days` as consecutive 7-day chunks (see {@link chunkDaysIntoWeeks}).
 * Prefer {@link contributionCalendarToLevelBoard} for real GraphQL `weeks` payloads.
 */
export function contributionDaysToLevelBoard(days: ContributionDay[]): LevelBoardWithMeta {
  if (days.length === 0) {
    return contributionCalendarToLevelBoard({ weeks: [] });
  }
  return contributionCalendarToLevelBoard(chunkDaysIntoWeeks(days));
}

export interface FetchContributionCalendarOpts {
  login: string;
  token?: string;
  useSample?: boolean;
  allowUnauthenticatedFallback?: boolean;
}

/** Load calendar: GitHub API, or synthetic weeks from sample days (offline / CLI fallback). */
export async function fetchOrBuildContributionCalendar(opts: FetchContributionCalendarOpts): Promise<ContributionCalendar> {
  const { login, token, useSample, allowUnauthenticatedFallback = false } = opts;
  if (useSample) {
    console.warn("Using deterministic sample contributions (offline/sample mode).");
    return chunkDaysIntoWeeks(buildSampleContributionDays());
  }
  try {
    return await fetchContributionCalendar(login, token);
  } catch (e) {
    if (!token) {
      if (allowUnauthenticatedFallback) {
        console.warn(
          "GitHub fetch failed without token; falling back to sample contributions (TETRASS_ALLOW_UNAUTH_FALLBACK=1).",
        );
        return chunkDaysIntoWeeks(buildSampleContributionDays());
      }
      throw new Error(
        "GitHub fetch failed with no GITHUB_TOKEN. Set GITHUB_TOKEN for real contribution data, use TETRASS_USE_SAMPLE=1 (or TETRASS_OFFLINE=1) for offline sample mode, or set TETRASS_ALLOW_UNAUTH_FALLBACK=1 for CLI-only opt-in when an unauthenticated fetch fails.",
      );
    }
    throw new Error(`GitHub API request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Deterministic pseudo-calendar for offline generation (no API). */
export function buildSampleContributionDays(): ContributionDay[] {
  const days: ContributionDay[] = [];
  const start = new Date("2024-01-01T00:00:00Z");
  const sampleWeeks = Math.ceil(SAMPLE_CONTRIBUTION_DAY_COUNT / GRID_WEEKDAYS);

  const levelAt = (week: number, weekday: number, i: number): ContributionLevelRaw => {
    const last16Start = Math.max(0, sampleWeeks - 16);
    if (week < last16Start || weekday < 1 || weekday > 5) return "NONE";
    const h = (i * 17 + week * 3 + weekday * 5) % 11;
    if (h === 0) return "FIRST_QUARTILE";
    if (h <= 3) return "SECOND_QUARTILE";
    if (h <= 6) return "THIRD_QUARTILE";
    return "FOURTH_QUARTILE";
  };

  for (let i = 0; i < SAMPLE_CONTRIBUTION_DAY_COUNT; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const week = Math.floor(i / GRID_WEEKDAYS);
    const weekday = d.getUTCDay();
    const contributionLevel = levelAt(week, weekday, i);
    const contributionCount =
      contributionLevel === "NONE" ? 0 : ((i * 13 + weekday) % 9) + 1;
    days.push({ date, weekday, contributionCount, contributionLevel });
  }
  return days;
}
