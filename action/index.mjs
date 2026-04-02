// src/generateRunner.ts
import { constants as fsConstants, existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
      throw new Error(
        `GitHub GraphQL request timed out after ${GITHUB_GRAPHQL_FETCH_TIMEOUT_MS}ms`
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
function flattenContributionDays(cal) {
  const days = [];
  for (const w of cal.weeks) {
    for (const d of w.contributionDays) days.push(d);
  }
  return days;
}
var GITHUB_WEEKDAYS = 7;
var GITHUB_VISIBLE_WEEKS = 53;
var SAMPLE_CONTRIBUTION_DAY_COUNT = 400;
function inferredWeekdayAt(day) {
  if (day.weekday != null) return day.weekday;
  const dow = (/* @__PURE__ */ new Date(`${day.date}T00:00:00Z`)).getUTCDay();
  return dow;
}
function contributionDaysToTargetBoard(days) {
  if (days.length === 0) {
    return Array.from(
      { length: GITHUB_WEEKDAYS },
      () => Array.from({ length: GITHUB_VISIBLE_WEEKS }, () => 0)
    );
  }
  const totalWeeks = Math.ceil(days.length / GITHUB_WEEKDAYS);
  const visibleWeeks = Math.min(GITHUB_VISIBLE_WEEKS, totalWeeks);
  const startDayIdx = Math.max(0, (totalWeeks - visibleWeeks) * GITHUB_WEEKDAYS);
  const visibleDays = days.slice(startDayIdx);
  const width = GITHUB_VISIBLE_WEEKS;
  const xOffset = GITHUB_VISIBLE_WEEKS - visibleWeeks;
  const board = Array.from(
    { length: GITHUB_WEEKDAYS },
    () => Array.from({ length: width }, () => 0)
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
function buildSampleContributionDays() {
  const days = [];
  const start = /* @__PURE__ */ new Date("2024-01-01T00:00:00Z");
  const sampleWeeks = Math.ceil(SAMPLE_CONTRIBUTION_DAY_COUNT / GITHUB_WEEKDAYS);
  const sampleGrassCell = (week, weekday) => {
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

// src/domain/tetromino.ts
var SHAPES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]]
  ],
  O: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]]
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]]
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]]
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]]
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]]
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]]
  ],
  M: [
    [[0, 0]],
    [[0, 0]],
    [[0, 0]],
    [[0, 0]]
  ]
};
var TYPE_ORDER = ["I", "O", "T", "S", "Z", "J", "L"];
function getCells(type, rotation, x, y) {
  const rot = rotation;
  return SHAPES[type][rot].map(([dx, dy]) => [x + dx, y + dy]);
}
function iterateTypesInOrder() {
  return [...TYPE_ORDER];
}
var ROTATIONS = [0, 1, 2, 3];

// src/domain/types.ts
var BOARD_WIDTH = 10;
var BOARD_HEIGHT = 20;

// src/domain/board.ts
function createEmptyBoard(width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  return Array.from(
    { length: height },
    () => Array.from({ length: width }, () => 0)
  );
}
function cloneBoard(board) {
  return board.map((row) => [...row]);
}
function getBoardDimensions(board) {
  const height = board.length;
  const width = height > 0 ? board[0].length : 0;
  return { width, height };
}
function boardKey(board) {
  const { width, height } = getBoardDimensions(board);
  let s = `${width}x${height}:`;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s += board[y][x] ? "1" : "0";
    }
  }
  return s;
}
function boardsEqual(a, b) {
  return boardKey(a) === boardKey(b);
}
function clearFullRows(board) {
  const { width, height } = getBoardDimensions(board);
  let cleared = 0;
  const newRows = [];
  for (let y = height - 1; y >= 0; y--) {
    const full = board[y].every((c) => c === 1);
    if (full) cleared++;
    else newRows.push([...board[y]]);
  }
  while (newRows.length < height) {
    newRows.push(Array.from({ length: width }, () => 0));
  }
  newRows.reverse();
  for (let y = 0; y < height; y++) {
    board[y] = newRows[y];
  }
  return cleared;
}
function lockCellsOverlapStack(board, cells) {
  const { width, height } = getBoardDimensions(board);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      return { ok: false, reason: "out_of_bounds" };
    }
    if (board[cy][cx] === 1) return { ok: false, reason: "overlap" };
  }
  return { ok: true };
}
function pieceCanMoveDownOnBoard(board, p) {
  const { height } = getBoardDimensions(board);
  const cells = getCells(p.type, p.rotation, p.x, p.y + 1);
  for (const [cx, cy] of cells) {
    if (cy >= height) return false;
    if (cy < 0) continue;
    if (board[cy][cx] === 1) return false;
  }
  return true;
}
function isValidLock(board, p) {
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  if (!lockCellsOverlapStack(board, cells).ok) return false;
  if (p.type === "M") return true;
  return !pieceCanMoveDownOnBoard(board, p);
}
function applyPlacement(board, p) {
  const { width, height } = getBoardDimensions(board);
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
  return { linesCleared: clearFullRows(board) };
}
function applyPlacementNoClear(board, p) {
  const { width, height } = getBoardDimensions(board);
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
}

