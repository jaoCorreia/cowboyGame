import { TILE_W, TILE_H } from "../constants";
import { drawPanel, drawPixelBtn } from "./drawUtils";

export interface BirthdayCakeCtx {
  ctx: CanvasRenderingContext2D;
  cakeCol: number;
  cakeRow: number;
  camX: number;
  camY: number;
  cakeBobbingTimer: number;
  birthdayParabensCount: number;
  atCake: boolean;
}

export interface BirthdayParticle {
  x: number; y: number; size: number; life: number; color: string;
}

export interface EventPopupCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  eventPopupTimer: number;
}

export interface StarterPackCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
}
export interface StarterPackBtns {
  buyBtn: { x: number; y: number; w: number; h: number };
  closeBtn: { x: number; y: number; w: number; h: number };
}

export interface BirthdayDialogCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  birthdaySentParabens: boolean;
}
export interface BirthdayDialogBtns {
  confirmBtn: { x: number; y: number; w: number; h: number };
  closeBtn: { x: number; y: number; w: number; h: number };
}

// ─────────────────────────────────────────────────────────────────────────────

export function drawBirthdayCake(view: BirthdayCakeCtx): void {
  const { ctx, cakeBobbingTimer: t, atCake } = view;
  const bob = Math.sin(t * 2.2) * 2.5;
  const glow = 0.55 + Math.sin(t * 3.5) * 0.45;

  const sx = (view.cakeCol - view.cakeRow) * (TILE_W / 2) + view.camX;
  const sy = (view.cakeCol + view.cakeRow) * (TILE_H / 2) + view.camY + bob - 22;

  ctx.save();
  ctx.shadowColor = atCake ? "#FFD700" : "#FFB6C1";
  ctx.shadowBlur = atCake ? 22 * glow : 10 * glow;

  ctx.fillStyle = "#c8902a";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 30, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5C2A0A";
  ctx.fillRect(sx - 18, sy + 10, 36, 20);
  ctx.fillStyle = "#FFB6C1";
  ctx.beginPath();
  for (let i = -15; i < 18; i += 7) ctx.arc(sx + i, sy + 12, 4, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = "#8B1A1A";
  ctx.fillRect(sx - 13, sy - 2, 26, 14);
  ctx.fillStyle = "#FFFACD";
  ctx.beginPath();
  for (let i = -10; i < 13; i += 7) ctx.arc(sx + i, sy, 3.5, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = "#D2B48C";
  ctx.fillRect(sx - 8, sy - 14, 16, 14);
  ctx.fillStyle = "#FFA07A";
  ctx.beginPath();
  for (let i = -5; i < 8; i += 6) ctx.arc(sx + i, sy - 12, 3, Math.PI, 0);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFD700";
  ctx.font = `bold ${view.birthdayParabensCount >= 100 ? "7" : "9"}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(view.birthdayParabensCount), sx, sy + 20);

  const candleXs = [-6, 0, 6];
  const candleColors = ["#FF6B6B", "#6BCB77", "#4D96FF"];
  for (let ci = 0; ci < 3; ci++) {
    const cx = sx + candleXs[ci]!;
    ctx.fillStyle = candleColors[ci]!;
    ctx.fillRect(cx - 2, sy - 26, 4, 12);
    const flicker = Math.sin(t * 12 + ci * 2.3) * 1.2;
    ctx.shadowColor = "#FF8800";
    ctx.shadowBlur = 7;
    ctx.fillStyle = "#FF8800";
    ctx.beginPath();
    ctx.ellipse(cx + flicker * 0.3, sy - 30, 2.5, 4, flicker * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFEE44";
    ctx.beginPath();
    ctx.ellipse(cx + flicker * 0.2, sy - 31, 1.3, 2.5, flicker * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  if (atCake) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(sx - 62, sy - 56, 124, 20, 4);
    ctx.fill();
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎂 Pressione E", sx, sy - 46);
  }
  ctx.restore();
}

export function renderBirthdayParticles(ctx: CanvasRenderingContext2D, particles: BirthdayParticle[]): void {
  if (particles.length === 0) return;
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function renderEventPopup(view: EventPopupCtx): void {
  const { ctx, canvas } = view;
  const W = canvas.width, H = canvas.height;
  const PW = Math.min(440, W - 40);
  const PH = 215;
  const PX = (W - PW) / 2;
  const PY = (H - PH) / 2 - 20;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, W, H);
  drawPanel(ctx, PX, PY, PW, PH, 2);

  ctx.fillStyle = "#FFD700";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 7; i++) ctx.fillText("★", PX + 20 + i * ((PW - 40) / 6), PY + 18);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("🎂 EVENTO ESPECIAL: ANIVERSÁRIO DO CRIADOR!", W / 2, PY + 50);
  ctx.fillStyle = "#FF9999";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("17 de Março — Feliz Aniversário, Joao! 🎉", W / 2, PY + 72);
  ctx.fillStyle = "#FFE0A0";
  ctx.font = "12px sans-serif";
  ctx.fillText("Um bolo especial apareceu no mapa! 🌵 Encontre e envie", W / 2, PY + 96);
  ctx.fillText("seus parabéns — todos online vão ver a mensagem! 🤠🐄", W / 2, PY + 114);

  const ratio = Math.max(0, view.eventPopupTimer / 10);
  ctx.fillStyle = "rgba(30,10,2,0.7)";
  ctx.fillRect(PX + 20, PY + PH - 34, PW - 40, 10);
  ctx.fillStyle = "#FFD700";
  ctx.fillRect(PX + 20, PY + PH - 34, (PW - 40) * ratio, 10);
  ctx.fillStyle = "#9b7e57";
  ctx.font = "10px sans-serif";
  ctx.fillText("Clique em qualquer lugar para fechar", W / 2, PY + PH - 10);
  ctx.restore();
}

export function renderStarterPackPopup(view: StarterPackCtx): StarterPackBtns {
  const { ctx, canvas } = view;
  const W = canvas.width, H = canvas.height;
  const PW = Math.min(340, W - 40);
  const PH = 270;
  const PX = (W - PW) / 2;
  const PY = (H - PH) / 2;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(12, 7, 2, 0.96)";
  ctx.beginPath();
  ctx.roundRect(PX, PY, PW, PH, 16);
  ctx.fill();

  ctx.strokeStyle = "rgba(210, 165, 45, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(PX + 0.75, PY + 0.75, PW - 1.5, PH - 1.5, 15.5);
  ctx.stroke();

  const topGrad = ctx.createLinearGradient(PX, PY, PX, PY + 70);
  topGrad.addColorStop(0, "rgba(210,165,45,0.14)");
  topGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.roundRect(PX + 2, PY + 2, PW - 4, 70, [14, 14, 0, 0]);
  ctx.fill();

  ctx.font = "38px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🪙", W / 2, PY + 48);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 17px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("🎁 Starter Pack", W / 2, PY + 100);

  ctx.fillStyle = "#D4B87A";
  ctx.font = "13px sans-serif";
  ctx.fillText("500 moedas para começar sua aventura!", W / 2, PY + 122);

  const bw = 100, bh = 26, bx = W / 2 - 50, by = PY + 134;
  ctx.fillStyle = "rgba(70, 38, 4, 0.9)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 155, 40, 0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("R$ 10,00", W / 2, by + bh / 2);

  const buyW = PW - 52, buyH = 42, buyX = PX + 26, buyY = PY + 178;
  const buyGrad = ctx.createLinearGradient(buyX, buyY, buyX, buyY + buyH);
  buyGrad.addColorStop(0, "#d4960e");
  buyGrad.addColorStop(1, "#7a4e06");
  ctx.fillStyle = buyGrad;
  ctx.beginPath();
  ctx.roundRect(buyX, buyY, buyW, buyH, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 190, 60, 0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#1a0a00";
  ctx.font = "bold 14px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("💳  Comprar agora", W / 2, buyY + buyH / 2);

  const closeY = PY + PH - 16;
  ctx.fillStyle = "rgba(140, 110, 65, 0.85)";
  ctx.font = "12px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Agora não", W / 2, closeY);
  ctx.restore();

  return {
    buyBtn:   { x: buyX, y: buyY, w: buyW, h: buyH },
    closeBtn: { x: W / 2 - 44, y: closeY - 12, w: 88, h: 24 },
  };
}

export function renderBirthdayDialog(view: BirthdayDialogCtx): BirthdayDialogBtns {
  const { ctx, canvas, birthdaySentParabens } = view;
  const W = canvas.width, H = canvas.height;
  const PW = Math.min(400, W - 40);
  const PH = 248;
  const PX = (W - PW) / 2;
  const PY = (H - PH) / 2;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);
  drawPanel(ctx, PX, PY, PW, PH, 2);

  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎂", W / 2, PY + 30);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("Bolo de Aniversário do Criador", W / 2, PY + 60);
  ctx.fillStyle = "#FF9999";
  ctx.font = "12px sans-serif";
  ctx.fillText("17 de Março 🎉", W / 2, PY + 78);

  let confirmBtn = { x: 0, y: 0, w: 0, h: 0 };
  let closeBtn = { x: 0, y: 0, w: 0, h: 0 };

  if (birthdaySentParabens) {
    ctx.fillStyle = "#6BCB77";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("🎊 Você já enviou seus parabéns!", W / 2, PY + 112);
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "12px sans-serif";
    ctx.fillText("O criador agradece de coração! 🤠🐄", W / 2, PY + 130);

    const bw = 130, bh = 36;
    const bx = W / 2 - bw / 2, by = PY + PH - 56;
    closeBtn = { x: bx, y: by, w: bw, h: bh };
    drawPixelBtn(ctx, bx, by, bw, bh, "normal");
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("Fechar", W / 2, by + bh / 2 + 5);
  } else {
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "12px sans-serif";
    ctx.fillText("Envie seus parabéns! Todos online vão ver a mensagem.", W / 2, PY + 106);

    const bw = 210, bh = 40;
    const bx = W / 2 - bw / 2, by = PY + PH - 100;
    confirmBtn = { x: bx, y: by, w: bw, h: bh };
    drawPixelBtn(ctx, bx, by, bw, bh, "normal");
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("🎂 Enviar Parabéns!", W / 2, by + bh / 2 + 5);

    const cw = 120, ch = 32;
    const cxb = W / 2 - cw / 2, cyb = PY + PH - 48;
    closeBtn = { x: cxb, y: cyb, w: cw, h: ch };
    drawPixelBtn(ctx, cxb, cyb, cw, ch, "normal");
    ctx.fillStyle = "#C8A870";
    ctx.font = "13px sans-serif";
    ctx.fillText("Talvez depois", W / 2, cyb + ch / 2 + 4);
  }
  ctx.restore();
  return { confirmBtn, closeBtn };
}
