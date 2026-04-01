export interface AdminCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  adminGodMode: boolean;
  adminForcePeriod: string | null;
  adminCmdResult: string;
  adminCmdResultTimer: number;
  adminCmdOpen: boolean;
  shopOpen: boolean;
  bookOpen: boolean;
  inventoryOpen: boolean;
}

export function renderAdminOverlay(view: AdminCtx): void {
  const { ctx, canvas } = view;
  const W = canvas.width, H = canvas.height;

  // Badge "⚙ ADMIN" no canto superior direito
  ctx.save();
  ctx.font = "bold 11px monospace";
  const badge = "⚙ ADMIN";
  const bw = ctx.measureText(badge).width + 14;
  const bx = W - bw - 6;
  const by = 6;
  ctx.fillStyle = "rgba(80,5,5,0.88)";
  ctx.fillRect(bx, by, bw, 20);
  ctx.strokeStyle = "#cc2222";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, 20);
  ctx.fillStyle = "#FF6666";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, bx + bw / 2, by + 10);
  ctx.textBaseline = "alphabetic";
  ctx.restore();

  // Indicador de god mode
  if (view.adminGodMode) {
    ctx.save();
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = "rgba(80,5,5,0.88)";
    const gw = ctx.measureText("⚡ GOD MODE").width + 14;
    ctx.fillRect(W - gw - 6, 30, gw, 20);
    ctx.strokeStyle = "#cc2222";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W - gw - 6, 30, gw, 20);
    ctx.fillStyle = "#FFAA44";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡ GOD MODE", W - gw / 2 - 6, 40);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Indicador de hora forçada
  if (view.adminForcePeriod !== null) {
    ctx.save();
    ctx.font = "bold 10px monospace";
    const label = `🕐 TIME:${view.adminForcePeriod.toUpperCase()}`;
    const tw = ctx.measureText(label).width + 14;
    const ty = view.adminGodMode ? 54 : 30;
    ctx.fillStyle = "rgba(5,5,80,0.88)";
    ctx.fillRect(W - tw - 6, ty, tw, 20);
    ctx.strokeStyle = "#2244cc";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W - tw - 6, ty, tw, 20);
    ctx.fillStyle = "#88AAFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, W - tw / 2 - 6, ty + 10);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Resultado do último comando
  if (view.adminCmdResultTimer > 0 && view.adminCmdResult) {
    const alpha = Math.min(1, view.adminCmdResultTimer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 13px monospace";
    const msg = view.adminCmdResult;
    const tw = ctx.measureText(msg).width + 16;
    const px = 10;
    const py = H - 40;
    ctx.fillStyle = "rgba(40,3,3,0.94)";
    ctx.fillRect(px, py - 18, tw, 24);
    ctx.strokeStyle = "#cc2222";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py - 18, tw, 24);
    ctx.fillStyle = view.adminCmdResult.startsWith("✅") ? "#88FF88" : "#FF8888";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(msg, px + 8, py - 6);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Dica de atalho
  if (!view.adminCmdOpen && !view.shopOpen && !view.bookOpen && !view.inventoryOpen) {
    ctx.save();
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(255,100,100,0.5)";
    ctx.textAlign = "left";
    ctx.fillText("` = admin cmd", 10, H - 16);
    ctx.restore();
  }
}
