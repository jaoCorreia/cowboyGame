import { sprites } from "../sprites";
import { animatedSprites } from "../animatedSprites";
import { drawCowAt } from "./drawUtils";
import type { CowType } from "../cowTypes";
import type { RemotePlayer } from "../network";

export interface CowView {
  id: number;
  col: number;
  row: number;
  state: string;
  type: CowType;
  herdIndex: number;
  sparkTimer: number;
}

export interface CowCtx {
  ctx: CanvasRenderingContext2D;
  cow: CowView;
  time: number;
  nightFade: number;
  eyeIcon: HTMLImageElement;
  isoToScreen: (col: number, row: number) => { x: number; y: number };
  playerPos: { col: number; row: number };
  dist: (a: { col: number; row: number }, b: { col: number; row: number }) => number;
  captureDistFearThreshold: number;
}

export interface RemotePlayerCtx {
  ctx: CanvasRenderingContext2D;
  rp: RemotePlayer;
  time: number;
  isoToScreen: (col: number, row: number) => { x: number; y: number };
  getSpriteDir: (dc: number, dr: number) => string;
}

export interface RemoteBasedCowCtx {
  ctx: CanvasRenderingContext2D;
  col: number;
  row: number;
  color: string;
  baseAlpha?: number;
  bob?: number;
  isoToScreen: (col: number, row: number) => { x: number; y: number };
}

