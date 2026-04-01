import { drawPanel, drawPixelBtn } from "./drawUtils";

export interface BenchHubCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  bench: {
    type: string;
    owner: string;
    ownerColor: string;
  };
  isOwner: boolean;
  stone: number;
  coins: number;
  machado: number;
  axeIcon: HTMLImageElement;
  // Outputs — renderer writes these back for click detection
  out: {
    benchCraftBtns: Array<{ id: string; x: number; y: number; w: number; h: number }>;
    benchHubCloseBtn: { x: number; y: number; r: number };
    benchPickupBtn: { x: number; y: number; w: number; h: number };
  };
}

interface Recipe {
  id: string;
  name: string;
  icon: string;
  desc: string;
  stone: number;
  coins: number;
}

export class BenchHubRenderer {
  render(view: BenchHubCtx): void {
    const { ctx, canvas, bench, isOwner } = view;
    const W = canvas.width, H = canvas.height;
    const isComm = bench.type === "bancada_comunitaria";

    const recipes: Recipe[] = [
      { id: "machado", name: "Machado de Pedra", icon: "🪓", desc: "Necessário para cortar árvores", stone: 5, coins: 50 },
    ];

    const RECIPE_H = 68;
    const PW = Math.min(W - 32, 380);
    const HEADER_H = 66;
    const pickupH = isOwner ? 46 : 0;
    const PH = Math.min(H - 40, HEADER_H + recipes.length * RECIPE_H + 20 + pickupH);
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, PX, PY, PW, PH, 0);

    // Título
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#FFD700";
    const title = isComm ? "🏗️ Bancada Comunitária" : "🔨 Bancada Individual";
    ctx.fillText(title, PX + PW / 2, PY + 28);

    // Dono
    ctx.font = "11px sans-serif";
    ctx.fillStyle = bench.ownerColor;
    ctx.fillText(`de ${bench.owner}`, PX + PW / 2, PY + 46);

    // Divisor
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H - 4);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H - 4);
    ctx.stroke();

    // Receitas
    view.out.benchCraftBtns = [];
    let ry = PY + HEADER_H;
    const stone = view.stone;
    const machado = view.machado;

    for (const recipe of recipes) {
      const canCraft = stone >= recipe.stone && view.coins >= recipe.coins && machado === 0;
      const alreadyHas = recipe.id === "machado" && machado > 0;

      // Recipe card background
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(PX + 8, ry + 4, PW - 16, RECIPE_H - 8);
      ctx.strokeStyle = "rgba(200,160,80,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(PX + 8, ry + 4, PW - 16, RECIPE_H - 8);

      // Icon + name
      ctx.drawImage(view.axeIcon, PX + 14, ry + 10, 18, 18);
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.textAlign = "left";
      ctx.fillText(recipe.name, PX + 38, ry + 24);

      // Description
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.fillText(recipe.desc, PX + 16, ry + 38);

      // Ingredients
      ctx.font = "11px sans-serif";
      const stoneOk = stone >= recipe.stone;
      const coinsOk = view.coins >= recipe.coins;
      ctx.fillStyle = stoneOk ? "#90ee90" : "#ff8888";
      ctx.fillText(`🪨 ${stone}/${recipe.stone}`, PX + 16, ry + 54);
      ctx.fillStyle = coinsOk ? "#90ee90" : "#ff8888";
      ctx.fillText(`💰 ${view.coins}/${recipe.coins}`, PX + 80, ry + 54);

      // Craft button
      const btnW = 80, btnH = 26;
      const btnX = PX + PW - 16 - btnW;
      const btnY = ry + (RECIPE_H - btnH) / 2;

      if (alreadyHas) {
        ctx.fillStyle = "rgba(100,100,100,0.5)";
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("✓ Tem", btnX + btnW / 2, btnY + btnH / 2 + 4);
      } else {
        drawPixelBtn(ctx, btnX, btnY, btnW, btnH, "normal");
        ctx.font = `bold 11px sans-serif`;
        ctx.fillStyle = canCraft ? "#FFD700" : "#888";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(canCraft ? "✦ Criar" : "🔒 Criar", btnX + btnW / 2, btnY + btnH / 2);
        ctx.textBaseline = "alphabetic";
        if (canCraft) {
          view.out.benchCraftBtns.push({ id: recipe.id, x: btnX, y: btnY, w: btnW, h: btnH });
        }
      }

      ry += RECIPE_H;
    }

    // Botão fechar
    const closeCX = PX + PW - 18, closeCY = PY + 18;
    ctx.fillStyle = "#9b3a18";
    ctx.beginPath();
    ctx.arc(closeCX, closeCY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e05030";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("✕", closeCX, closeCY);
    ctx.textBaseline = "alphabetic";
    view.out.benchHubCloseBtn = { x: closeCX, y: closeCY, r: 12 };

    // Botão recolher (só o dono)
    if (isOwner) {
      const bW = 140, bH = 30;
      const bX = PX + PW / 2 - bW / 2;
      const bY = PY + PH - 44;
      drawPixelBtn(ctx, bX, bY, bW, bH, "normal");
      ctx.fillStyle = "#FF9980";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📦 Recolher bancada", bX + bW / 2, bY + bH / 2);
      ctx.textBaseline = "alphabetic";
      view.out.benchPickupBtn = { x: bX, y: bY, w: bW, h: bH };
    } else {
      view.out.benchPickupBtn = { x: 0, y: 0, w: 0, h: 0 };
    }
  }
}
