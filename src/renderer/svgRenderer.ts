import type { GrassDropLevel, GroupDropSegment } from "../domain/grass.js";
import { GRID_VISIBLE_WEEKS, GRID_WEEKDAYS } from "../domain/grass.js";
import { totalCycleMs } from "../grass/groupDropPlanner.js";

/**
 * GitHub-style contribution colors. Level 0 is the empty cell (not background).
 * FIRST_QUARTILE = lightest green … FOURTH_QUARTILE = strongest.
 */
export interface GrassPalette {
  emptyCell: string;
  level1: string;
  level2: string;
  level3: string;
  level4: string;
  /** SVG canvas behind the grid (page background). */
  canvas: string;
}

export const PALETTE_LIGHT: GrassPalette = {
  canvas: "#ffffff",
  emptyCell: "#ebedf0",
  level1: "#9be9a8",
  level2: "#40c463",
  level3: "#30a14e",
  level4: "#216e39",
};

export const PALETTE_DARK: GrassPalette = {
  canvas: "#0d1117",
  emptyCell: "#161b22",
  level1: "#0e4429",
  level2: "#006d32",
  level3: "#26a641",
  level4: "#39d353",
};

const DEFAULT_SAFE_COLOR = "#ebedf0";

const CSS_NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  ),
);

function hasDangerousColorContent(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (
    raw.includes('"') ||
    raw.includes("'") ||
    raw.includes("<") ||
    raw.includes(">") ||
    raw.includes("&") ||
    raw.includes("\\")
  ) {
    return true;
  }
  if (lower.includes("url(")) return true;
  if (raw.includes("/*") || raw.includes("*/")) return true;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return true;
  return false;
}

function validateRgbLikeChannel(part: string): boolean {
  const p = part.trim();
  if (p.endsWith("%")) {
    const n = p.slice(0, -1);
    if (!/^\d+(\.\d+)?$/.test(n)) return false;
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 && v <= 100;
  }
  if (!/^\d+$/.test(p)) return false;
  const v = Number(p);
  return v >= 0 && v <= 255;
}

function validateAlphaChannel(part: string): boolean {
  const p = part.trim();
  if (p.endsWith("%")) {
    const n = p.slice(0, -1);
    if (!/^\d+(\.\d+)?$/.test(n)) return false;
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 && v <= 100;
  }
  if (!/^\d+(\.\d+)?$/.test(p)) return false;
  const v = Number(p);
  return Number.isFinite(v) && v >= 0 && v <= 1;
}

function isValidRgbFunction(value: string): boolean {
  const m = /^rgb\(\s*([^)]+)\)$/i.exec(value);
  if (!m) return false;
  const parts = m[1].split(",").map((x) => x.trim());
  if (parts.length !== 3) return false;
  return parts.every(validateRgbLikeChannel);
}

function isValidRgbaFunction(value: string): boolean {
  const m = /^rgba\(\s*([^)]+)\)$/i.exec(value);
  if (!m) return false;
  const parts = m[1].split(",").map((x) => x.trim());
  if (parts.length !== 4) return false;
  const [r, g, b, a] = parts;
  return validateRgbLikeChannel(r) && validateRgbLikeChannel(g) && validateRgbLikeChannel(b) && validateAlphaChannel(a);
}

export function validateColor(value: string): string {
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

export function sanitizeGrassPalette(p: GrassPalette): GrassPalette {
  return {
    canvas: validateColor(p.canvas),
    emptyCell: validateColor(p.emptyCell),
    level1: validateColor(p.level1),
    level2: validateColor(p.level2),
    level3: validateColor(p.level3),
    level4: validateColor(p.level4),
  };
}

const cellSize = 18;
const step = 20; // cellSize + 2px gap
const PAD = 2;
const RX = 2;
/** Fraction of cycle used to snap back to the initial state before repeat. */
const CYCLE_TAIL_RESET = 0.0012;

function cellPx(x: number, y: number): { px: number; py: number } {
  return { px: PAD + x * step, py: PAD + y * step };
}

function cellUse(x: number, y: number, href: string): string {
  const { px, py } = cellPx(x, y);
  return `<use href="#${href}" x="${px}" y="${py}"/>`;
}

function buildSymbols(p: GrassPalette): string {
  const { emptyCell: e, level1: l1, level2: l2, level3: l3, level4: l4 } = p;
  const sym = (id: string, fill: string) =>
    `<symbol id="${id}" viewBox="0 0 ${cellSize} ${cellSize}"><rect width="${cellSize}" height="${cellSize}" fill="${fill}" rx="${RX}"/></symbol>`;
  return `<defs>
${sym("cE", e)}
${sym("cG1", l1)}
${sym("cG2", l2)}
${sym("cG3", l3)}
${sym("cG4", l4)}
</defs>`;
}

function levelHref(level: GrassDropLevel): string {
  return `cG${level}`;
}

/** SMIL keyTimes must be strictly increasing; when `startMs === 0`, omit the duplicate leading `0`. */
function smilDropTimeline(
  startMs: number,
  dropDurationMs: number,
  cycleMs: number,
  fallPx: number,
): { keyTimes: string; translateValues: string; opValues: string } {
  const a = startMs / cycleMs;
  const b = (startMs + dropDurationMs) / cycleMs;
  const r = Math.max(0, 1 - CYCLE_TAIL_RESET);
  const fmt = (t: number): string => t.toFixed(6);
  if (a <= Number.EPSILON) {
    return {
      keyTimes: `0;${fmt(b)};${fmt(r)};1`,
      translateValues: `0,-${fallPx};0,0;0,0;0,-${fallPx}`,
      opValues: `1;1;0;0`,
    };
  }
  return {
    keyTimes: `0;${fmt(a)};${fmt(b)};${fmt(r)};1`,
    translateValues: `0,-${fallPx};0,-${fallPx};0,0;0,0;0,-${fallPx}`,
    opValues: `0;1;1;0;0`,
  };
}

function renderEmptyGrid(): string {
  let s = "";
  for (let y = 0; y < GRID_WEEKDAYS; y++) {
    for (let x = 0; x < GRID_VISIBLE_WEEKS; x++) {
      s += cellUse(x, y, "cE");
    }
  }
  return s;
}

function renderGroupDrop(
  seg: GroupDropSegment,
  cycleMs: number,
): string {
  const fallPx = seg.fallOffsetCells * step;
  const { startMs, dropDurationMs } = seg;
  const { keyTimes, translateValues, opValues } = smilDropTimeline(startMs, dropDurationMs, cycleMs, fallPx);

  const inner = seg.cells
    .map((c) => {
      const href = levelHref(c.level);
      return cellUse(c.x, c.y, href);
    })
    .join("\n");

  if (!inner) {
    return "";
  }

  return `<g>
<animate attributeName="opacity" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="discrete" keyTimes="${keyTimes}" values="${opValues}"/>
<g>
<animateTransform attributeName="transform" type="translate" dur="${cycleMs}ms" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" values="${translateValues}"/>
${inner}
</g>
</g>`;
}

/**
 * Animated SVG: empty grid + nine column groups falling sequentially with contribution levels.
 */
export function buildGrassDropSvg(segments: GroupDropSegment[], palette: GrassPalette): string {
  if (segments.length === 0) throw new Error("No drop segments");

  const safe = sanitizeGrassPalette(palette);
  const cycleMs = totalCycleMs(segments);
  const boardW = GRID_VISIBLE_WEEKS * step + PAD * 2;
  const boardH = GRID_WEEKDAYS * step + PAD * 2;

  const drops = segments.map((s) => renderGroupDrop(s, cycleMs)).filter((x) => x.length > 0).join("\n");

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