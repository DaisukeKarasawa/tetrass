// src/generateRunner.ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

// src/domain/types.ts
var BOARD_WIDTH = 10;
var BOARD_HEIGHT = 20;

// src/io/contributions.ts
var GRAPHQL = `
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
async function fetchContributionCalendar(login, token) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "tetrass-generator"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: GRAPHQL, variables: { login } })
  });
  if (!res.ok) {
    throw new Error(`GitHub GraphQL HTTP ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  const cal = body.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error("No contribution calendar returned (user missing or private?)");
  return cal;
}
function flattenContributionDays(cal) {
  const days = [];
  for (const w of cal.weeks) {
    for (const d of w.contributionDays) days.push(d);
  }
  return days;
}
var CELLS = BOARD_WIDTH * BOARD_HEIGHT;
function contributionDaysToTargetBoard(days) {
  const values = days.map((d) => d.contributionCount > 0 ? 1 : 0);
  const need = CELLS;
  const slice = values.length >= need ? values.slice(values.length - need) : [...Array(need - values.length).fill(0), ...values];
  const board = Array.from(
    { length: BOARD_HEIGHT },
    () => Array.from({ length: BOARD_WIDTH }, () => 0)
  );
  let i = 0;
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[y][x] = slice[i];
      i++;
    }
  }
  return board;
}
function buildSampleContributionDays() {
  const days = [];
  const start = /* @__PURE__ */ new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < 400; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const contributionCount = (i * 17 + i % 5) % 11 > 3 ? 1 : 0;
    days.push({ date, contributionCount });
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

// src/domain/board.ts
function createEmptyBoard() {
  return Array.from(
    { length: BOARD_HEIGHT },
    () => Array.from({ length: BOARD_WIDTH }, () => 0)
  );
}
function cloneBoard(board) {
  return board.map((row) => [...row]);
}
function boardKey(board) {
  let s = "";
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      s += board[y][x] ? "1" : "0";
    }
  }
  return s;
}
function boardsEqual(a, b) {
  return boardKey(a) === boardKey(b);
}
function clearFullRows(board) {
  let cleared = 0;
  const newRows = [];
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    const full = board[y].every((c) => c === 1);
    if (full) cleared++;
    else newRows.push([...board[y]]);
  }
  while (newRows.length < BOARD_HEIGHT) {
    newRows.push(Array.from({ length: BOARD_WIDTH }, () => 0));
  }
  newRows.reverse();
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    board[y] = newRows[y];
  }
  return cleared;
}
function lockCellsOverlapStack(board, cells) {
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
      return { ok: false, reason: "out_of_bounds" };
    }
    if (board[cy][cx] === 1) return { ok: false, reason: "overlap" };
  }
  return { ok: true };
}
function pieceCanMoveDownOnBoard(board, p) {
  const cells = getCells(p.type, p.rotation, p.x, p.y + 1);
  for (const [cx, cy] of cells) {
    if (cy >= BOARD_HEIGHT) return false;
    if (cy < 0) continue;
    if (board[cy][cx] === 1) return false;
  }
  return true;
}
function isValidLock(board, p) {
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  if (!lockCellsOverlapStack(board, cells).ok) return false;
  return !pieceCanMoveDownOnBoard(board, p);
}
function applyPlacement(board, p) {
  const cells = getCells(p.type, p.rotation, p.x, p.y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
      throw new Error(`Invalid placement out of bounds: (${cx}, ${cy})`);
    }
    board[cy][cx] = 1;
  }
  return { linesCleared: clearFullRows(board) };
}

