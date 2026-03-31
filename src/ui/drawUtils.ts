// Pure canvas drawing utilities — no Game state required

import { sprites } from "../sprites";
import type { CowType } from "../cowTypes";

/**
 * Pixel-art RPG panel with bevel, rivets, and optional style variants.
 * style: 0=brown, 1=dark-brown, 2=green, 3=dark-green
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style = 0,
): void {
  const fills = ["#3a2208", "#261505", "#2a2d1e", "#282c1c"] as const;
  const borders = ["#7a5c32", "#5e4020", "#5a6445", "#525e40"] as const;
  const lights = ["#b08848", "#886030", "#8a9868", "#7a8858"] as const;
  const darks = ["#4a3018", "#341c0a", "#3a4228", "#343c24"] as const;
  const accents = ["#c89040", "#a07028", "#98a060", "#8a9050"] as const;

  const fill = fills[style] ?? fills[0];
  const border = borders[style] ?? borders[0];
  const light = lights[style] ?? lights[0];
  const dark = darks[style] ?? darks[0];
  const accent = accents[style] ?? accents[0];

  ctx.save();

  // ── Drop shadow ──────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 3, y + 3, w, h);

  // ── Outer border fill ────────────────────────────────────────────────────
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, h);

  // ── Bevel: top + left highlight ──────────────────────────────────────────
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, 3); // top
  ctx.fillRect(x, y, 3, h); // left

  // ── Bevel: bottom + right shadow ─────────────────────────────────────────
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + h - 3, w, 3); // bottom
  ctx.fillRect(x + w - 3, y, 3, h); // right

  // ── Inner fill ───────────────────────────────────────────────────────────
  ctx.fillStyle = fill;
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);

  // ── Inner bevel: top + left ───────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,210,130,0.10)";
  ctx.fillRect(x + 4, y + 4, w - 8, 2);
  ctx.fillRect(x + 4, y + 4, 2, h - 8);

  // ── Inner bevel: bottom + right ──────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + 4, y + h - 6, w - 8, 2);
  ctx.fillRect(x + w - 6, y + 4, 2, h - 8);

  // ── Gold accent line ─────────────────────────────────────────────────────
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
  ctx.globalAlpha = 1;

  // ── Corner rivets ────────────────────────────────────────────────────────
  const drawRivet = (rx: number, ry: number) => {
    ctx.fillStyle = accent;
    ctx.fillRect(rx, ry, 5, 5);
    ctx.fillStyle = light; // highlight pixel (top-left)
    ctx.fillRect(rx, ry, 2, 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; // shadow pixel (bottom-right)
    ctx.fillRect(rx + 3, ry + 3, 2, 2);
  };
  drawRivet(x + 2, y + 2);
  drawRivet(x + w - 7, y + 2);
  drawRivet(x + 2, y + h - 7);
  drawRivet(x + w - 7, y + h - 7);

  ctx.restore();
}

/**
 * Pixel-art wood button. state: "normal" | "active" | "pressed"
 */
export function drawPixelBtn(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  state: "normal" | "active" | "pressed" = "normal",
  _wide = false,
): void {
  ctx.save();

  // Base colors from craftpix palette
  const bg =
    state === "active"
      ? "#9b6218"
      : state === "pressed"
        ? "#4a2808"
        : "#5c3a10";
  const rimTop =
    state === "active"
      ? "#e0a840"
      : state === "pressed"
        ? "#361808"
        : "#9b7e57";
  const rimBot =
    state === "active"
      ? "#7a4810"
      : state === "pressed"
        ? "#6a3c18"
        : "#3a2208";
  const inner =
    state === "active"
      ? "#c88430"
      : state === "pressed"
        ? "#382010"
        : "#75491c";

  // Outer rim
  ctx.fillStyle = rimBot;
  ctx.fillRect(dx, dy, dw, dh);
  // Top-highlight rim
  ctx.fillStyle = rimTop;
  ctx.fillRect(dx, dy, dw, 3);
  ctx.fillRect(dx, dy, 3, dh);
  // Inner face
  ctx.fillStyle = bg;
  ctx.fillRect(dx + 3, dy + 3, dw - 5, dh - 5);
  // Subtle inner bevel
  ctx.fillStyle = inner;
  ctx.fillRect(dx + 4, dy + 4, dw - 7, dh - 7);
  // 1-px gold border
  ctx.strokeStyle = state === "active" ? "#ffd060" : "#a07838";
  ctx.lineWidth = 1;
  ctx.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);

  ctx.restore();
}

/**
 * Draw a cow sprite or fallback shape at (x, y).
 */
export function drawCowAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: CowType,
): void {
  const cowSprite = t.sprite ? sprites.get(t.sprite) : null;
  if (cowSprite) {
    const s = 52;
    ctx.drawImage(cowSprite, x - s / 2, y - s + 4, s, s);
    return;
  }
  const body = t.bodyColor,
    spot = t.spotColor;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x - 16, y - 20, 30, 16, 4);
  ctx.fill();
  if (t.renderStyle === "striped") {
    ctx.fillStyle = spot;
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 14 + i * 7, y - 20, 3, 16);
  } else {
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.ellipse(x - 5, y - 13, 5, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 10, 4, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x + 12, y - 22, 14, 12, 3);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.fillRect(x + 21, y - 20, 2, 2);
  ctx.fillStyle = "#ddd";
  for (const lx of [x - 12, x - 4, x + 4, x + 10])
    ctx.fillRect(lx, y - 4, 4, 8);
}
