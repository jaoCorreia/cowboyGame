import { drawPanel, drawPixelBtn } from "./drawUtils";
import { LASSO_TIME_LIMIT } from "../constants";
import type { Entity } from "../ecs/World";

export interface VendorCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  vendorDialog: {
    text: string;
    displayed: number;
    done: boolean;
  };
  vendorScreenX: number;
  vendorScreenY: number;
  time: number;
}

export interface MinigameCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  lasso: {
    cowEntity: Entity | null;
    phase: string;
    clickCount: number;
    timeLeft: number;
    flashTimer: number;
  };
  time: number;
  clicksNeeded: number;
  drawPixelBtn: (x: number, y: number, w: number, h: number, state: string, wide?: boolean) => void;
}

export class VendorRenderer {
  renderDialog(view: VendorCtx): void {
    const { ctx, canvas } = view;
    const W = canvas.width, H = canvas.height;
    const d = view.vendorDialog;

    const bw = Math.min(W - 32, 320), bh = 110;

    let bx = view.vendorScreenX - bw / 2;
    let by = view.vendorScreenY - 64 - bh - 30;

    bx = Math.max(16, Math.min(W - bw - 16, bx));
    by = Math.max(16, by);

    if (by < 16) {
      by = view.vendorScreenY + 20;
    }

    // Retro box
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,215,0,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);

    // Speaker label
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("▶ VENDEDOR", bx + 14, by + 18);

    // Typewriter text
    const visText = d.text.slice(0, d.displayed);
    ctx.fillStyle = "#e8e8d0";
    ctx.font = "13px monospace";
    const maxW = bw - 28;
    const lines: string[] = [];
    let current = "";
    for (const ch of visText) {
      if (ch === "\n") {
        lines.push(current);
        current = "";
        continue;
      }
      const test = current + ch;
      if (ctx.measureText(test).width > maxW) {
        lines.push(current);
        current = ch;
      } else current = test;
    }
    lines.push(current);
    lines.forEach((ln, i) => ctx.fillText(ln, bx + 14, by + 38 + i * 18));

    // Blinking cursor / continuar
    if (d.done) {
      const blink = Math.floor(view.time * 2) % 2 === 0;
      if (blink) {
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 3px monospace";
        ctx.textAlign = "right";
        ctx.fillText(
          "[ E / clique para continuar ]",
          bx + bw - 14,
          by + bh - 12,
        );
      }
    } else {
      if (Math.floor(view.time * 4) % 2 === 0) {
        ctx.fillStyle = "#e8e8d0";
        ctx.fillText(
          "█",
          bx + 14 + ctx.measureText(lines[lines.length - 1]!).width,
          by + 38 + (lines.length - 1) * 18,
        );
      }
    }
    ctx.textAlign = "left";
  }

  renderMinigame(view: MinigameCtx): void {
    const { ctx, canvas, lasso } = view;
    const W = canvas.width, H = canvas.height;
    const needed = view.clicksNeeded;
    const prog = lasso.clickCount / needed;
    const timeR = lasso.timeLeft / LASSO_TIME_LIMIT;
    const flash = lasso.flashTimer > 0;
    const bw = 296, bh = 148;
    const bx = W / 2 - bw / 2, by = H / 2 - bh / 2 - 20;

    drawPanel(ctx, bx, by, bw, bh, flash ? 2 : 0);

    // Title
    ctx.fillStyle = flash ? "#FF8800" : "#FFD700";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🤠  PUXE!  PUXE!  PUXE!", W / 2, by + 50);

    // Progress bar
    const barX = bx + 28, barY = by + 62, barW = bw - 56, barH = 20;
    ctx.fillStyle = "#1a0e04";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = prog > 0.7 ? "#4caf50" : prog > 0.4 ? "#8bc34a" : "#cddc39";
    ctx.fillRect(barX, barY, barW * prog, barH);
    ctx.strokeStyle = "#8B5A00";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);

    // Time bar
    const tbY = barY + 28;
    ctx.fillStyle = "#1a0e04";
    ctx.fillRect(barX, tbY, barW, 10);
    ctx.fillStyle = timeR > 0.4 ? "#ff9800" : "#f44336";
    ctx.fillRect(barX, tbY, barW * timeR, 10);
    ctx.strokeStyle = "#5a3000";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, tbY, barW, 10);

    // Counter
    ctx.fillStyle = "#C8A870";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${lasso.clickCount} / ${needed} puxadas`, W / 2, by + 120);

    // Mobile big tap target
    if (canvas.width < 700) {
      const btnState = flash ? "active" : "pressed";
      view.drawPixelBtn(W / 2 - 62, H - 224, 124, 52, btnState, true);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PUXAR! 💪", W / 2, H - 198);
      ctx.textBaseline = "alphabetic";
    }
  }
}
