// src/generateRunner.ts
import { constants as fsConstants, existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// src/domain/grass.ts
var GRID_WEEKDAYS = 7;
var GRID_VISIBLE_WEEKS = 53;
var GROUP_COLUMN_COUNTS = [6, 6, 6, 6, 6, 6, 6, 6, 5];
function assertGroupColumnCounts() {
  const s = GROUP_COLUMN_COUNTS.reduce((a, b) => a + b, 0);
  if (s !== GRID_VISIBLE_WEEKS) {
    throw new Error(`GROUP_COLUMN_COUNTS must sum to ${GRID_VISIBLE_WEEKS}, got ${s}`);
  }
}
function groupColumnRanges() {
  assertGroupColumnCounts();
  const out = [];
  let x = 0;
  for (const w of GROUP_COLUMN_COUNTS) {
    out.push({ xStart: x, xEndInclusive: x + w - 1 });
    x += w;
  }
  return out;
}
function createEmptyLevelBoard() {
  return Array.from(
    { length: GRID_WEEKDAYS },
    () => Array.from({ length: GRID_VISIBLE_WEEKS }, () => 0)
  );
}

// src/io/contributions.ts
var MAX_HTTP_ERROR_BODY_CHARS = 500;
var GITHUB_GRAPHQL_FETCH_TIMEOUT_MS = 3e4;
function truncateForErrorLog(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\u2026`;
}
function isAbortLike(e) {
  if (e instanceof Error && e.name === "AbortError") return true;
  return typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError";
}
var GRAPHQL = `
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
async function fetchContributionCalendar(login, token) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "tetrass-generator"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_GRAPHQL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: GRAPHQL, variables: { login } }),
      signal: controller.signal
    });
    if (!res.ok) {
      const raw = await res.text();
      const snippet = truncateForErrorLog(raw, MAX_HTTP_ERROR_BODY_CHARS);
      throw new Error(`GitHub GraphQL HTTP ${res.status}: ${snippet}`);
    }
    const body = await res.json();
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
function chunkDaysIntoWeeks(days) {
  const weeks = [];
  for (let i = 0; i < days.length; i += GRID_WEEKDAYS) {
    weeks.push({ contributionDays: days.slice(i, i + GRID_WEEKDAYS) });
  }
  return { weeks };
}
var SAMPLE_CONTRIBUTION_DAY_COUNT = 400;
function inferredWeekdayAt(day) {
  if (day.weekday != null) return day.weekday;
  return (/* @__PURE__ */ new Date(`${day.date}T00:00:00Z`)).getUTCDay();
}
function contributionLevelToGrassLevel(level) {
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
      const _exhaustive = level;
      return _exhaustive;
    }
  }
}
function contributionCalendarToLevelBoard(cal) {
  const emptyMeta = (date) => ({ date, contributionCount: 0 });
  if (cal.weeks.length === 0) {
    const board2 = createEmptyLevelBoard();
    const meta2 = Array.from(
      { length: GRID_WEEKDAYS },
      (_, y) => Array.from({ length: GRID_VISIBLE_WEEKS }, (_2, x) => emptyMeta(`empty-${y}-${x}`))
    );
    return { board: board2, meta: meta2 };
  }
  const totalWeeks = cal.weeks.length;
  const visibleWeeks = Math.min(GRID_VISIBLE_WEEKS, totalWeeks);
  const startWeekIdx = Math.max(0, totalWeeks - visibleWeeks);
  const xOffset = GRID_VISIBLE_WEEKS - visibleWeeks;
  const board = createEmptyLevelBoard();
  const meta = Array.from(
    { length: GRID_WEEKDAYS },
    (_, y) => Array.from({ length: GRID_VISIBLE_WEEKS }, (_2, x) => emptyMeta(`pad-${y}-${x}`))
  );
  for (let wi = startWeekIdx; wi < totalWeeks; wi++) {
    const x = xOffset + (wi - startWeekIdx);
    for (const day of cal.weeks[wi].contributionDays) {
      const y = inferredWeekdayAt(day);
      if (x >= 0 && x < GRID_VISIBLE_WEEKS && y >= 0 && y < GRID_WEEKDAYS) {
        board[y][x] = contributionLevelToGrassLevel(day.contributionLevel);
        meta[y][x] = { date: day.date, contributionCount: day.contributionCount };
      }
    }
  }
  return { board, meta };
}
async function fetchOrBuildContributionCalendar(opts) {
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
          "GitHub fetch failed without token; falling back to sample contributions (TETRASS_ALLOW_UNAUTH_FALLBACK=1)."
        );
        return chunkDaysIntoWeeks(buildSampleContributionDays());
      }
      throw new Error(
        "GitHub fetch failed with no GITHUB_TOKEN. Set GITHUB_TOKEN for real contribution data, use TETRASS_USE_SAMPLE=1 (or TETRASS_OFFLINE=1) for offline sample mode, or set TETRASS_ALLOW_UNAUTH_FALLBACK=1 for CLI-only opt-in when an unauthenticated fetch fails."
      );
    }
    throw new Error(`GitHub API request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function buildSampleContributionDays() {
  const days = [];
  const start = /* @__PURE__ */ new Date("2024-01-01T00:00:00Z");
  const sampleWeeks = Math.ceil(SAMPLE_CONTRIBUTION_DAY_COUNT / GRID_WEEKDAYS);
  const levelAt = (week, weekday, i) => {
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
    const contributionCount = contributionLevel === "NONE" ? 0 : (i * 13 + weekday) % 9 + 1;
    days.push({ date, weekday, contributionCount, contributionLevel });
  }
  return days;
}

// src/grass/groupDropPlanner.ts
var STRICT_STEP_MS = 80;
var HOLD_AFTER_LAST_MS = 1800;
function columnTimeline(absX, cellsInCol) {
  if (cellsInCol.length === 0) return [];
  const ys = [...new Set(cellsInCol.map((c) => c.y))].sort((a, b) => a - b);
  const missions = [...ys].reverse();
  const settled = /* @__PURE__ */ new Set();
  const frames = [];
  const cellAtY = (y) => cellsInCol.find((c) => c.y === y);
  const settledMap = () => {
    const m = /* @__PURE__ */ new Map();
    for (const y of [...settled].sort((a, b) => a - b)) {
      const c = cellAtY(y);
      m.set(y, { sx: absX, sy: y, level: c.level });
    }
    return m;
  };
  for (let mi = 0; mi < missions.length; mi++) {
    const y_t = missions[mi];
    const c = cellAtY(y_t);
    for (let d = 0; d < y_t; d++) {
      const pl = settledMap();
      pl.set(d, { sx: absX, sy: y_t, level: c.level });
      frames.push(pl);
    }
    settled.add(y_t);
    const nextY = missions[mi + 1];
    if (nextY === void 0) {
      frames.push(settledMap());
    } else if (nextY > 0) {
      frames.push(settledMap());
    }
  }
  return frames;
}
function mergeColumnFrames(timelines) {
  const maxLen = timelines.reduce((m, t) => Math.max(m, t.frames.length), 0);
  if (maxLen === 0) return [];
  const out = [];
  for (let ti = 0; ti < maxLen; ti++) {
    const placements = [];
    for (const { absX, frames } of timelines) {
      if (frames.length === 0) continue;
      const idx = Math.min(ti, frames.length - 1);
      const m = frames[idx];
      const rows = [...m.keys()].sort((a, b) => a - b);
      for (const dy of rows) {
        const ref = m.get(dy);
        placements.push({
          absX,
          absY: dy,
          sourceX: ref.sx,
          sourceY: ref.sy,
          level: ref.level
        });
      }
    }
    out.push(placements);
  }
  return out;
}
function buildGroupFrames(g) {
  const timelines = [];
  for (let x = g.xStart; x <= g.xEndInclusive; x++) {
    const colCells = g.cells.filter((c) => c.x === x);
    timelines.push({ absX: x, frames: columnTimeline(x, colCells) });
  }
  return mergeColumnFrames(timelines);
}
function splitBoardIntoColumnGroups(board, meta) {
  const ranges = groupColumnRanges();
  if (board.length !== GRID_WEEKDAYS) {
    throw new Error(`Expected board height ${GRID_WEEKDAYS}, got ${board.length}`);
  }
  const w = board[0]?.length ?? 0;
  if (w !== GRID_VISIBLE_WEEKS) {
    throw new Error(`Expected board width ${GRID_VISIBLE_WEEKS}, got ${w}`);
  }
  const groups = [];
  for (let gi = 0; gi < ranges.length; gi++) {
    const { xStart, xEndInclusive } = ranges[gi];
    const cells = [];
    for (let y = 0; y < GRID_WEEKDAYS; y++) {
      for (let x = xStart; x <= xEndInclusive; x++) {
        const level = board[y][x];
        if (level === 0) continue;
        const m = meta[y]?.[x];
        if (!m) {
          throw new Error(`Missing meta for grass cell at (${x},${y})`);
        }
        cells.push({
          x,
          y,
          level,
          date: m.date,
          contributionCount: m.contributionCount
        });
      }
    }
    groups.push({
      index: gi,
      xStart,
      xEndInclusive,
      cells
    });
  }
  return groups;
}
function buildStrictDropSchedule(groups) {
  const allPlacements = [];
  for (const g of groups) {
    const gf = buildGroupFrames(g);
    for (const p of gf) {
      allPlacements.push(p);
    }
  }
  const frames = allPlacements.map((placements) => ({ placements }));
  return {
    stepDurationMs: STRICT_STEP_MS,
    frames,
    holdAfterLastMs: HOLD_AFTER_LAST_MS
  };
}
function buildDropSchedule(groups) {
  return buildStrictDropSchedule(groups);
}
function totalCycleMs(schedule) {
  const { frames, stepDurationMs, holdAfterLastMs } = schedule;
  if (frames.length === 0) return holdAfterLastMs;
  return frames.length * stepDurationMs + holdAfterLastMs;
}

// src/renderer/svgRenderer.ts
var PALETTE_LIGHT = {
  canvas: "#ffffff",
  emptyCell: "#ebedf0",
  level1: "#9be9a8",
  level2: "#40c463",
  level3: "#30a14e",
  level4: "#216e39",
  cellBorder: "rgba(27,31,36,0.12)"
};
var PALETTE_DARK = {
  canvas: "#0d1117",
  emptyCell: "#161b22",
  level1: "#0e4429",
  level2: "#006d32",
  level3: "#26a641",
  level4: "#39d353",
  cellBorder: "rgba(255,255,255,0.08)"
};
var DEFAULT_SAFE_COLOR = "#ebedf0";
var CSS_NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/
  )
);
function hasDangerousColorContent(raw) {
  const lower = raw.toLowerCase();
  if (raw.includes('"') || raw.includes("'") || raw.includes("<") || raw.includes(">") || raw.includes("&") || raw.includes("\\")) {
    return true;
  }
  if (lower.includes("url(")) return true;
  if (raw.includes("/*") || raw.includes("*/")) return true;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return true;
  return false;
}
function validateRgbLikeChannel(part) {
  const p = part.trim();
  if (p.endsWith("%")) {
    const n = p.slice(0, -1);
    if (!/^\d+(\.\d+)?$/.test(n)) return false;
    const v2 = Number(n);
    return Number.isFinite(v2) && v2 >= 0 && v2 <= 100;
  }
  if (!/^\d+$/.test(p)) return false;
  const v = Number(p);
  return v >= 0 && v <= 255;
}
function validateAlphaChannel(part) {
  const p = part.trim();
  if (p.endsWith("%")) {
    const n = p.slice(0, -1);
    if (!/^\d+(\.\d+)?$/.test(n)) return false;
    const v2 = Number(n);
    return Number.isFinite(v2) && v2 >= 0 && v2 <= 100;
  }
  if (!/^\d+(\.\d+)?$/.test(p)) return false;
  const v = Number(p);
  return Number.isFinite(v) && v >= 0 && v <= 1;
}
function isValidRgbFunction(value) {
  const m = /^rgb\(\s*([^)]+)\)$/i.exec(value);
  if (!m) return false;
  const parts = m[1].split(",").map((x) => x.trim());
  if (parts.length !== 3) return false;
  return parts.every(validateRgbLikeChannel);
}
function isValidRgbaFunction(value) {
  const m = /^rgba\(\s*([^)]+)\)$/i.exec(value);
  if (!m) return false;
  const parts = m[1].split(",").map((x) => x.trim());
  if (parts.length !== 4) return false;
  const [r, g, b, a] = parts;
  return validateRgbLikeChannel(r) && validateRgbLikeChannel(g) && validateRgbLikeChannel(b) && validateAlphaChannel(a);
}
function validateColor(value) {
  const s = value.trim();
  if (s.length === 0) return DEFAULT_SAFE_COLOR;
  if (hasDangerousColorContent(s)) return DEFAULT_SAFE_COLOR;
  if (/^#[0-9a-f]{3}$/i.test(s) || /^#[0-9a-f]{4}$/i.test(s) || /^#[0-9a-f]{6}$/i.test(s) || /^#[0-9a-f]{8}$/i.test(s)) {
    return s;
  }
  if (isValidRgbFunction(s) || isValidRgbaFunction(s)) {
    return s;
  }
  if (/^[a-z]+$/i.test(s) && CSS_NAMED_COLORS.has(s.toLowerCase())) {
    return s.toLowerCase();
  }
  return DEFAULT_SAFE_COLOR;
}
function sanitizeGrassPalette(p) {
  return {
    canvas: validateColor(p.canvas),
    emptyCell: validateColor(p.emptyCell),
    level1: validateColor(p.level1),
    level2: validateColor(p.level2),
    level3: validateColor(p.level3),
    level4: validateColor(p.level4),
    cellBorder: validateColor(p.cellBorder)
  };
}
var STEP = 20;
var DOT_SIZE = 12;
var DOT_MARGIN = (STEP - DOT_SIZE) / 2;
var PAD = 2;
var RX = 2;
var STROKE_WIDTH = 0.5;
var CYCLE_TAIL_RESET = 12e-4;
var SMIL_KEY_GAP = 2e-6;
function cellBasePx(x, y) {
  return { px: PAD + x * STEP + DOT_MARGIN, py: PAD + y * STEP + DOT_MARGIN };
}
function cellUse(x, y, href) {
  const { px, py } = cellBasePx(x, y);
  return `<use href="#${href}" x="${px}" y="${py}"/>`;
}
function buildSymbols(p) {
  const { emptyCell: e, level1: l1, level2: l2, level3: l3, level4: l4, cellBorder: b } = p;
  const sym = (id, fill) => `<symbol id="${id}" viewBox="0 0 ${DOT_SIZE} ${DOT_SIZE}"><rect width="${DOT_SIZE}" height="${DOT_SIZE}" fill="${fill}" stroke="${b}" stroke-width="${STROKE_WIDTH}" rx="${RX}"/></symbol>`;
  return `<defs>
${sym("cE", e)}
${sym("cG1", l1)}
${sym("cG2", l2)}
${sym("cG3", l3)}
${sym("cG4", l4)}
</defs>`;
}
function levelHref(level) {
  return `cG${level}`;
}
function placementForFrame(sx, sy, frameIndex, schedule) {
  if (frameIndex < 0 || frameIndex >= schedule.frames.length) return null;
  const p = schedule.frames[frameIndex].placements.find((x) => x.sourceX === sx && x.sourceY === sy);
  if (!p) return { absY: sy, visible: false };
  return { absY: p.absY, visible: true };
}
function buildCellSmil(sx, sy, level, schedule, cycleMs) {
  const F = schedule.frames.length;
  const stepMs = schedule.stepDurationMs;
  const fmt = (t) => t.toFixed(6);
  if (F === 0) {
    return { keyTimes: "0;1", opValues: "0;0", tyValues: "0,0;0,0" };
  }
  const g = SMIL_KEY_GAP;
  const rTail = Math.max(0, 1 - CYCLE_TAIL_RESET);
  const fracs = [0];
  for (let i = 1; i <= F; i++) {
    const raw = i * stepMs / cycleMs;
    fracs.push(Math.max(raw, fracs[fracs.length - 1] + g));
  }
  fracs.push(Math.max(fracs[fracs.length - 1] + g, Math.min(rTail, 1 - 2 * g)));
  fracs.push(1);
  const opVals = [];
  const tyVals = [];
  const n = fracs.length;
  for (let k = 0; k < n; k++) {
    let frameIdx;
    if (k <= F - 1) frameIdx = k;
    else if (k === n - 1) frameIdx = 0;
    else frameIdx = F - 1;
    const st = placementForFrame(sx, sy, frameIdx, schedule);
    if (!st || !st.visible) {
      opVals.push("0");
      tyVals.push("0,0");
    } else {
      opVals.push("1");
      tyVals.push(`0,${(st.absY - sy) * STEP}`);
    }
  }
  return {
    keyTimes: fracs.map(fmt).join(";"),
    opValues: opVals.join(";"),
    tyValues: tyVals.join(";")
  };
}
function collectSourceCells(schedule) {
  const m = /* @__PURE__ */ new Map();
  for (const fr of schedule.frames) {
    for (const p of fr.placements) {
      const k = `${p.sourceX},${p.sourceY}`;
      if (!m.has(k)) m.set(k, p.level);
    }
  }
  return m;
}
function renderEmptyGrid() {
  let s = "";
  for (let y = 0; y < GRID_WEEKDAYS; y++) {
    for (let x = 0; x < GRID_VISIBLE_WEEKS; x++) {
      s += cellUse(x, y, "cE");
    }
  }
  return s;
}
function renderAnimatedGrassCell(sx, sy, level, schedule, cycleMs) {
  const { keyTimes, opValues, tyValues } = buildCellSmil(sx, sy, level, schedule, cycleMs);
  const href = levelHref(level);
  return `<g>
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="${keyTimes}" values="${opValues}"/>
<g>
<animateTransform attributeName="transform" type="translate" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="${keyTimes}" values="${tyValues}"/>
${cellUse(sx, sy, href)}
</g>
</g>`;
}
function buildGrassDropSvg(schedule, palette) {
  const safe = sanitizeGrassPalette(palette);
  const cycleMs = totalCycleMs(schedule);
  const boardW = GRID_VISIBLE_WEEKS * STEP + PAD * 2;
  const boardH = GRID_WEEKDAYS * STEP + PAD * 2;
  const sources = collectSourceCells(schedule);
  const drops = [...sources.entries()].sort((a, b) => {
    const [ax, ay] = a[0].split(",").map(Number);
    const [bx, by] = b[0].split(",").map(Number);
    if (ax !== bx) return ax - bx;
    return ay - by;
  }).map(([key, lvl]) => {
    const [sx, sy] = key.split(",").map(Number);
    return renderAnimatedGrassCell(sx, sy, lvl, schedule, cycleMs);
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${boardW}" height="${boardH}" viewBox="0 0 ${boardW} ${boardH}" role="img" aria-label="Contribution graph animation">
<title>Tetrass</title>
${buildSymbols(safe)}
<rect width="100%" height="100%" fill="${safe.canvas}"/>
<g id="emptyCells">
${renderEmptyGrid()}
</g>
<!-- grassDrops: animated non-zero cells only. All-zero boards keep this group empty (stable id for DOM/tests). -->
<g id="grassDrops">
${drops}
</g>
</svg>`;
}

