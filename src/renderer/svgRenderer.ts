import type { Board } from "../domain/types.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../domain/types.js";
import { getCells } from "../domain/tetromino.js";
import type { PiecePlacement } from "../domain/types.js";
import type { SimulationFrame } from "../simulator/simulateReplay.js";

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

const CELL = 18;
const PAD = 2;
const W = BOARD_WIDTH * CELL + PAD * 2;
const H = BOARD_HEIGHT * CELL + PAD * 2;

function cellUse(x: number, y: number, href: string): string {
  const px = PAD + x * CELL;
  const py = PAD + y * CELL;
  return `<use href="#${href}" x="${px}" y="${py}"/>`;
}

function buildSymbols(palette: SvgPalette): string {
  const e = palette.empty;
  const g = palette.grass;
  const h = palette.ghost;
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
 */
export function buildAnimatedSvg(frames: SimulationFrame[], palette: SvgPalette): string {
  if (frames.length === 0) throw new Error("No frames to render");

  const frameDurMs = 80;
  const holdLastMs = 1500;
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
${buildSymbols(palette)}
<rect width="100%" height="100%" fill="${palette.empty}"/>
${groups.join("\n")}
</svg>`;
}