// src/planner/diversityPad.ts
var DIVERSITY_PAD_Y_LOW = BOARD_HEIGHT - 2;
var DIVERSITY_PAD_Y_HIGH = BOARD_HEIGHT - 3;
var EMBEDDED_PAD = [
  { placement: { type: "I", rotation: 0, x: 0, y: DIVERSITY_PAD_Y_LOW } },
  { placement: { type: "I", rotation: 0, x: 0, y: DIVERSITY_PAD_Y_HIGH } },
  { placement: { type: "I", rotation: 0, x: 5, y: DIVERSITY_PAD_Y_LOW } },
  { placement: { type: "J", rotation: 2, x: 7, y: DIVERSITY_PAD_Y_HIGH } },
  { placement: { type: "L", rotation: 2, x: 4, y: DIVERSITY_PAD_Y_HIGH } }
];
function planDiversityPadAfterIntro() {
  return EMBEDDED_PAD.map((step) => ({ placement: { ...step.placement } }));
}
function assertDiversityPadValid(pad) {
  let b = createEmptyBoard();
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

// src/simulator/simulateReplay.ts
var SPAWN_ROWS_ABOVE_LOCK = 24;
var MAX_SOFT_DROP_SAMPLE_STEPS = 8;
function placementFits(board, cells) {
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_WIDTH) return false;
    if (cy >= BOARD_HEIGHT) return false;
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
function simulateReplayForFrames(script) {
  const board = createEmptyBoard();
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
    let current = spawnAboveLock(lock);
    const targetY = lock.y;
    const stride = dropStride(targetY - current.y);
    frames.push({ board: cloneBoard(board), active: current, linesClearedThisLock: 0 });
    while (current.y < targetY) {
      const nextY = Math.min(targetY, current.y + stride);
      const next = { ...current, y: nextY };
      const cells = getCells(next.type, next.rotation, next.x, next.y);
      if (!placementFits(board, cells)) break;
      current = next;
      if (current.y < targetY) {
        frames.push({ board: cloneBoard(board), active: current, linesClearedThisLock: 0 });
      }
    }
    while (current.y < targetY) {
      const next = { ...current, y: current.y + 1 };
      const cells = getCells(next.type, next.rotation, next.x, next.y);
      if (!placementFits(board, cells)) break;
      current = next;
    }
    if (current.x !== lock.x || current.y !== lock.y || current.rotation !== lock.rotation) {
      throw new Error(
        `Drop did not reach lock: got ${JSON.stringify(current)} want ${JSON.stringify(lock)}`
      );
    }
    frames.push({ board: cloneBoard(board), active: current, linesClearedThisLock: 0 });
    const { linesCleared } = applyPlacement(board, lock);
    totalLineClears += linesCleared;
    frames.push({
      board: cloneBoard(board),
      active: null,
      linesClearedThisLock: linesCleared
    });
  }
  return { frames, finalBoard: board, totalLineClears, usedTypes };
}
function simulateReplayFast(script) {
  const board = createEmptyBoard();
  let totalLineClears = 0;
  const usedTypes = /* @__PURE__ */ new Set();
  for (const step of script.steps) {
    usedTypes.add(step.placement.type);
    if (!isValidLock(board, step.placement)) {
      throw new Error(`Invalid lock placement: ${JSON.stringify(step.placement)}`);
    }
    totalLineClears += applyPlacement(board, step.placement).linesCleared;
  }
  return { frames: [], finalBoard: board, totalLineClears, usedTypes };
}

// src/planner/introClear.ts
function planScriptedDoubleClearIntro() {
  const steps = [];
  for (const x of [0, 2, 4, 6, 8]) {
    steps.push({ placement: { type: "O", rotation: 0, x, y: BOARD_HEIGHT - 2 } });
  }
  return steps;
}
function assertIntroValid(intro) {
  const r = simulateReplayFast({ steps: intro });
  if (r.totalLineClears !== 2) throw new Error("Intro must clear exactly two lines.");
  const empty = r.finalBoard.every((row) => row.every((c) => c === 0));
  if (!empty) throw new Error("Intro must end on an empty board.");
}