// src/planner/diversityPad.ts
function defaultEmbeddedPad(boardHeight) {
  const yLow = boardHeight - 2;
  const yHigh = boardHeight - 3;
  return [
    { placement: { type: "I", rotation: 0, x: 0, y: yLow } },
    { placement: { type: "I", rotation: 0, x: 0, y: yHigh } },
    { placement: { type: "I", rotation: 0, x: 5, y: yLow } },
    { placement: { type: "J", rotation: 2, x: 7, y: yHigh } },
    { placement: { type: "L", rotation: 2, x: 4, y: yHigh } }
  ];
}
function planDiversityPadAfterIntro(boardWidth = 10, boardHeight = BOARD_HEIGHT) {
  if (boardWidth === 10 && boardHeight === 20) {
    return defaultEmbeddedPad(boardHeight).map((step) => ({ placement: { ...step.placement } }));
  }
  return [];
}
function assertDiversityPadValid(pad, boardWidth = 10, boardHeight = BOARD_HEIGHT) {
  if (pad.length === 0) return;
  let b = createEmptyBoard(boardWidth, boardHeight);
  let clears = 0;
  const nonO = /* @__PURE__ */ new Set();
  for (const st of pad) {
    if (!isValidLock(b, st.placement)) {
      throw new Error(`Invalid pad lock: ${JSON.stringify(st.placement)}`);
    }
    clears += applyPlacement(b, st.placement).linesCleared;
    if (st.placement.type !== "O") nonO.add(st.placement.type);
  }
  const emptyEnd = b.every((row) => row.every((c) => c === 0));
  if (!emptyEnd) throw new Error("Diversity pad must end empty.");
  if (clears < 1) throw new Error("Diversity pad must clear at least one line.");
  if (nonO.size < 3) throw new Error("Diversity pad must use at least 3 non-O tetromino types.");
}

// src/planner/introClear.ts
function planScriptedDoubleClearIntro(boardWidth = BOARD_WIDTH, boardHeight = BOARD_HEIGHT) {
  if (boardWidth <= 0 || boardHeight <= 0) return [];
  const y = boardHeight - 1;
  const steps = [];
  for (let x = 0; x < boardWidth; x++) {
    steps.push({ placement: { type: "M", rotation: 0, x, y } });
  }
  if (boardHeight >= 2) {
    const tetroY = boardHeight - 2;
    let x = 0;
    while (x + 3 < boardWidth) {
      steps.push({ placement: { type: "I", rotation: 0, x, y: tetroY } });
      x += 4;
    }
    for (; x < boardWidth; x++) {
      steps.push({ placement: { type: "M", rotation: 0, x, y } });
    }
  }
  return steps;
}
function assertIntroValid(intro, boardWidth = BOARD_WIDTH, boardHeight = BOARD_HEIGHT) {
  const board = createEmptyBoard(boardWidth, boardHeight);
  let totalClears = 0;
  for (const st of intro) {
    if (!isValidLock(board, st.placement)) {
      throw new Error(`Invalid intro lock: ${JSON.stringify(st.placement)}`);
    }
    totalClears += applyPlacement(board, st.placement).linesCleared;
  }
  if (totalClears < 1) throw new Error("Intro must clear at least one line.");
  const empty = board.every((row) => row.every((c) => c === 0));
  if (!empty) throw new Error("Intro must end on an empty board.");
}

