import { sprites } from "../sprites";
import { drawCowAt } from "./drawUtils";
import type { CowType } from "../cowTypes";

export interface BanditView {
  id: number;
  col: number;
  row: number;
  fleeCol: number;
  fleeRow: number;
  state: "approaching" | "fleeing" | "scared";
  targetCow: { type: CowType } | null;
}

export interface BanditCtx {
  ctx: CanvasRenderingContext2D;
  bandits: BanditView[];
  banditAnimFrame: number;
  isoToScreen: (col: number, row: number) => { x: number; y: number };
  // Called when a fleeing bandit is close to the player
  nearFleeingBanditScreen: { x: number; y: number } | null;
}

export class BanditRenderer {
  render(view: BanditCtx): void {
    const { ctx } = view;
    for (const b of view.bandits) {
      this.drawBandit(ctx, b, view.banditAnimFrame, view.isoToScreen);
    }

    if (view.nearFleeingBanditScreen) {
      const { x, y } = view.nearFleeingBanditScreen;
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("E / Espaço — Espantar!", x, y - 52);
    }
  }

  private drawBandit(
    ctx: CanvasRenderingContext2D,
    b: BanditView,
    banditAnimFrame: number,
    isoToScreen: (col: number, row: number) => { x: number; y: number },
  ): void {
    const { x, y } = isoToScreen(b.col, b.row);

    const FRAME_W = 64, FRAME_H = 64;

    // Cow dragged BEHIND bandit
    if (b.targetCow && (b.state === "fleeing" || b.state === "scared")) {
      const mdx = b.fleeCol - b.col;
      const mdy = b.fleeRow - b.row;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      const offCol = md > 0.1 ? -(mdx / md) * 1.8 : -1.8;
      const offRow = md > 0.1 ? -(mdy / md) * 1.8 : 0;
      const cp = isoToScreen(b.col + offCol, b.row + offRow);

      // Rope
      ctx.save();
      ctx.strokeStyle = "rgba(180,120,40,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const midX = (x + cp.x) / 2;
      const midY = (y + cp.y) / 2 + 10;
      ctx.moveTo(x + (cp.x - x) * 0.1, y - 8);
      ctx.quadraticCurveTo(midX, midY, cp.x, cp.y - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Cow shadow
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(cp.x, cp.y + 2, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cow (slightly smaller, behind bandit)
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.scale(0.72, 0.72);
      drawCowAt(ctx, 0, 0, b.targetCow.type);
      ctx.restore();
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sprite sheet + frame count based on state
    let sheetKey: string;
    let totalCols: number;
    if (b.state === "fleeing" || b.state === "scared") {
      sheetKey = "npcs/bandit/Unarmed_Run_without_shadow.png";
      totalCols = 8;
    } else {
      sheetKey = "npcs/bandit/Unarmed_Walk_without_shadow.png";
      totalCols = 6;
    }

    const col = banditAnimFrame % totalCols;
    const dirRow = 2;
    const srcX = col * FRAME_W;
    const srcY = dirRow * FRAME_H;

    const img = sprites.get(sheetKey);
    ctx.save();
    const movingLeft = b.fleeCol < b.col;
    if ((b.state === "scared" || b.state === "fleeing") && movingLeft) {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    if (img) {
      ctx.drawImage(
        img,
        srcX,
        srcY,
        FRAME_W,
        FRAME_H,
        x - FRAME_W / 2,
        y - FRAME_H + 10,
        FRAME_W,
        FRAME_H,
      );
    } else {
      // Canvas fallback while sprite loads
      ctx.fillStyle = "#d4946a";
      ctx.fillRect(x - 7, y - 28, 14, 18);
      ctx.fillStyle = "#1a1a3a";
      ctx.fillRect(x - 8, y - 14, 16, 8);
      ctx.fillStyle = "#d4946a";
      ctx.beginPath();
      ctx.arc(x, y - 35, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a1010";
      ctx.fillRect(x - 8, y - 40, 16, 7);
    }
    ctx.restore();

    // Label above
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle =
      b.state === "scared"
        ? "#aaffaa"
        : b.state === "fleeing"
          ? "#ff6060"
          : "#ffcc44";
    const label =
      b.state === "scared"
        ? "😱 fugindo!"
        : b.state === "fleeing"
          ? "🏃 com a vaca!"
          : "🤫 se aproximando";
    ctx.fillText(label, x, y - FRAME_H + 4);
  }
}