// src/generateRunner.ts
function paletteFor(kind) {
  return kind === "dark" ? PALETTE_DARK : PALETTE_LIGHT;
}
function resolveWorkspaceRoots(workspaceRoot) {
  const workspaceRootResolved = workspaceRoot ? resolve(workspaceRoot) : null;
  let workspaceRootCanonical = null;
  if (workspaceRootResolved) {
    try {
      workspaceRootCanonical = realpathSync(workspaceRootResolved);
    } catch {
      workspaceRootCanonical = workspaceRootResolved;
    }
  }
  return { workspaceRootResolved, workspaceRootCanonical };
}
async function renderAndWriteGrassOutputs(opts) {
  const { svgByPalette, outputs, workspaceRootCanonical } = opts;
  for (const out of outputs) {
    let filePath = out.filePath;
    if (workspaceRootCanonical) {
      assertPathInsideRoot(filePath, workspaceRootCanonical, { requireProperDescendant: true });
    }
    const svg = svgByPalette.get(out.palette);
    if (!svg) {
      throw new Error(`Missing SVG for palette '${out.palette}'`);
    }
    const dir = dirname(filePath);
    let writeTarget = filePath;
    if (workspaceRootCanonical) {
      const dirParts = relative(workspaceRootCanonical, resolve(dir)).split(sep).filter((p) => p.length > 0);
      let validatedDir = workspaceRootCanonical;
      for (const part of dirParts) {
        const next = join(validatedDir, part);
        if (existsSync(next)) {
          validatedDir = realpathSync(next);
          assertPathInsideRoot(validatedDir, workspaceRootCanonical);
        } else {
          await mkdir(next, { recursive: true });
          validatedDir = realpathSync(next);
          assertPathInsideRoot(validatedDir, workspaceRootCanonical);
        }
      }
      writeTarget = resolve(validatedDir, basename(filePath));
      assertPathInsideRoot(writeTarget, workspaceRootCanonical);
      await writeUtf8FileRejectSymlinkTarget(writeTarget, svg);
    } else {
      await mkdir(dir, { recursive: true });
      await writeFile(writeTarget, svg, "utf8");
    }
  }
  console.log(`Wrote ${outputs.length} SVG file(s) (group-drop animation).`);
}
async function runTetrassGenerate(opts) {
  const { login, token, outputs, useSample, workspaceRoot, allowUnauthenticatedFallback } = opts;
  if (outputs.length === 0) throw new Error("At least one output path is required.");
  const cal = await fetchOrBuildContributionCalendar({
    login,
    token,
    useSample,
    allowUnauthenticatedFallback
  });
  const { board, meta } = contributionCalendarToLevelBoard(cal);
  const groups = splitBoardIntoColumnGroups(board, meta);
  const segments = buildDropSchedule(groups);
  const { workspaceRootResolved, workspaceRootCanonical } = resolveWorkspaceRoots(workspaceRoot);
  const outputsForRender = workspaceRootResolved != null ? outputs.map((o) => ({
    ...o,
    filePath: canonicalizeOutputPathUnderWorkspace(resolve(o.filePath), workspaceRootResolved)
  })) : outputs;
  const seenOutputPaths = /* @__PURE__ */ new Set();
  for (const { filePath } of outputsForRender) {
    if (seenOutputPaths.has(filePath)) {
      throw new Error(`Duplicate output path resolved to '${filePath}'.`);
    }
    seenOutputPaths.add(filePath);
  }
  const neededPalettes = new Set(outputsForRender.map((o) => o.palette));
  const svgByPalette = /* @__PURE__ */ new Map();
  if (neededPalettes.has("light")) {
    svgByPalette.set("light", buildGrassDropSvg(segments, paletteFor("light")));
  }
  if (neededPalettes.has("dark")) {
    svgByPalette.set("dark", buildGrassDropSvg(segments, paletteFor("dark")));
  }
  await renderAndWriteGrassOutputs({
    svgByPalette,
    outputs: outputsForRender,
    workspaceRootCanonical
  });
}
function parseOutputLines(raw, workspaceRoot) {
  const normalizedRoot = resolve(workspaceRoot);
  const lines = raw.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let filePart = trimmed;
    let palette = "light";
    const q = trimmed.indexOf("?");
    if (q >= 0) {
      filePart = trimmed.slice(0, q).trim();
      const query = trimmed.slice(q + 1);
      const params = new URLSearchParams(query);
      const pal = params.get("palette");
      if (pal === "github-dark" || pal === "dark") palette = "dark";
      else if (pal && pal !== "light") {
        console.warn(`Unrecognized palette '${pal}' for output '${filePart}'; defaulting to light.`);
      }
    }
    if (!filePart) {
      throw new Error(`Invalid output path: '${trimmed}'`);
    }
    const abs = resolve(workspaceRoot, filePart);
    const filePath = canonicalizeOutputPathUnderWorkspace(abs, normalizedRoot);
    result.push({ filePath, palette });
  }
  return result;
}
function assertPathInsideRoot(filePath, root, opts) {
  const resolvedPath = resolve(filePath);
  const resolvedRoot = resolve(root);
  const rel = relative(resolvedRoot, resolvedPath);
  if (isAbsolute(rel)) {
    throw new Error(`Output path '${filePath}' is outside workspace root '${root}'.`);
  }
  if (opts?.requireProperDescendant && (rel === "" || rel === ".")) {
    throw new Error(`Output path '${filePath}' must be a file under workspace root '${root}'.`);
  }
  if (rel === "") return;
  if (rel.startsWith("..") || rel.includes(`${sep}..${sep}`) || rel === "..") {
    throw new Error(`Output path '${filePath}' is outside workspace root '${root}'.`);
  }
}
function canonicalWorkspaceRootDir(workspaceResolved) {
  try {
    return realpathSync(workspaceResolved);
  } catch {
    return workspaceResolved;
  }
}
function canonicalizeOutputPathUnderWorkspace(lexicalAbs, workspaceResolved) {
  const rootCanon = canonicalWorkspaceRootDir(workspaceResolved);
  assertPathInsideRoot(lexicalAbs, workspaceResolved, { requireProperDescendant: true });
  const rel = relative(workspaceResolved, lexicalAbs);
  const parts = rel.split(sep).filter((p) => p.length > 0);
  let cur = rootCanon;
  for (let i = 0; i < parts.length; i++) {
    const step = join(cur, parts[i]);
    if (existsSync(step)) {
      cur = realpathSync(step);
      assertPathInsideRoot(cur, rootCanon);
    } else {
      cur = join(cur, ...parts.slice(i));
      break;
    }
  }
  assertPathInsideRoot(cur, rootCanon);
  return cur;
}
function isErrnoCode(e, code) {
  return typeof e === "object" && e !== null && "code" in e && e.code === code;
}
async function writeUtf8FileRejectSymlinkTarget(filePath, data) {
  if (fsConstants.O_NOFOLLOW === void 0) {
    try {
      const st = await lstat(filePath);
      if (st.isSymbolicLink()) {
        throw new Error(`Refusing to write through symbolic link: '${filePath}'`);
      }
    } catch (e) {
      if (!isErrnoCode(e, "ENOENT")) throw e;
    }
    await writeFile(filePath, data, "utf8");
    return;
  }
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
  let handle;
  try {
    handle = await open(filePath, flags, 420);
  } catch (e) {
    if (isErrnoCode(e, "ELOOP")) {
      throw new Error(`Refusing to open symbolic link as output: '${filePath}'`);
    }
    throw e;
  }
  try {
    await handle.writeFile(data, "utf8");
  } finally {
    await handle.close();
  }
}

