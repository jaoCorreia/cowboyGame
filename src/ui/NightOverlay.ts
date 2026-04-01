/**
 * Renders the time-of-day overlay (afternoon tint, night darkness, stars, moon).
 * Pure function — no Game state mutation.
 */
export function renderNightOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: { width: number; height: number },
  timePeriod: "manha" | "tarde" | "noite",
  nightFade: number,
  time: number,
): void {
  const W = canvas.width,
    H = canvas.height;

  // ── Tarde: tint quente alaranjado ────────────────────────────────────────
  if (timePeriod === "tarde") {
    ctx.fillStyle = "rgba(200,100,20,0.10)";
    ctx.fillRect(0, 0, W, H);

    // Sol (canto superior direito)
    const sunX = W * 0.87,
      sunY = H * 0.09;
    ctx.save();
    ctx.globalAlpha = 0.55;
    // Raios do sol
    ctx.strokeStyle = "rgba(255,200,40,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + time * 0.3;
      const r1 = 18,
        r2 = 28;
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(angle) * r1, sunY + Math.sin(angle) * r1);
      ctx.lineTo(sunX + Math.cos(angle) * r2, sunY + Math.sin(angle) * r2);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffe060";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff4a0";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // ── Noite: overlay escuro, estrelas e lua ────────────────────────────────
  if (nightFade <= 0) return;

  // Tint azul-escuro
  ctx.fillStyle = `rgba(5,10,35,${nightFade * 0.46})`;
  ctx.fillRect(0, 0, W, H);

  // Névoa roxa nas bordas (atmosfera noturna)
  const grad = ctx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.3,
    W / 2,
    H / 2,
    H * 0.85,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(20,0,40,${nightFade * 0.18})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Estrelas — clipa na faixa do céu (top 28%)
  const skyH = H * 0.28;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, skyH);
  ctx.clip();
  for (let i = 0; i < 110; i++) {
    const sx = ((i * 137 + 19) % 97) / 97;
    const sy = ((i * 251 + 43) % 89) / 89;
    const twinkle =
      0.3 + Math.sin(time * (0.8 + (i % 7) * 0.25) + i) * 0.4;
    const sz = 0.5 + (i % 4) * 0.45;
    const hue =
      i % 3 === 0
        ? "220,230,255"
        : i % 3 === 1
          ? "255,255,220"
          : "255,240,200";
    ctx.fillStyle = `rgba(${hue},${nightFade * twinkle})`;
    ctx.beginPath();
    ctx.arc(sx * W, sy * skyH, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Lua crescente (canto superior direito)
  const moonX = W * 0.84,
    moonY = H * 0.09;
  const moonR = 20;
  ctx.save();
  ctx.globalAlpha = nightFade;
  const moonGlow = ctx.createRadialGradient(
    moonX,
    moonY,
    moonR,
    moonX,
    moonY,
    moonR * 3.5,
  );
  moonGlow.addColorStop(0, "rgba(240,230,180,0.18)");
  moonGlow.addColorStop(1, "rgba(240,230,180,0)");
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR * 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0e8c0";
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(5,10,35,0.90)";
  ctx.beginPath();
  ctx.arc(moonX + 9, moonY - 3, moonR - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
