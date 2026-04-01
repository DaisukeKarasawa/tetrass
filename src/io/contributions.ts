import type { Board } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";

export interface ContributionDay {
  date: string;
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
  let res: Response;
  try {
    res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: GRAPHQL, variables: { login } }),
      signal: controller.signal,
    });
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
}

/** Flatten GitHub calendar to chronological day list (oldest first). */
export function flattenContributionDays(cal: ContributionCalendar): ContributionDay[] {
  const days: ContributionDay[] = [];
  for (const w of cal.weeks) {
    for (const d of w.contributionDays) days.push(d);
  }
  return days;
}

const CELLS = BOARD_WIDTH * BOARD_HEIGHT;

/** Length of the deterministic offline contribution calendar (>= playfield cell count). */
const SAMPLE_CONTRIBUTION_DAY_COUNT = 400;

/**
 * Map the last N contribution days into the playfield: bottom row left-to-right, then upward.
 * contributionCount > 0 => grass (1).
 */
export function contributionDaysToTargetBoard(days: ContributionDay[]): Board {
  const values = days.map((d) => (d.contributionCount > 0 ? 1 : 0));
  const need = CELLS;
  const slice =
    values.length >= need ? values.slice(values.length - need) : [...Array(need - values.length).fill(0), ...values];

  const board: Board = Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => 0 as 0 | 1),
  );
  let i = 0;
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[y][x] = slice[i] as 0 | 1;
      i++;
    }
  }
  return board;
}

/** Deterministic pseudo-calendar for offline generation (no API). */
export function buildSampleContributionDays(): ContributionDay[] {
  const days: ContributionDay[] = [];
  const start = new Date("2024-01-01T00:00:00Z");
  /** Last `CELLS` days map into the playfield; earlier days are ignored by `contributionDaysToTargetBoard`. */
  const tailStart = SAMPLE_CONTRIBUTION_DAY_COUNT - CELLS;
  for (let i = 0; i < SAMPLE_CONTRIBUTION_DAY_COUNT; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    let contributionCount = 0;
    if (i >= tailStart) {
      const idxInSlice = i - tailStart;
      // Bottom-left O-tetromino on the board: slice indices 0,1,10,11 -> (0,19),(1,19),(0,18),(1,18).
      if (idxInSlice === 0 || idxInSlice === 1 || idxInSlice === 10 || idxInSlice === 11) {
        contributionCount = 1;
      }
    }
    days.push({ date, contributionCount });
  }
  return days;
}
