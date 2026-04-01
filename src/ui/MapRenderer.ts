import { sprites } from "../sprites";
import { TILE_W, TILE_H, BASE_COL, BASE_ROW, BASE_SIZE } from "../constants";
import type { Tile, TileType } from "../mapGen";

type IsoPoint = { x: number; y: number };

export interface MapCtx {
  ctx: CanvasRenderingContext2D;
  time: number;
  map: Tile[][];
  visibleRange: { colMin: number; colMax: number; rowMin: number; rowMax: number };
  isoToScreen(col: number, row: number): IsoPoint;
}

// ── Tile colour lookup (used for 3D sides + tileset fallback) ────────────────

const TILE_COLORS: Record<TileType, [string, string, string]> = {
  grass:      ["#56a832", "#346018", "#446828"],
  grass_dark: ["#4e9e2c", "#2e5614", "#3e6020"],
  dry_grass:  ["#a0b040", "#707020", "#888030"],
  dirt:       ["#c89060", "#9a6838", "#b07848"],
  sand:       ["#e8d090", "#c8a850", "#d8bc70"],
  rock:       ["#8a8a8a", "#585858", "#6a6a6a"],
  water:      ["#4a90d9", "#2a6090", "#3a7ab0"],
  base:       ["#d4b070", "#a07838", "#c09048"],
};

// ── Unified tileset: tiles/tileset.png — 9 tiles × 64px wide, 40px tall ──────
//   Col: 0=grass  1=dry_grass  2=dirt  3=grass_dark  4=sand
//        5=rock  6=water0  7=water1  8=base
const TILESET_PATH = "tiles/tileset.png";
const TILESET_TILE_W = 64; // each tile cell width in the strip

const TILESET_INDEX: Partial<Record<TileType, number>> = {
  grass:      0,
  dry_grass:  2,
  grass_dark: 1,
  dirt:       3,
  sand:       4,
  rock:       5,
  base:       8,
};

const WATER_FRAME_START = 6;
const WATER_FRAME_COUNT = 2;
const WATER_FPS = 1;

// ── MapRenderer class ─────────────────────────────────────────────────────────

export class MapRenderer {
  private view!: MapCtx;

