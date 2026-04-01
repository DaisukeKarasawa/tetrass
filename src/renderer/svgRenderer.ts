import type { Board } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";
import { getCells } from "../domain/tetromino.js";
import type { PiecePlacement } from "../domain/types.js";
import type { SimulationFrame } from "../simulator/simulateReplay.js";

/**
 * Colors for empty / grass / ghost cells in the SVG renderer.
 * Callers may pass arbitrary strings; {@link buildAnimatedSvg} and {@link buildSymbols} run
 * {@link sanitizePalette} so only safe CSS colors reach `fill="..."` (no attribute injection).
 */
export interface SvgPalette {
  empty: string;
  grass: string;
  ghost: string;
}

export const PALETTE_LIGHT: SvgPalette = {
  empty: "#ebedf0",
  grass: "#216e39",
  ghost: "#9be9a8",
};

export const PALETTE_DARK: SvgPalette = {
  empty: "#161b22",
  grass: "#39d353",
  ghost: "#0e4429",
};

/** Fallback when a palette color is missing or fails validation (matches `PALETTE_LIGHT.empty`). */
const DEFAULT_SAFE_COLOR = "#ebedf0";

/** CSS named colors (lowercase) allowed in `fill` after validation. */
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

/**
 * Returns `value` if it is a safe SVG/CSS color for double-quoted attributes; otherwise `DEFAULT_SAFE_COLOR`.
 * Allows `#rgb` / `#rrggbb`, `rgb()` / `rgba()`, and CSS named colors from {@link CSS_NAMED_COLORS}.
 */
export function validateColor(value: string): string {
  const s = value.trim();
  if (s.length === 0) return DEFAULT_SAFE_COLOR;
  if (hasDangerousColorContent(s)) return DEFAULT_SAFE_COLOR;

  if (/^#[0-9a-f]{3}$/i.test(s) || /^#[0-9a-f]{6}$/i.test(s)) {
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

export function sanitizePalette(p: SvgPalette): SvgPalette {
  return {
    empty: validateColor(p.empty),
    grass: validateColor(p.grass),
    ghost: validateColor(p.ghost),
  };
}

const CELL = 18;
const PAD = 2;
const W = BOARD_WIDTH * CELL + PAD * 2;
const H = BOARD_HEIGHT * CELL + PAD * 2;

/** SMIL: visible duration per simulation frame in one loop cycle. */
const SVG_FRAME_DURATION_MS = 80;
/** SMIL: extra hold on the final frame before the cycle repeats. */
const SVG_HOLD_LAST_FRAME_MS = 1500;

function cellUse(x: number, y: number, href: string): string {
  const px = PAD + x * CELL;
  const py = PAD + y * CELL;
  return `<use href="#${href}" x="${px}" y="${py}"/>`;
}

function buildSymbols(palette: SvgPalette): string {
  const { empty: e, grass: g, ghost: h } = sanitizePalette(palette);
  return `<defs>
<symbol id="cE" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${e}" rx="2"/></symbol>
<symbol id="cG" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${g}" rx="2"/></symbol>
<symbol id="cH" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="${h}" rx="2"/></symbol>
</defs>`;
}

function renderBoardUses(board: Board): string {
  let s = "";
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      s += cellUse(x, y, board[y][x] ? "cG" : "cE");
    }
  }
  return s;
}

function renderActiveUses(active: PiecePlacement | null): string {
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

function frameToSvgInner(frame: SimulationFrame): string {
  return renderBoardUses(frame.board) + renderActiveUses(frame.active);
}

/**
 * Animated SVG: compact cells via `<use>`; one `<g>` per frame with SMIL opacity.
 * `palette` is {@link sanitizePalette | sanitized} before embedding in any `fill` attribute.
 */
export function buildAnimatedSvg(frames: SimulationFrame[], palette: SvgPalette): string {
  if (frames.length === 0) throw new Error("No frames to render");

  const safePalette = sanitizePalette(palette);

  const frameDurMs = SVG_FRAME_DURATION_MS;
  const holdLastMs = SVG_HOLD_LAST_FRAME_MS;
  const n = frames.length;
  const cycleMs = n * frameDurMs + holdLastMs;

  const groups: string[] = [];
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
${buildSymbols(safePalette)}
<rect width="100%" height="100%" fill="${safePalette.empty}"/>
${groups.join("\n")}
</svg>`;
}