// src/planner/tetrominoTiling.ts
var TYPE_ORDER2 = iterateTypesInOrder();
var TILING_CANDIDATE_MIN_ORIGIN_Y = -4;
var TILING_DFS_VISIT_BUDGET_BASE = 5e5;
var TILING_DFS_VISIT_BUDGET_PER_GRASS_CELL = 15e3;
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
function grassCells(board) {
  const out = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board[y][x]) out.push([x, y]);
    }
  }
  return out;
}
function buildOptionsForTarget(target) {
  const grass = new Set(grassCells(target).map(([x, y]) => `${x},${y}`));
  const options = /* @__PURE__ */ new Map();
  for (const type of TYPE_ORDER2) {
    for (const rotation of ROTATIONS) {
      const { cells: rel, minX, minY } = normalizedShape(type, rotation);
      for (let ax = 0; ax < BOARD_WIDTH; ax++) {
        for (let ay = TILING_CANDIDATE_MIN_ORIGIN_Y; ay < BOARD_HEIGHT; ay++) {
          const abs = rel.map(([dx, dy]) => [ax + dx, ay + dy]);
          let ok = true;
          for (const [cx, cy] of abs) {
            if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) {
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
    let best = null;
    for (const [x, y] of grass) {
      const k = `${x},${y}`;
      if (filled.has(k)) continue;
      if (!best) {
        best = [x, y];
        continue;
      }
      if (y < best[1] || y === best[1] && x < best[0]) best = [x, y];
    }
    return best;
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
        if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT || !target[cy][cx]) {
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
  const board = createEmptyBoard();
  for (const p of ordered) {
    if (!isValidLock(board, p)) return null;
    applyPlacement(board, p);
  }
  if (!boardsEqual(board, target)) {
    return null;
  }
  return ordered.map((placement) => ({ placement }));
}
function tileTargetWithTrimming(target, minDistinctTypes) {
  let trimmed = cloneBoard(target);
  let trimmedCells = 0;
  const maxGrass = BOARD_WIDTH * BOARD_HEIGHT;
  for (let attempt = 0; attempt <= maxGrass; attempt++) {
    const steps = tryTile(trimmed, minDistinctTypes);
    if (steps) {
      return { steps, trimmedBoard: trimmed, trimmedCells };
    }
    const cells = grassCells(trimmed);
    if (cells.length === 0) break;
    cells.sort((a, b) => a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]);
    const [rx, ry] = cells[0];
    trimmed[ry][rx] = 0;
    trimmedCells++;
  }
  throw new Error(
    "Could not tile target (even after trimming) with the required tetromino type diversity. Try a sparser contribution grid."
  );
}

// src/planner/deterministicPlanner.ts
function countDistinctTypes(steps) {
  const s = /* @__PURE__ */ new Set();
  for (const st of steps) s.add(st.placement.type);
  return s.size;
}
function planDeterministicReplay(target) {
  const intro = planScriptedDoubleClearIntro();
  assertIntroValid(intro);
  const pad = planDiversityPadAfterIntro();
  assertDiversityPadValid(pad);
  const { steps: mainSteps, trimmedBoard, trimmedCells } = tileTargetWithTrimming(target, 0);
  if (trimmedCells > 0) {
    console.warn(
      `Contribution mask trimmed ${trimmedCells} cell(s) (top-first) so tetromino tiling is possible.`
    );
  }
  const all = [...intro, ...pad, ...mainSteps];
  if (countDistinctTypes(all) < 4) {
    throw new Error(`Shape diversity failed: only ${countDistinctTypes(all)} types in full replay.`);
  }
  return { script: { steps: all }, grassTarget: trimmedBoard };
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
var CELL = 18;
var PAD = 2;
var W = BOARD_WIDTH * CELL + PAD * 2;
var H = BOARD_HEIGHT * CELL + PAD * 2;
function cellUse(x, y, href) {
  const px = PAD + x * CELL;
  const py = PAD + y * CELL;
  return `<use href="#${href}" x="${px}" y="${py}"/>`;
}
function buildSymbols(palette) {
  const e = palette.empty;
  const g = palette.grass;
  const h = palette.ghost;
  return `<defs>
<symbol id="cE" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${e}" rx="2"/></symbol>
<symbol id="cG" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${g}" rx="2"/></symbol>
<symbol id="cH" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${h}" rx="2"/></symbol>
</defs>`;
}
function renderBoardUses(board) {
  let s = "";
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      s += cellUse(x, y, board[y][x] ? "cG" : "cE");
    }
  }
  return s;
}
function renderActiveUses(active) {
  if (!active) return "";
  const cells = getCells(active.type, active.rotation, active.x, active.y);
  let s = "";
  for (const [cx, cy] of cells) {
    if (cy >= 0 && cy < BOARD_HEIGHT && cx >= 0 && cx < BOARD_WIDTH) {
      s += cellUse(cx, cy, "cH");
    }
  }
  return s;
}
function frameToSvgInner(frame) {
  return renderBoardUses(frame.board) + renderActiveUses(frame.active);
}
function buildAnimatedSvg(frames, palette) {
  if (frames.length === 0) throw new Error("No frames to render");
  const frameDurMs = 80;
  const holdLastMs = 1500;
  const n = frames.length;
  const cycleMs = n * frameDurMs + holdLastMs;
  const groups = [];
  const T = frameDurMs / cycleMs;
  for (let i = 0; i < n; i++) {
    const inner = frameToSvgInner(frames[i]);
    if (i < n - 1) {
      const start = i * T;
      const end = (i + 1) * T;
      groups.push(`<g opacity="0">
${inner}
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${start};${end};1" values="0;1;0;0"/>
</g>`);
    } else {
      const start = i * T;
      groups.push(`<g opacity="0">
${inner}
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${start};1" values="0;1;1"/>
</g>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tetrass contribution animation">
<title>Tetrass</title>
${buildSymbols(palette)}
<rect width="100%" height="100%" fill="${palette.empty}"/>
${groups.join("\n")}
</svg>`;
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
async function runTetrassGenerate(opts) {
  const { login, token, outputs, useSample, workspaceRoot } = opts;
  if (outputs.length === 0) throw new Error("At least one output path is required.");
  let days;
  if (useSample) {
    days = buildSampleContributionDays();
    console.warn("Using deterministic sample contributions (offline/sample mode).");
  } else {
    try {
      const cal = await fetchContributionCalendar(login, token);
      days = flattenContributionDays(cal);
    } catch (e) {
      if (!token) {
        console.warn("GitHub fetch failed without token; falling back to sample contributions.", e);
        days = buildSampleContributionDays();
      } else {
        throw e;
      }
    }
  }
  const target = contributionDaysToTargetBoard(days);
  const { script, grassTarget } = planDeterministicReplay(target);
  const fast = simulateReplayFast(script);
  assertFinalMatchesTarget(fast.finalBoard, grassTarget);
  if (fast.totalLineClears < 1) {
    throw new Error("Acceptance failed: no line clears in replay.");
  }
  if (fast.usedTypes.size < 4) {
    throw new Error(`Acceptance failed: need >=4 piece types, got ${fast.usedTypes.size}`);
  }
  const { frames } = simulateReplayForFrames(script);
  const svgByPalette = /* @__PURE__ */ new Map();
  const normalizedWorkspaceRoot = workspaceRoot ? resolve(workspaceRoot) : null;
  for (const out of outputs) {
    if (normalizedWorkspaceRoot) {
      assertPathInsideRoot(out.filePath, normalizedWorkspaceRoot);
    }
    let svg = svgByPalette.get(out.palette);
    if (!svg) {
      svg = buildAnimatedSvg(frames, paletteFor(out.palette));
      svgByPalette.set(out.palette, svg);
    }
    const dir = dirname(out.filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(out.filePath, svg, "utf8");
  }
  console.log(
    `Wrote ${outputs.length} file(s) (${frames.length} frames, ${script.steps.length} locks, ${fast.totalLineClears} line clears).`
  );
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
    assertPathInsideRoot(abs, normalizedRoot);
    result.push({ filePath: abs, palette });
  }
  return result;
}
function assertPathInsideRoot(filePath, root) {
  const rel = relative(root, filePath);
  if (rel === "") return;
  if (rel.startsWith("..") || rel.includes(`${sep}..${sep}`) || rel === "..") {
    throw new Error(`Output path '${filePath}' is outside workspace root '${root}'.`);
  }
}

// src/action-entry.ts
async function main() {
  const login = process.env.INPUT_GITHUB_USER_NAME?.trim();
  const outputsRaw = process.env.INPUT_OUTPUTS ?? "";
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const token = process.env.GITHUB_TOKEN?.trim() || void 0;
  if (!login) {
    throw new Error("INPUT_GITHUB_USER_NAME is required.");
  }
  const outputs = parseOutputLines(outputsRaw, workspace);
  if (outputs.length === 0) {
    throw new Error("INPUT_OUTPUTS must list at least one output path.");
  }
  await runTetrassGenerate({
    login,
    token,
    outputs,
    useSample: process.env.TETRASS_USE_SAMPLE === "1" || process.env.TETRASS_OFFLINE === "1",
    workspaceRoot: workspace
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
