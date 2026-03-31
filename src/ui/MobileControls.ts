import { CAPTURE_DIST } from "../constants";
import { drawPixelBtn } from "./drawUtils";

export interface MobileCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  joystick: { dx: number; dy: number };
  chop: { active: boolean; flashTimer: number };
  lasso: { active: boolean; phase: string; flashTimer: number };
  stake: { phase: string };
  chatOpen: boolean;
  benchHubOpen: boolean;
  shopOpen: boolean;
  icons: {
    spaceKey: HTMLImageElement;
    pull: HTMLImageElement;
    axeIcon: HTMLImageElement;
    benchIcon: HTMLImageElement;
    moneyIcon: HTMLImageElement;
    base: HTMLImageElement;
    cowboy: HTMLImageElement;
    stakeIcon: HTMLImageElement;
  };
  nearestWanderingCow(): { col: number; row: number } | null | undefined;
  isAtBase(): boolean;
  isAtVendor(): boolean;
  nearestBench(): unknown;
  nearestChoppableTree(): unknown;
  nearestBoulder(): unknown;
  herdCows(): { length: number };
  playerPos: { col: number; row: number };
}

function dist(a: { col: number; row: number }, b: { col: number; row: number }) {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

export class MobileControlsRenderer {
  render(view: MobileCtx): void {
    const { ctx, canvas } = view;
    const W = canvas.width,
      H = canvas.height;
    const jx = 88,
      jy = H - 90;

    // ── Virtual joystick (craftpix palette: brown tones) ──────────────────────
    ctx.fillStyle = "rgba(60,30,8,0.55)";
    ctx.strokeStyle = "#a87040";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(jx, jy, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(jx, jy, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(200,150,60,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(jx, jy, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(220,170,80,0.55)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▲", jx, jy - 32);
    ctx.fillText("▼", jx, jy + 32);
    ctx.fillText("◀", jx - 32, jy);
    ctx.fillText("▶", jx + 32, jy);
    const jtx = jx + view.joystick.dx * 26,
      jty = jy + view.joystick.dy * 26;
    ctx.fillStyle = "rgba(200,140,50,0.75)";
    ctx.strokeStyle = "#c89040";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(jtx, jty, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(jtx, jty, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textBaseline = "alphabetic";

    // ── Action button (bottom-right) ──────────────────────────────────────────
    const ax = W - 80,
      ay = H - 80;
    const nearest = view.nearestWanderingCow();
    const inRange = nearest && dist(view.playerPos, nearest as { col: number; row: number }) <= CAPTURE_DIST;
    const atBase = view.isAtBase(),
      hasHerd = view.herdCows().length > 0;
    let btnState: "normal" | "active" | "pressed" = "normal";
    let icon = view.icons.spaceKey;
    let iconEmoji = "";

    const atVendor = view.isAtVendor();
    const nearBench = view.nearestBench();
    const nearTreeBtn = view.nearestChoppableTree();
    const nearBoulderBtn = view.nearestBoulder();
    if (view.chop.active) {
      btnState = view.chop.flashTimer > 0 ? "pressed" : "active";
      icon = view.icons.axeIcon;
    } else if (view.lasso.active && view.lasso.phase === "pulling") {
      btnState = view.lasso.flashTimer > 0 ? "pressed" : "active";
      icon = view.icons.pull;
    } else if (nearBench && !view.benchHubOpen) {
      btnState = "active";
      icon = view.icons.benchIcon;
    } else if (atVendor && !view.shopOpen) {
      btnState = "active";
      icon = view.icons.moneyIcon;
    } else if (atBase && hasHerd) {
      btnState = "active";
      icon = view.icons.base;
    } else if (nearBoulderBtn) {
      btnState = "active";
      iconEmoji = "🪨";
    } else if (nearTreeBtn) {
      btnState = "active";
      icon = view.icons.axeIcon;
    } else if (inRange) {
      btnState = "active";
      icon = view.icons.cowboy;
    }
    drawPixelBtn(ctx, ax - 30, ay - 30, 60, 60, btnState);
    if (iconEmoji) {
      ctx.font = "26px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(iconEmoji, ax, ay);
      ctx.textBaseline = "alphabetic";
    } else {
      ctx.drawImage(icon, ax - 16, ay - 16, 32, 32);
    }

    // ── Stake button (above action button) ────────────────────────────────────
    const stakeX = W - 80,
      stakeY = H - 170;
    const stakeActive = view.stake.phase !== "idle";
    drawPixelBtn(
      ctx,
      stakeX - 30,
      stakeY - 30,
      60,
      60,
      stakeActive ? "active" : "normal",
    );
    ctx.drawImage(view.icons.stakeIcon, stakeX - 16, stakeY - 16, 32, 32);

    // ── Chat button (above stake button) ─────────────────────────────────────
    const chatBtnX = W - 80,
      chatBtnY = H - 260;
    drawPixelBtn(
      ctx,
      chatBtnX - 30,
      chatBtnY - 24,
      60,
      48,
      view.chatOpen ? "active" : "normal",
    );
    ctx.fillStyle = "#FFD700";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💬", chatBtnX, chatBtnY - 8);
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.fillText("CHAT", chatBtnX, chatBtnY + 10);
    ctx.textBaseline = "alphabetic";
  }
}