// src/resolveGenerateOptions.ts
import { join as join2 } from "node:path";
var GITHUB_LOGIN_LIKE = /^(?!.*--)[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
function resolveGenerateOptions(env, args) {
  const useSample = env.TETRASS_USE_SAMPLE === "1" || env.TETRASS_OFFLINE === "1";
  const token = env.GITHUB_TOKEN?.trim() || void 0;
  if (args.context === "cli") {
    const repoRoot = args.repoRoot;
    const login2 = env.GITHUB_LOGIN?.trim() || env.GITHUB_REPOSITORY_OWNER?.trim() || env.INPUT_GITHUB_USER_NAME?.trim();
    if (!login2 && !useSample) {
      throw new Error(
        "Set GITHUB_LOGIN or GITHUB_REPOSITORY_OWNER, or TETRASS_USE_SAMPLE=1 for offline mode."
      );
    }
    if (login2 && !GITHUB_LOGIN_LIKE.test(login2)) {
      throw new Error("Invalid GitHub username format.");
    }
    const outputsEnv = env.TETRASS_OUTPUTS?.trim();
    const outputs2 = outputsEnv ? parseOutputLines(outputsEnv, repoRoot) : [
      { filePath: join2(repoRoot, "img", "tetrass.svg"), palette: "light" },
      { filePath: join2(repoRoot, "img", "tetrass-dark.svg"), palette: "dark" }
    ];
    return {
      login: login2 ?? "sample",
      token,
      outputs: outputs2,
      useSample,
      allowUnauthenticatedFallback: env.TETRASS_ALLOW_UNAUTH_FALLBACK === "1",
      workspaceRoot: repoRoot
    };
  }
  const login = env.INPUT_GITHUB_USER_NAME?.trim();
  if (!login) {
    throw new Error("INPUT_GITHUB_USER_NAME is required.");
  }
  if (!GITHUB_LOGIN_LIKE.test(login)) {
    throw new Error("Invalid GitHub username format.");
  }
  const outputsRaw = env.INPUT_OUTPUTS ?? "";
  const workspace = env.GITHUB_WORKSPACE ?? process.cwd();
  const outputs = parseOutputLines(outputsRaw, workspace);
  if (outputs.length === 0) {
    throw new Error("INPUT_OUTPUTS must list at least one output path.");
  }
  if (!useSample && !token) {
    throw new Error(
      "GITHUB_TOKEN is required unless using sample/offline mode (set TETRASS_USE_SAMPLE=1 or TETRASS_OFFLINE=1)."
    );
  }
  return {
    login,
    token,
    outputs,
    useSample,
    workspaceRoot: workspace
  };
}

// src/action-entry.ts
function setFailedForGitHubActions(message) {
  process.exitCode = 1;
  const escaped = message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  process.stdout.write(`::error::${escaped}
`);
}
async function main() {
  const opts = resolveGenerateOptions(process.env, { context: "github-action" });
  await runTetrassGenerate(opts);
}
main().catch((e) => {
  const message = e instanceof Error ? e.message : "Unknown error";
  setFailedForGitHubActions(message);
});
