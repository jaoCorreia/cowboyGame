import { drawPanel } from "./drawUtils";

export interface StatsPanelCtx {
  ctx: CanvasRenderingContext2D;
  statsMinimized: boolean;
  myColor: string;
  myName: string;
  herdCount: number;
  basedCount: number;
  wanderingCount: number;
  timePeriod: "manha" | "tarde" | "noite";
  nightFade: number;
  coins: number;
  moneyIcon: HTMLImageElement;
  leiteTimer: number;
  time: number;
  hasOwnedItems: boolean;
}

export interface OnlinePanelCtx {
  ctx: CanvasRenderingContext2D;
  statsMinimized: boolean;
  players: Array<{ color: string; name: string; isMe: boolean }>;
}

export interface ChatCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  chatOpen: boolean;
  chatMessages: Array<{ name: string; color: string; text: string; time: number }>;
  chatHistoryScroll: number;
}

// ── Stats panel (top-left) ────────────────────────────────────────────────────

export function renderStatsPanel(view: StatsPanelCtx): void {
  const { ctx } = view;

  if (view.statsMinimized) {
    // ── Versão compacta (glass) ──
    ctx.save();
    ctx.fillStyle = "rgba(10, 6, 2, 0.84)";
    ctx.beginPath();
    ctx.roundRect(6, 6, 136, 38, 9);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 138, 45, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(6.5, 6.5, 135, 37, 8.5);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = view.myColor;
    ctx.beginPath();
    ctx.arc(20, 25, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#FFE0A0";
    ctx.fillText(`🐄 ${view.herdCount}  🏠 ${view.basedCount}`, 30, 29);

    // Botão expandir
    ctx.save();
    ctx.fillStyle = "rgba(180, 138, 45, 0.22)";
    ctx.beginPath();
    ctx.roundRect(111, 11, 22, 22, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(200,155,50,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▶", 122, 22);
    ctx.textBaseline = "alphabetic";
  } else {
    // ── Versão expandida (glass moderna) ──
    const PW = 210;
    const PH = 174 + (view.hasOwnedItems ? 34 : 0) + (view.leiteTimer > 0 ? 20 : 0);

    // Painel glass
    ctx.save();
    ctx.fillStyle = "rgba(10, 6, 2, 0.88)";
    ctx.beginPath();
    ctx.roundRect(6, 6, PW, PH, 11);
    ctx.fill();
    // Borda dourada fina
    ctx.strokeStyle = "rgba(180, 138, 45, 0.52)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(6.5, 6.5, PW - 1, PH - 1, 10.5);
    ctx.stroke();
    // Linha de brilho no topo
    const topGrad = ctx.createLinearGradient(6, 6, 6 + PW, 6);
    topGrad.addColorStop(0, "rgba(200,155,45,0)");
    topGrad.addColorStop(0.5, "rgba(200,155,45,0.45)");
    topGrad.addColorStop(1, "rgba(200,155,45,0)");
    ctx.strokeStyle = topGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(20, 7);
    ctx.lineTo(PW - 8, 7);
    ctx.stroke();
    ctx.restore();

    // Cabeçalho: dot cor + nome
    ctx.fillStyle = view.myColor;
    ctx.beginPath();
    ctx.arc(20, 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(view.myName, 32, 26);

    // Divisor
    ctx.strokeStyle = "rgba(180,138,45,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, 33);
    ctx.lineTo(PW - 6, 33);
    ctx.stroke();

    // Stats
    const rows: [string, string][] = [
      ["🐄  Rebanho:", `${view.herdCount}`],
      ["🏠  Na base:", `${view.basedCount}`],
      ["🌾  Vagando:", `${view.wanderingCount}`],
    ];

    let ry = 48;
    for (const [label, value] of rows) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "rgba(195,155,80,0.85)";
      ctx.textAlign = "left";
      ctx.fillText(label, 14, ry);
      ctx.fillStyle = "#FFE0A0";
      ctx.textAlign = "right";
      ctx.fillText(value, PW - 10, ry);
      ry += 20;
    }

    // Período do dia
    {
      const { timePeriod: period, nightFade } = view;
      const periodLabel =
        period === "noite"
          ? nightFade < 0.8
            ? "🌅 Anoitecendo..."
            : "🌙 Noite"
          : period === "manha"
            ? "🌄 Manhã"
            : "☀️ Tarde";
      const periodColor =
        period === "noite"
          ? `rgba(160,190,255,${0.5 + nightFade * 0.5})`
          : period === "manha"
            ? "rgba(255,210,120,0.9)"
            : "rgba(255,175,55,0.9)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = periodColor;
      ctx.fillText(periodLabel, 14, ry);
      ry += 20;
    }

    // Moedas
    ctx.drawImage(view.moneyIcon, 14, ry - 14, 16, 16);
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "rgba(195,155,80,0.85)";
    ctx.textAlign = "left";
    ctx.fillText("Moedas:", 34, ry);
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "right";
    ctx.fillText(`${view.coins}`, PW - 10, ry);
    ry += 20;

    // Botão "Comprar Moedas" (MercadoPago)
    {
      const btnX = 14, btnY = ry, btnW = PW - 20, btnH = 22;
      ctx.save();
      const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
      btnGrad.addColorStop(0, "rgba(190, 138, 18, 0.92)");
      btnGrad.addColorStop(1, "rgba(100, 58, 6, 0.92)");
      ctx.fillStyle = btnGrad;
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(220, 170, 55, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#FFE060";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💳  Comprar Moedas  R$10", btnX + btnW / 2, btnY + btnH / 2);
      ctx.textBaseline = "alphabetic";
      ry += 28;
    }

    // Leite Fluorescente timer
    if (view.leiteTimer > 0) {
      const totalSecs = Math.ceil(view.leiteTimer);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const pulse = 0.7 + 0.3 * Math.sin(view.time * 3.5);
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = `rgba(140,255,100,${pulse})`;
      ctx.fillText(`✨ Leite: ${mins}m${secs < 10 ? "0" : ""}${secs}s`, 14, ry);
    }

    // Botão logout — minimalista
    ctx.save();
    ctx.fillStyle = "rgba(110, 30, 30, 0.72)";
    ctx.beginPath();
    ctx.roundRect(PW - 40, 10, 20, 20, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 80, 80, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#FF8080";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⏻", PW - 30, 20);
    ctx.textBaseline = "alphabetic";

    // Botão recolher — minimalista
    ctx.save();
    ctx.fillStyle = "rgba(70, 52, 14, 0.72)";
    ctx.beginPath();
    ctx.roundRect(PW - 16, 10, 20, 20, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 138, 45, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#FFD700";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("◀", PW - 6, 20);
    ctx.textBaseline = "alphabetic";
  }
}

// ── Online panel (top-left, abaixo do stats) ──────────────────────────────────

export function renderOnlinePanel(view: OnlinePanelCtx): void {
  const { ctx, players } = view;
  const total = players.length;

  if (players.filter((p) => !p.isMe).length === 0) return;

  const PW = 170;
  const rowH = 22;
  const visibleEntries = players.slice(0, 6);
  const PH = 28 + visibleEntries.length * rowH + 8;

  const PX = 6;
  const PY = view.statsMinimized ? 60 : 160;

  // Glass panel
  ctx.save();
  ctx.fillStyle = "rgba(10, 6, 2, 0.84)";
  ctx.beginPath();
  ctx.roundRect(PX, PY, PW, PH, 9);
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 190, 100, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1, 8.5);
  ctx.stroke();
  ctx.restore();

  // Cabeçalho
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#55FF99";
  ctx.fillText(
    `● Online  —  ${total} jogador${total > 1 ? "es" : ""}`,
    PX + 10,
    PY + 17,
  );

  // Divisor
  ctx.strokeStyle = "rgba(60,190,100,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PX + 8, PY + 22);
  ctx.lineTo(PX + PW - 8, PY + 22);
  ctx.stroke();

  // Linhas de jogadores
  let ey = PY + 22 + rowH - 4;
  for (const e of visibleEntries) {
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(PX + 16, ey - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = e.isMe ? "bold 11px sans-serif" : "11px sans-serif";
    ctx.fillStyle = e.isMe ? "#FFE0A0" : "#C8A870";
    ctx.textAlign = "left";

    let name = e.name;
    while (ctx.measureText(name).width > PW - 36 && name.length > 3) {
      name = name.slice(0, -1);
    }
    if (name !== e.name) name += "…";

    ctx.fillText(name, PX + 28, ey);
    ey += rowH;
  }
}

// ── Chat (bottom-left) ────────────────────────────────────────────────────────
// Returns the new chatHistoryScroll value (may be clamped).

export function renderChat(view: ChatCtx): number {
  const { ctx, canvas, chatMessages } = view;
  const W = canvas.width, H = canvas.height;
  const now = Date.now();
  let chatHistoryScroll = view.chatHistoryScroll;

  if (view.chatOpen) {
    const PW = Math.min(W - 20, 320);
    const lineH = 18;
    const padV = 8;
    const MAX_VISIBLE = 8;
    const totalMsgs = chatMessages.length;

    chatHistoryScroll = Math.max(
      0,
      Math.min(chatHistoryScroll, Math.max(0, totalMsgs - MAX_VISIBLE)),
    );

    const firstIdx = Math.max(0, totalMsgs - MAX_VISIBLE - chatHistoryScroll);
    const slice = chatMessages.slice(firstIdx, firstIdx + MAX_VISIBLE);

    const panelH = Math.max(lineH + padV * 2, slice.length * lineH + padV * 2);
    const panelY = H - 195 - panelH;

    drawPanel(ctx, 6, panelY, PW, panelH, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(8, panelY + 2, PW - 4, panelH - 4);
    ctx.clip();

    let ty = panelY + padV + 12;
    for (const msg of slice) {
      ctx.globalAlpha = 1;
      ctx.font = " 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = msg.color;
      const nameLabel = msg.name + ": ";
      const nameW = ctx.measureText(nameLabel).width;
      ctx.fillText(nameLabel, 14, ty);

      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      const maxW = PW - nameW - 24;
      let text = msg.text;
      while (ctx.measureText(text).width > maxW && text.length > 3)
        text = text.slice(0, -1);
      if (text !== msg.text) text += "…";
      ctx.fillText(text, 14 + nameW, ty);
      ty += lineH;
    }
    ctx.restore();

    if (chatHistoryScroll > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.textAlign = "left";
      ctx.fillText("▲ arraste ou use a roda para scroll", 14, panelY - 5);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "left";
    ctx.fillText("Enter = enviar  •  Esc = fechar", 14, H - 183);
    ctx.restore();
    return chatHistoryScroll;
  }

  // ── Chat fechado: mensagens recentes flutuantes ─────────────────────────
  const recent = chatMessages.filter((m) => now - m.time < 12000).slice(-5);

  if (recent.length === 0) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.textAlign = "left";
    ctx.fillText("T = Chat", 14, H - 200);
    ctx.restore();
    return chatHistoryScroll;
  }

  const PW = Math.min(W - 20, 272);
  const lineH = 18;
  const padV = 8;
  const panelH = recent.length * lineH + padV * 2;
  const panelY = H - 155 - panelH;

  drawPanel(ctx, 6, panelY, PW, panelH, 0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(8, panelY + 2, PW - 4, panelH - 4);
  ctx.clip();

  let ty = panelY + padV + 12;
  for (const msg of recent) {
    const age = (now - msg.time) / 12000;
    ctx.globalAlpha = Math.max(0.35, 1 - age * 0.7);
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = msg.color;
    const nameLabel = msg.name + ": ";
    const nameW = ctx.measureText(nameLabel).width;
    ctx.fillText(nameLabel, 14, ty);

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#FFE0A0";
    const maxW = PW - nameW - 24;
    let text = msg.text;
    while (ctx.measureText(text).width > maxW && text.length > 3)
      text = text.slice(0, -1);
    if (text !== msg.text) text += "…";
    ctx.fillText(text, 14 + nameW, ty);
    ty += lineH;
  }
  ctx.restore();
  return chatHistoryScroll;
}