export class CowRenderer {
  drawCow(view: CowCtx): void {
    const { ctx, cow, time, nightFade, eyeIcon, isoToScreen, playerPos, dist, captureDistFearThreshold } = view;
    const { x, y } = isoToScreen(cow.col, cow.row);
    const bob =
      cow.state === "wandering" ? Math.sin(time * 5 + cow.id) * 0.8 : 0;
    const cy = y + bob;
    const t = cow.type;

    const isTranslucent = t.renderStyle === "translucent";
    const prevAlpha = ctx.globalAlpha;
    if (isTranslucent) {
      const baseAlpha = t.nightOnly ? 0.7 + nightFade * 0.15 : 0.55;
      ctx.globalAlpha = baseAlpha + Math.sin(time * 2 + cow.id) * 0.1;
    }

    // Glow / cosmic halo
    if (t.renderStyle === "glowing" || t.renderStyle === "cosmic") {
      const nightBoost = t.nightOnly ? 1 + nightFade * 2.2 : 1;
      const pulse = 0.5 + Math.sin(time * 3 + cow.id) * 0.3;
      if (t.nightOnly && nightFade > 0) {
        ctx.fillStyle = t.glowColor ?? "rgba(255,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(
          x,
          cy - 10,
          (48 + pulse * 10) * nightBoost,
          (30 + pulse * 7) * nightBoost,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = t.glowColor ?? "rgba(255,215,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(
        x,
        cy - 10,
        (32 + pulse * 6) * (t.nightOnly ? 1 + nightFade * 0.8 : 1),
        (20 + pulse * 4) * (t.nightOnly ? 1 + nightFade * 0.8 : 1),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Shadow (skip for sprite-based cows — the GIF already has grounding)
    if (!t.sprite) {
      ctx.globalAlpha = isTranslucent ? 0.1 : ctx.globalAlpha * 0.7;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isTranslucent)
      ctx.globalAlpha = 0.55 + Math.sin(time * 2 + cow.id) * 0.1;
    else ctx.globalAlpha = prevAlpha;

    const body = t.bodyColor;
    const spot = t.spotColor;

    // Animated GIF or static sprite.
    // Animation plays only while the cow is moving; idle = frame 0 (timeMs=0).
    const isMoving = cow.state === "wandering" || cow.state === "fleeing" || cow.state === "captured";
    const isGif = t.sprite?.endsWith(".gif") ?? false;
    const animated = isGif && t.sprite
      ? animatedSprites.get(t.sprite, isMoving ? time * 1000 : 0)
      : null;
    const cowSprite = !isGif && t.sprite ? sprites.get(t.sprite) : null;
    const useSprite = !!(animated || cowSprite);

    if (useSprite) {
      let srcW: number, srcH: number, src: CanvasImageSource;
      if (animated) {
        src = animated.canvas;
        srcW = animated.w;
        srcH = animated.h;
      } else {
        src = cowSprite!;
        srcW = cowSprite!.naturalWidth || 52;
        srcH = cowSprite!.naturalHeight || 52;
      }
      // Scale to a fixed display height, preserving aspect ratio.
      // Anchor bottom of sprite at the cow's feet level (cy + 4).
      const displayH = 44;
      const displayW = srcW * (displayH / srcH);
      ctx.drawImage(src, x - displayW / 2, cy - displayH + 4, displayW, displayH);
    } else {
      // Canvas drawing padrão
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(x - 16, cy - 20, 30, 16, 4);
      ctx.fill();

      if (t.renderStyle === "striped") {
        ctx.fillStyle = spot;
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(x - 14 + i * 7, cy - 20, 3, 16);
        }
      } else if (t.renderStyle === "cosmic") {
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 8; i++) {
          const sx =
            x - 14 + Math.sin(i * 1.3 + time * 0.5 + cow.id) * 10 + 10;
          const sy = cy - 14 + Math.cos(i * 1.7 + time * 0.3 + cow.id) * 5;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = spot;
        ctx.beginPath();
        ctx.ellipse(x - 6, cy - 14, 5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 5, cy - 11, 4, 5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        if (t.secondaryColor) {
          ctx.fillStyle = t.secondaryColor;
          ctx.beginPath();
          ctx.ellipse(x - 2, cy - 18, 4, 3, 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Head
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(x + 12, cy - 22, 14, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.fillRect(x + 21, cy - 20, 2, 2);
      ctx.fillStyle = "#f4a0a0";
      ctx.beginPath();
      ctx.ellipse(x + 24, cy - 14, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4c0b0";
      ctx.beginPath();
      ctx.ellipse(x + 13, cy - 21, 3, 4, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.fillStyle = t.renderStyle === "cosmic" ? "#0a0820" : "#ddd";
      for (const lx of [x - 12, x - 4, x + 4, x + 10])
        ctx.fillRect(lx, cy - 4, 4, 8);

      // Tail
      ctx.strokeStyle = body;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 16, cy - 14);
      ctx.quadraticCurveTo(x - 24, cy - 10, x - 20, cy - 4);
      ctx.stroke();
    }

    ctx.globalAlpha = prevAlpha;

    // Sparkle on fresh capture
    if (cow.sparkTimer > 0) {
      const pct = cow.sparkTimer / 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 3;
        const r = (1 - pct) * 28;
        const sx = x + Math.cos(a) * r;
        const sy = cy - 10 + Math.sin(a) * r * 0.5;
        ctx.fillStyle = `rgba(255,220,50,${pct * 0.9})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 3 * pct, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // State / wary badge
    ctx.textAlign = "center";
    if (cow.state === "lassoed") {
      ctx.fillStyle = "rgba(255,200,0,0.95)";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("!", x, cy - 28);
    } else if (cow.state === "captured") {
      ctx.fillStyle = "rgba(50,200,50,0.95)";
      ctx.font = "14px sans-serif";
      ctx.fillText("✓", x, cy - 28);
    } else if (cow.state === "based" || cow.state === "stolen") {
      ctx.font = "11px sans-serif";
      ctx.fillText("🏠", x, cy - 26);
    } else if (cow.state === "wandering" && t.fearDistance > 0) {
      const pd = dist(playerPos, cow);
      if (pd < t.fearDistance) {
        const blink = Math.sin(time * 6) > 0;
        if (blink || pd > t.fearDistance * 0.6) {
          ctx.font = "12px sans-serif";
          ctx.drawImage(eyeIcon, x - 8, cy - 36, 16, 16);
        }
      }
    }
  }

  drawRemotePlayer(view: RemotePlayerCtx): void {
    const { ctx, rp, time, isoToScreen, getSpriteDir } = view;
    const { x, y } = isoToScreen(rp.col, rp.row);
    const bob = rp.moving
      ? Math.sin(time * 11 + rp.id.charCodeAt(0)) * 2
      : 0;
    const py = y + bob;

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const dir = getSpriteDir(rp.dirCol, rp.dirRow);
    const frame = Math.floor(time * 8) % 4;
    const spritePath = rp.moving
      ? `player/run/${dir}/frame_00${frame}.png`
      : `player/idle/${dir}.png`;
    const img = sprites.get(spritePath);
    const SW = 64, SH = 64;

    if (img) {
      const off = document.createElement("canvas");
      off.width = SW;
      off.height = SH;
      const oCtx = off.getContext("2d")!;
      oCtx.drawImage(img, 0, 0, SW, SH);
      oCtx.globalCompositeOperation = "source-atop";
      oCtx.globalAlpha = 0.55;
      oCtx.fillStyle = rp.color;
      oCtx.fillRect(0, 0, SW, SH);
      ctx.drawImage(off, x - SW / 2, y - SH + 12, SW, SH);
    } else {
      ctx.fillStyle = rp.color;
      ctx.fillRect(x - 9, py - 26, 18, 20);
      ctx.fillStyle = "#f4c28a";
      ctx.fillRect(x - 7, py - 38, 14, 14);
      ctx.fillStyle = "#5c3010";
      ctx.fillRect(x - 10, py - 54, 20, 18);
      ctx.fillStyle = "#3a1a00";
      ctx.fillRect(x - 12, py - 38, 24, 4);
    }

    // Tag com nome
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const tw = ctx.measureText(rp.name).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - tw / 2 - 4, py - 72, tw + 8, 15);
    ctx.fillStyle = rp.color;
    ctx.textBaseline = "top";
    ctx.fillText(rp.name, x, py - 71);
    ctx.textBaseline = "alphabetic";

    // Balão de fala
    if (rp.lastMessage && rp.lastMessageTime) {
      const elapsed = Date.now() - rp.lastMessageTime;
      if (elapsed < 5000) {
        const alpha = elapsed < 4000 ? 1 : 1 - (elapsed - 4000) / 1000;
        ctx.globalAlpha = alpha;

        ctx.font = "10px sans-serif";
        let displayText = rp.lastMessage;
        const maxW = 120;
        if (ctx.measureText(displayText).width > maxW) {
          while (
            ctx.measureText(displayText + "...").width > maxW &&
            displayText.length > 0
          ) {
            displayText = displayText.slice(0, -1);
          }
          displayText += "...";
        }

        const msgW = ctx.measureText(displayText).width;
        const bubbleW = msgW + 12;
        const bubbleH = 18;
        const bubbleX = x - bubbleW / 2;
        const bubbleY = py - 94;

        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x - 5, bubbleY + bubbleH);
        ctx.lineTo(x, bubbleY + bubbleH + 6);
        ctx.lineTo(x + 5, bubbleY + bubbleH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.stroke();

        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, x, bubbleY + bubbleH / 2);
        ctx.textBaseline = "alphabetic";

        ctx.globalAlpha = 1;
      }
    }
  }

  drawRemoteBasedCow(view: RemoteBasedCowCtx): void {
    const { ctx, col, row, color, isoToScreen } = view;
    const baseAlpha = view.baseAlpha ?? 0.88;
    const bob = view.bob ?? 0;
    const { x, y: yBase } = isoToScreen(col, row);
    const y = yBase + bob;

    ctx.save();

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Corpo colorido
    ctx.globalAlpha = baseAlpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - 15, y - 19, 28, 15, 4);
    ctx.fill();

    // Mancha branca
    ctx.globalAlpha = baseAlpha * 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x - 3, y - 13, 5, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = baseAlpha;

    // Cabeça
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 8, y - 27, 11, 10, 3);
    ctx.fill();

    // Focinho
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(x + 15, y - 22, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patas
    ctx.fillStyle = color;
    ctx.fillRect(x - 12, y - 5, 4, 6);
    ctx.fillRect(x - 5, y - 5, 4, 6);
    ctx.fillRect(x + 3, y - 5, 4, 6);
    ctx.fillRect(x + 10, y - 5, 4, 6);

    // Bolinha de cor do dono
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - 14, y - 24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