// src/planner/tetrominoTiling.ts
var TYPE_ORDER2 = iterateTypesInOrder();
var TILING_CANDIDATE_MIN_ORIGIN_Y = -4;
var TILING_DFS_VISIT_BUDGET_BASE = 5e5;
var TILING_DFS_VISIT_BUDGET_PER_GRASS_CELL = 15e3;
var TILING_EXACT_COVER_MAX_GRASS_CELLS = 80;
function normalizedShape(type, rotation) {
  const raw = getCells(type, rotation, 0, 0);
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of raw) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  return {
    cells: raw.map(([x, y]) => [x - minX, y - minY]),
    minX,
    minY
  };
}
function countDistinctTypes(steps) {
  const used = /* @__PURE__ */ new Set();
  for (const st of steps) used.add(st.placement.type);
  return used.size;
}
function grassCells(board) {
  const { width, height } = getBoardDimensions(board);
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (board[y][x]) out.push([x, y]);
    }
  }
  return out;
}
function buildOptionsForTarget(target) {
  const { width, height } = getBoardDimensions(target);
  const grass = new Set(grassCells(target).map(([x, y]) => `${x},${y}`));
  const options = /* @__PURE__ */ new Map();
  for (const type of TYPE_ORDER2) {
    for (const rotation of ROTATIONS) {
      const { cells: rel, minX, minY } = normalizedShape(type, rotation);
      for (let ax = 0; ax < width; ax++) {
        for (let ay = TILING_CANDIDATE_MIN_ORIGIN_Y; ay < height; ay++) {
          const abs = rel.map(([dx, dy]) => [ax + dx, ay + dy]);
          let ok = true;
          for (const [cx, cy] of abs) {
            if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
              ok = false;
              break;
            }
            if (!grass.has(`${cx},${cy}`)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const p = { type, rotation, x: ax - minX, y: ay - minY };
          for (const [cx, cy] of abs) {
            const k = `${cx},${cy}`;
            const arr = options.get(k) ?? [];
            arr.push(p);
            options.set(k, arr);
          }
        }
      }
    }
  }
  return options;
}
function tryTile(target, minDistinctTypes) {
  const { width, height } = getBoardDimensions(target);
  const grass = grassCells(target);
  if (grass.length === 0) return minDistinctTypes === 0 ? [] : null;
  if (grass.length % 4 !== 0) return null;
  const optionsByCell = buildOptionsForTarget(target);
  const filled = /* @__PURE__ */ new Set();
  const usedPlacements = [];
  const typeUsed = /* @__PURE__ */ new Set();
  const maxDfsVisits = TILING_DFS_VISIT_BUDGET_BASE + grass.length * TILING_DFS_VISIT_BUDGET_PER_GRASS_CELL;
  let dfsVisitCount = 0;
  function pickNextCell() {
    for (const [x, y] of grass) {
      if (!filled.has(`${x},${y}`)) return [x, y];
    }
    return null;
  }
  function dfs() {
    if (dfsVisitCount >= maxDfsVisits) return false;
    dfsVisitCount++;
    const next = pickNextCell();
    if (!next) {
      if (typeUsed.size >= minDistinctTypes) return true;
      return false;
    }
    const [nx, ny] = next;
    const opts = optionsByCell.get(`${nx},${ny}`) ?? [];
    const sorted = [...opts].sort((a, b) => {
      const au = typeUsed.has(a.type) ? 1 : 0;
      const bu = typeUsed.has(b.type) ? 1 : 0;
      if (au !== bu) return au - bu;
      const ai = TYPE_ORDER2.indexOf(a.type);
      const bi = TYPE_ORDER2.indexOf(b.type);
      if (ai !== bi) return ai - bi;
      if (a.rotation !== b.rotation) return a.rotation - b.rotation;
      if (a.x !== b.x) return a.x - b.x;
      return a.y - b.y;
    });
    for (const p of sorted) {
      const cells = getCells(p.type, p.rotation, p.x, p.y);
      const keys = cells.map(([cx, cy]) => `${cx},${cy}`);
      if (keys.some((k) => filled.has(k))) continue;
      let allGrass = true;
      for (const [cx, cy] of cells) {
        if (cx < 0 || cx >= width || cy < 0 || cy >= height || !target[cy][cx]) {
          allGrass = false;
          break;
        }
      }
      if (!allGrass) continue;
      for (const k of keys) filled.add(k);
      usedPlacements.push(p);
      const addedType = !typeUsed.has(p.type);
      if (addedType) typeUsed.add(p.type);
      if (dfs()) return true;
      if (addedType) typeUsed.delete(p.type);
      usedPlacements.pop();
      for (const k of keys) filled.delete(k);
    }
    return false;
  }
  if (!dfs()) return null;
  const ordered = [...usedPlacements].sort((a, b) => {
    if (a.y !== b.y) return b.y - a.y;
    if (a.x !== b.x) return a.x - b.x;
    const ai = TYPE_ORDER2.indexOf(a.type);
    const bi = TYPE_ORDER2.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    return a.rotation - b.rotation;
  });
  const board = createEmptyBoard(width, height);
  for (const p of ordered) {
    if (!isValidLock(board, p)) return null;
    applyPlacementNoClear(board, p);
  }
  if (!boardsEqual(board, target)) {
    return null;
  }
  return ordered.map((placement) => ({ placement, noLineClear: true }));
}
function buildMonominoSteps(positions) {
  return positions.map(([x, y]) => ({
    placement: { type: "M", rotation: 0, x, y },
    noLineClear: true
  }));
}
function mergeAndValidate(target, tetrominoSteps, monoSteps) {
  const { width, height } = getBoardDimensions(target);
  const allSteps = [...tetrominoSteps, ...monoSteps];
  allSteps.sort((a, b) => {
    const aCells = getCells(a.placement.type, a.placement.rotation, a.placement.x, a.placement.y);
    const bCells = getCells(b.placement.type, b.placement.rotation, b.placement.x, b.placement.y);
    const aMaxY = Math.max(...aCells.map(([, cy]) => cy));
    const bMaxY = Math.max(...bCells.map(([, cy]) => cy));
    if (aMaxY !== bMaxY) return bMaxY - aMaxY;
    if (a.placement.x !== b.placement.x) return a.placement.x - b.placement.x;
    return 0;
  });
  const board = createEmptyBoard(width, height);
  for (const step of allSteps) {
    if (!isValidLock(board, step.placement)) return null;
    applyPlacementNoClear(board, step.placement);
  }
  if (!boardsEqual(board, target)) return null;
  return allSteps;
}
function tileTargetWithTrimming(target, minDistinctTypes) {
  const allGrass = grassCells(target);
  if (allGrass.length === 0) {
    return { steps: [], trimmedBoard: cloneBoard(target), trimmedCells: 0 };
  }
  const width = target[0]?.length ?? 0;
  const height = target.length;
  const boardCanUseExactCover = width >= 8 || height >= 8;
  const mayUseExactCover = boardCanUseExactCover && allGrass.length <= TILING_EXACT_COVER_MAX_GRASS_CELLS;
  if (mayUseExactCover && allGrass.length % 4 === 0) {
    const steps = tryTile(target, minDistinctTypes);
    if (steps) {
      return { steps, trimmedBoard: cloneBoard(target), trimmedCells: 0 };
    }
  }
  const reduced = cloneBoard(target);
  const removedCells = [];
  for (let i = 0; i < allGrass.length; i++) {
    const currentGrass = grassCells(reduced);
    if (currentGrass.length === 0) break;
    currentGrass.sort((a, b) => a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]);
    const [rx, ry] = currentGrass[0];
    reduced[ry][rx] = 0;
    removedCells.push([rx, ry]);
    const remCount = grassCells(reduced).length;
    if (remCount === 0) break;
    if (remCount % 4 !== 0) continue;
    if (!boardCanUseExactCover || remCount > TILING_EXACT_COVER_MAX_GRASS_CELLS) continue;
    const tetrominoSteps = tryTile(reduced, 0);
    if (!tetrominoSteps || tetrominoSteps.length === 0) continue;
    const monoSteps = buildMonominoSteps(removedCells);
    const merged = mergeAndValidate(target, tetrominoSteps, monoSteps);
    if (merged) {
      if (countDistinctTypes(merged) < minDistinctTypes) continue;
      return { steps: merged, trimmedBoard: cloneBoard(target), trimmedCells: 0 };
    }
  }
  const allMonoSteps = buildMonominoSteps(allGrass);
  allMonoSteps.sort((a, b) => {
    if (a.placement.y !== b.placement.y) return b.placement.y - a.placement.y;
    return a.placement.x - b.placement.x;
  });
  const monoTypeCount = countDistinctTypes(allMonoSteps);
  if (monoTypeCount < minDistinctTypes) {
    throw new Error(
      `Could not tile target with required piece diversity: need >=${minDistinctTypes} types, got ${monoTypeCount}.`
    );
  }
  const board = createEmptyBoard(width, height);
  for (const step of allMonoSteps) {
    if (!isValidLock(board, step.placement)) {
      throw new Error("Internal error: monomino lock validation failed.");
    }
    applyPlacementNoClear(board, step.placement);
  }
  if (!boardsEqual(board, target)) {
    throw new Error("Internal error: all-monomino fallback did not reproduce target.");
  }
  return { steps: allMonoSteps, trimmedBoard: cloneBoard(target), trimmedCells: 0 };
}