  renderMap(view: MapCtx): void {
    this.view = view;
    const { colMin, colMax, rowMin, rowMax } = view.visibleRange;

    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const tile = view.map[r]![c]!;
        this.drawTile(c, r, tile);
      }
    }

    this.renderFence();

    // Base label
    const { x, y } = view.isoToScreen(BASE_COL + BASE_SIZE / 2, BASE_ROW);
    view.ctx.fillStyle = "rgba(0,0,0,0.55)";
    view.ctx.font = "bold 12px sans-serif";
    view.ctx.textAlign = "center";
    view.ctx.fillText("🏠 BASE", x, y - 12);
  }

  renderFence(view?: MapCtx): void {
    const v = view ?? this.view;
    const { ctx } = v;
    const c1 = BASE_COL, r1 = BASE_ROW;
    const c2 = BASE_COL + BASE_SIZE, r2 = BASE_ROW + BASE_SIZE;
    ctx.strokeStyle = "#6B3410";
    ctx.lineWidth = 2;

    for (let i = 0; i <= BASE_SIZE; i++) {
      this.drawFencePost(c1 + i, r1, v);
      this.drawFencePost(c1 + i, r2, v);
      this.drawFencePost(c1, r1 + i, v);
      if (i < BASE_SIZE - 1) this.drawFencePost(c2, r1 + i, v);
    }
    for (let i = 0; i < BASE_SIZE; i++) {
      const a = v.isoToScreen(c1 + i, r1), b = v.isoToScreen(c1 + i + 1, r1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 4); ctx.lineTo(b.x, b.y - 4); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const a2 = v.isoToScreen(c1, r1 + i), b2 = v.isoToScreen(c1, r1 + i + 1);
      ctx.beginPath();
      ctx.moveTo(a2.x, a2.y - 4); ctx.lineTo(b2.x, b2.y - 4); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    }
  }

  // Called from renderEntities for decoration drawing
  drawDecoration(col: number, row: number, deco: Tile["decoration"], view: MapCtx): void {
    if (deco === "none") return;
    const { ctx } = view;
    const { x, y } = view.isoToScreen(col, row);
    const hash = col * 3 + row * 7;

    if (deco === "tree") {
      const treeKeys = [
        "decorations/Curved_tree1.png",
        "decorations/White_tree1.png",
        "decorations/Blue-green_balls_tree3.png",
      ];
      const key = treeKeys[hash % 3]!;
      const img = sprites.get(key);
      if (img) {
        if (key.includes("Blue-green")) {
          ctx.drawImage(img, 0, 0, 32, 32, x - 32, y - 62, 64, 64);
        } else {
          ctx.drawImage(img, 0, 0, 128, 128, x - 64, y - 118, 128, 128);
        }
        return;
      }
      ctx.fillStyle = "#5a3010";
      ctx.fillRect(x - 3, y - 16, 6, 14);
      ctx.fillStyle = "#2d7a20";
      ctx.beginPath();
      ctx.ellipse(x, y - 22, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === "bush") {
      const variant = hash % 4;
      if (this.drawPlantSprite(ctx, x, y, variant, 1, 0.9)) return;
      ctx.fillStyle = "#2e7d32";
      ctx.beginPath();
      ctx.ellipse(x, y - 8, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#388e3c";
      ctx.beginPath();
      ctx.ellipse(x - 5, y - 6, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 5, y - 6, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === "flower") {
      const variant = hash % 2;
      const sprRow = hash % 2;
      if (this.drawPlantSprite(ctx, x, y, 6 + variant, sprRow, 0.7)) return;
      const colors = ["#f44336", "#e91e63", "#ffeb3b", "#ff9800"];
      ctx.fillStyle = colors[hash % colors.length]!;
      ctx.beginPath();
      ctx.arc(x, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffff00";
      ctx.beginPath();
      ctx.arc(x, y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === "cactus") {
      const sprRow = hash % 2;
      if (this.drawPlantSprite(ctx, x, y, 8, sprRow, 1.0)) return;
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(x - 3, y - 22, 6, 20);
      ctx.fillRect(x - 10, y - 16, 7, 4);
      ctx.fillRect(x + 3, y - 13, 7, 4);
    } else if (deco === "boulder") {
      const img = sprites.get("decorations/rocks.png");
      if (img) {
        const variant = (col * 3 + row * 7) % 4;
        const cellW = 64, cellH = 64;
        ctx.drawImage(img, variant * cellW, 0, cellW, cellH, x - 32, y - 56, 64, 64);
      } else {
        ctx.fillStyle = "#757575";
        ctx.beginPath();
        ctx.ellipse(x, y - 5, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9e9e9e";
        ctx.beginPath();
        ctx.ellipse(x - 2, y - 7, 5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawStump(col: number, row: number, view: MapCtx): void {
    const { ctx } = view;
    const { x, y } = view.isoToScreen(col, row);
    ctx.fillStyle = "#5a3010";
    ctx.fillRect(x - 5, y - 9, 10, 8);
    ctx.fillStyle = "#8b5e30";
    ctx.beginPath();
    ctx.ellipse(x, y - 9, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6b4220";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(x, y - 9, 2.5, 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private drawTile(col: number, row: number, tile: Tile): void {
    const { ctx, time } = this.view;
    const { x, y } = this.view.isoToScreen(col, row);
    const hw = TILE_W / 2, hh = TILE_H / 2, depth = 7;

    // ── 3D sides (always drawn procedurally) ─────────────────────────────────
    const [, sideL, sideR] = TILE_COLORS[tile.type];
    ctx.fillStyle = sideL;
    ctx.beginPath();
    ctx.moveTo(x - hw, y); ctx.lineTo(x, y + hh);
    ctx.lineTo(x, y + hh + depth); ctx.lineTo(x - hw, y + depth);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = sideR;
    ctx.beginPath();
    ctx.moveTo(x, y + hh); ctx.lineTo(x + hw, y);
    ctx.lineTo(x + hw, y + depth); ctx.lineTo(x, y + hh + depth);
    ctx.closePath(); ctx.fill();

    // ── Top face: unified tileset ─────────────────────────────────────────────
    const tileset = sprites.get(TILESET_PATH);
    if (tileset) {
      let srcCol: number;
      if (tile.type === "water") {
        srcCol = WATER_FRAME_START + (Math.floor(time * WATER_FPS) % WATER_FRAME_COUNT);
      } else {
        const idx = TILESET_INDEX[tile.type];
        if (idx === undefined) return;
        srcCol = idx;
      }
      ctx.save();
      this.clipToDiamond(ctx, x, y, hw, hh);
      ctx.drawImage(tileset, srcCol * TILESET_TILE_W, 0, TILESET_TILE_W, tileset.height, x - hw, y - hh, TILE_W, TILE_H);
      ctx.restore();
      this.strokeDiamond(ctx, x, y, hw, hh);
      return;
    }

    // ── Color fallback while tileset loads ───────────────────────────────────
    let [top] = TILE_COLORS[tile.type];
    if (tile.type === "water") {
      const wave = Math.sin(time * 1.5 + (col + row) * 0.4) * 0.06;
      const b = Math.floor(0xd9 + wave * 0x30);
      top = `rgb(74,${b},${217 + Math.floor(wave * 20)})`;
    }
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  private drawFencePost(col: number, row: number, v: MapCtx): void {
    const { ctx } = v;
    const { x, y } = v.isoToScreen(col, row);
    ctx.fillStyle = "#5c2e08";
    ctx.fillRect(x - 3, y - 16, 6, 20);
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(x - 4, y - 18, 8, 5);
  }

  private drawPlantSprite(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    spriteCol: number, spriteRow: number,
    scale = 1,
  ): boolean {
    const img = sprites.get("decorations/plants.png");
    if (!img) return false;
    const CW = 48, CH = 56;
    const dw = CW * scale, dh = CH * scale;
    ctx.drawImage(img, spriteCol * CW, spriteRow * CH, CW, CH, x - dw / 2, y - dh + 8, dw, dh);
    return true;
  }

  private clipToDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y);
    ctx.closePath(); ctx.clip();
  }

  private strokeDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number): void {
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y);
    ctx.closePath(); ctx.stroke();
  }
}