// src/planner/deterministicPlanner.ts
function countDistinctTypes2(steps) {
  const s = /* @__PURE__ */ new Set();
  for (const st of steps) s.add(st.placement.type);
  return s.size;
}
function planDeterministicReplay(target) {
  const { width, height } = getBoardDimensions(target);
  const intro = planScriptedDoubleClearIntro(width, height);
  const introTypeCount = countDistinctTypes2(intro);
  assertIntroValid(intro, width, height);
  const pad = planDiversityPadAfterIntro(width, height);
  assertDiversityPadValid(pad, width, height);
  const minDistinctTypes = width >= 10 && height >= 20 ? 4 : 2;
  const minDistinctTypesFromMain = Math.max(0, minDistinctTypes - introTypeCount);
  const { steps: mainSteps, trimmedBoard } = tileTargetWithTrimming(target, minDistinctTypesFromMain);
  const all = [...intro, ...pad, ...mainSteps];
  if (countDistinctTypes2(all) < minDistinctTypes) {
    throw new Error(`Shape diversity failed: only ${countDistinctTypes2(all)} types in full replay.`);
  }
  const script = { steps: all, boardWidth: width, boardHeight: height };
  return { script, grassTarget: trimmedBoard };
}

// src/renderer/svgRenderer.ts
var PALETTE_LIGHT = {
  empty: "#ebedf0",
  grass: "#216e39",
  ghost: "#9be9a8"
};
var PALETTE_DARK = {
  empty: "#161b22",
  grass: "#39d353",
  ghost: "#0e4429"
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
function sanitizePalette(p) {
  return {
    empty: validateColor(p.empty),
    grass: validateColor(p.grass),
    ghost: validateColor(p.ghost)
  };
}
var CELL = 18;
var PAD = 2;
var SVG_FRAME_DURATION_MS = 80;
var SVG_HOLD_LAST_FRAME_MS = 1500;
function cellUse(x, y, href) {
  const px = PAD + x * CELL;
  const py = PAD + y * CELL;
  return `<use href="#${href}" x="${px}" y="${py}"/>`;
}
function getFrameBoardDimensions(frames) {
  const first = frames[0];
  if (!first) return { width: BOARD_WIDTH, height: BOARD_HEIGHT };
  const { width, height } = getBoardDimensions(first.board);
  return {
    width: width || BOARD_WIDTH,
    height: height || BOARD_HEIGHT
  };
}
function buildSymbols(palette) {
  const { empty: e, grass: g, ghost: h } = palette;
  return `<defs>
<symbol id="cE" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${e}" rx="2"/></symbol>
<symbol id="cG" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${g}" rx="2"/></symbol>
<symbol id="cH" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${h}" rx="2"/></symbol>
</defs>`;
}
function renderActiveUses(active, width, height) {
  if (!active) return "";
  const cells = getCells(active.type, active.rotation, active.x, active.y);
  let s = "";
  const safeWidth = Math.max(width, 0);
  const safeHeight = Math.max(height, 0);
  for (const [cx, cy] of cells) {
    if (cy >= 0 && cy < safeHeight && cx >= 0 && cx < safeWidth) {
      s += cellUse(cx, cy, "cH");
    }
  }
  return s;
}
function toKeyTime(frameIdx, frameDurMs, cycleMs) {
  return (frameIdx * frameDurMs / cycleMs).toFixed(6);
}
function renderBaseEmptyGrid(width, height) {
  let s = "";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) s += cellUse(x, y, "cE");
  }
  return s;
}
function renderBoardCellAnimations(frames, width, height, frameDurMs, cycleMs) {
  const n = frames.length;
  let out = "";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const states = [];
      for (let i = 0; i < n; i++) states.push(frames[i].board[y][x] ? 1 : 0);
      const values = [];
      const keyTimes = [];
      let prev = states[0] ?? 0;
      values.push(String(prev));
      keyTimes.push("0");
      for (let i = 1; i < n; i++) {
        const cur = states[i];
        if (cur === prev) continue;
        keyTimes.push(toKeyTime(i, frameDurMs, cycleMs));
        values.push(String(cur));
        prev = cur;
      }
      keyTimes.push("1");
      values.push(String(prev));
      if (!values.some((v) => v === "1")) continue;
      const px = PAD + x * CELL;
      const py = PAD + y * CELL;
      out += `<use href="#cG" x="${px}" y="${py}" opacity="${states[0] ? 1 : 0}">
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="${keyTimes.join(";")}" values="${values.join(";")}"/>
</use>`;
    }
  }
  return out;
}
function renderActiveGroups(frames, width, height, frameDurMs, cycleMs) {
  const n = frames.length;
  const groups = [];
  for (let i = 0; i < n; i++) {
    const inner = renderActiveUses(frames[i].active, width, height);
    if (!inner) continue;
    if (i < n - 1) {
      const start = toKeyTime(i, frameDurMs, cycleMs);
      const end = toKeyTime(i + 1, frameDurMs, cycleMs);
      groups.push(`<g opacity="0">
${inner}
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${start};${end};1" values="0;1;0;0"/>
</g>`);
    } else {
      const start = toKeyTime(i, frameDurMs, cycleMs);
      groups.push(`<g opacity="0">
${inner}
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${start};1" values="0;1;1"/>
</g>`);
    }
  }
  return groups.join("\n");
}
function buildAnimatedSvg(frames, palette) {
  if (frames.length === 0) throw new Error("No frames to render");
  const safePalette = sanitizePalette(palette);
  const { width: boardWidth, height: boardHeight } = getFrameBoardDimensions(frames);
  const W = boardWidth * CELL + PAD * 2;
  const H = boardHeight * CELL + PAD * 2;
  const frameDurMs = SVG_FRAME_DURATION_MS;
  const holdLastMs = SVG_HOLD_LAST_FRAME_MS;
  const n = frames.length;
  const cycleMs = n * frameDurMs + holdLastMs;
  const emptyGrid = renderBaseEmptyGrid(boardWidth, boardHeight);
  const boardAnim = renderBoardCellAnimations(frames, boardWidth, boardHeight, frameDurMs, cycleMs);
  const activeAnim = renderActiveGroups(frames, boardWidth, boardHeight, frameDurMs, cycleMs);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tetrass contribution animation">
<title>Tetrass</title>
${buildSymbols(safePalette)}
<rect width="100%" height="100%" fill="${safePalette.empty}"/>
${emptyGrid}
${boardAnim}
${activeAnim}
</svg>`;
}

// src/simulator/simulateReplay.ts
var SPAWN_ROWS_ABOVE_LOCK = 24;
var MAX_SOFT_DROP_SAMPLE_STEPS = 8;
function placementFits(board, cells) {
  const height = board.length;
  const width = height > 0 ? board[0].length : 0;
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= width) return false;
    if (cy >= height) return false;
    if (cy >= 0 && board[cy][cx] === 1) return false;
  }
  return true;
}
function spawnAboveLock(p) {
  return { ...p, y: p.y - SPAWN_ROWS_ABOVE_LOCK };
}
function dropStride(dropRows) {
  if (dropRows <= 0) return 1;
  return Math.max(1, Math.ceil(dropRows / MAX_SOFT_DROP_SAMPLE_STEPS));
}
function appendPreLockDropFrames(frames, board, lock) {
  let current = spawnAboveLock(lock);
  const targetY = lock.y;
  const stride = dropStride(targetY - current.y);
  const verticalPath = [current];
  while (current.y < targetY) {
    const nextY = Math.min(targetY, current.y + stride);
    const next = { ...current, y: nextY };
    const cells = getCells(next.type, next.rotation, next.x, next.y);
    if (!placementFits(board, cells)) break;
    current = next;
    if (current.y < targetY) {
      verticalPath.push(current);
    }
  }
  while (current.y < targetY) {
    const next = { ...current, y: current.y + 1 };
    const cells = getCells(next.type, next.rotation, next.x, next.y);
    if (!placementFits(board, cells)) break;
    current = next;
  }
  const verticalReachesLock = current.x === lock.x && current.y === lock.y && current.rotation === lock.rotation;
  if (verticalReachesLock) {
    verticalPath.push(current);
    for (const p of verticalPath) {
      frames.push({ board: cloneBoard(board), active: p, linesClearedThisLock: 0 });
    }
  } else {
    frames.push({
      board: cloneBoard(board),
      active: spawnAboveLock(lock),
      linesClearedThisLock: 0
    });
    frames.push({ board: cloneBoard(board), active: lock, linesClearedThisLock: 0 });
  }
}
function simulateReplayForFrames(script) {
  const board = createEmptyBoard(script.boardWidth ?? BOARD_WIDTH, script.boardHeight ?? BOARD_HEIGHT);
  const frames = [];
  let totalLineClears = 0;
  const usedTypes = /* @__PURE__ */ new Set();
  frames.push({ board: cloneBoard(board), active: null, linesClearedThisLock: 0 });
  for (const step of script.steps) {
    const lock = step.placement;
    usedTypes.add(lock.type);
    if (!isValidLock(board, lock)) {
      throw new Error(`Invalid lock placement: ${JSON.stringify(lock)}`);
    }
    appendPreLockDropFrames(frames, board, lock);
    let linesCleared = 0;
    if (step.noLineClear) {
      applyPlacementNoClear(board, lock);
    } else {
      linesCleared = applyPlacement(board, lock).linesCleared;
      totalLineClears += linesCleared;
    }
    frames.push({
      board: cloneBoard(board),
      active: null,
      linesClearedThisLock: linesCleared
    });
  }
  return { frames, finalBoard: board, totalLineClears, usedTypes };
}
function simulateReplayFast(script) {
  const board = createEmptyBoard(script.boardWidth ?? BOARD_WIDTH, script.boardHeight ?? BOARD_HEIGHT);
  let totalLineClears = 0;
  const usedTypes = /* @__PURE__ */ new Set();
  for (const step of script.steps) {
    usedTypes.add(step.placement.type);
    if (!isValidLock(board, step.placement)) {
      throw new Error(`Invalid lock placement: ${JSON.stringify(step.placement)}`);
    }
    if (step.noLineClear) {
      applyPlacementNoClear(board, step.placement);
    } else {
      totalLineClears += applyPlacement(board, step.placement).linesCleared;
    }
  }
  return { frames: [], finalBoard: board, totalLineClears, usedTypes };
}

// src/verify/finalBoardMatcher.ts
function assertFinalMatchesTarget(finalBoard, target) {
  if (!boardsEqual(finalBoard, target)) {
    throw new Error("Final board does not match target grass board.");
  }
}

// src/generateRunner.ts
function paletteFor(kind) {
  return kind === "dark" ? PALETTE_DARK : PALETTE_LIGHT;
}
async function fetchOrBuildContributionDays(opts) {
  const { login, token, useSample, allowUnauthenticatedFallback = false } = opts;
  if (useSample) {
    console.warn("Using deterministic sample contributions (offline/sample mode).");
    return buildSampleContributionDays();
  }
  try {
    const cal = await fetchContributionCalendar(login, token);
    return flattenContributionDays(cal);
  } catch (e) {
    if (!token) {
      if (allowUnauthenticatedFallback) {
        console.warn(
          "GitHub fetch failed without token; falling back to sample contributions (TETRASS_ALLOW_UNAUTH_FALLBACK=1)."
        );
        return buildSampleContributionDays();
      }
      throw new Error(
        "GitHub fetch failed with no GITHUB_TOKEN. Set GITHUB_TOKEN for real contribution data, use TETRASS_USE_SAMPLE=1 (or TETRASS_OFFLINE=1) for offline sample mode, or set TETRASS_ALLOW_UNAUTH_FALLBACK=1 for CLI-only opt-in when an unauthenticated fetch fails."
      );
    }
    throw new Error(`GitHub API request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function planAndVerifyReplay(days) {
  const target = contributionDaysToTargetBoard(days);
  const { script, grassTarget } = planDeterministicReplay(target);
  const fast = simulateReplayFast(script);
  assertFinalMatchesTarget(fast.finalBoard, grassTarget);
  if (fast.totalLineClears < 1) {
    throw new Error("Acceptance failed: no line clears in replay.");
  }
  const boardHeight = script.boardHeight ?? grassTarget.length;
  const boardWidth = script.boardWidth ?? (grassTarget[0]?.length ?? 0);
  const minDistinctTypes = boardWidth >= 10 && boardHeight >= 20 ? 4 : 2;
  if (fast.usedTypes.size < minDistinctTypes) {
    throw new Error(
      `Acceptance failed: need >=${minDistinctTypes} piece types, got ${fast.usedTypes.size}`
    );
  }
  return { script, grassTarget, fast };
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
async function renderAndWriteReplayOutputs(opts) {
  const { script, fast, outputs, workspaceRootCanonical } = opts;
  const { frames } = simulateReplayForFrames(script);
  const svgByPalette = /* @__PURE__ */ new Map();
  for (const out of outputs) {
    let filePath = out.filePath;
    if (workspaceRootCanonical) {
      assertPathInsideRoot(filePath, workspaceRootCanonical, { requireProperDescendant: true });
    }
    let svg = svgByPalette.get(out.palette);
    if (!svg) {
      svg = buildAnimatedSvg(frames, paletteFor(out.palette));
      svgByPalette.set(out.palette, svg);
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
  console.log(
    `Wrote ${outputs.length} file(s) (${frames.length} frames, ${script.steps.length} locks, ${fast.totalLineClears} line clears).`
  );
}
async function runTetrassGenerate(opts) {
  const { login, token, outputs, useSample, workspaceRoot, allowUnauthenticatedFallback } = opts;
  if (outputs.length === 0) throw new Error("At least one output path is required.");
  const days = await fetchOrBuildContributionDays({
    login,
    token,
    useSample,
    allowUnauthenticatedFallback
  });
  const { script, fast } = planAndVerifyReplay(days);
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
  await renderAndWriteReplayOutputs({
    script,
    fast,
    outputs: outputsForRender,
    workspaceRootResolved,
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
        console.warn(
          `Unrecognized palette '${pal}' for output '${filePart}'; defaulting to light.`
        );
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
