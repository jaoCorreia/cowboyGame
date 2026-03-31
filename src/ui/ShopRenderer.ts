import { SHOP_ITEMS, itemNextPrice, type GameItem } from "../items";
import { COW_SELL_PRICES, RARITY_COLORS, RARITY_LABELS } from "../constants";
import { drawPanel, drawPixelBtn, drawCowAt } from "./drawUtils";
import type { CowType } from "../cowTypes";

// Minimal Cow interface that ShopRenderer needs
export interface ShopCow {
  type: CowType;
  herdIndex: number;
}

export interface ShopHitBox {
  cow: ShopCow;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShopBuyHitBox {
  item: GameItem;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShopCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  coins: number;
  moneyIcon: HTMLImageElement;
  shopTab: "sell" | "buy";
  shopBuyScroll: number;
  inventory: ReadonlyMap<string, number>;
  itemIcons: ReadonlyMap<string, HTMLImageElement>;
  herdCows: ShopCow[];
  basedCows: ShopCow[];
  wrapTextLines(text: string, maxWidth: number, font: string): string[];
  // Outputs — renderer writes these hitboxes for click detection
  out: {
    shopSellButtons: ShopHitBox[];
    shopSellBasedButtons: ShopHitBox[];
    shopTabBtns: Array<{
      tab: "sell" | "buy";
      x: number;
      y: number;
      w: number;
      h: number;
    }>;
    shopCloseBtn: { x: number; y: number; r: number };
    shopBuyButtons: ShopBuyHitBox[];
    shopBuyContentArea: { x: number; y: number; w: number; h: number };
    shopSellAllHerdBtn: { x: number; y: number; w: number; h: number };
    shopSellAllBasedBtn: { x: number; y: number; w: number; h: number };
  };
}

export class ShopRenderer {
  private view!: ShopCtx;

  render(view: ShopCtx): void {
    this.view = view;
    const { ctx, canvas } = view;
    const W = canvas.width,
      H = canvas.height;

    const herd = view.herdCows;
    const based = view.basedCows;
    const ROW_H = 52;
    const SELL_MAX = 4; // max visible per section
    const PW = Math.min(W - 32, 390);

    // ── Compute panel height per tab ──────────────────────────────────────────
    let contentH: number;
    let totalBuyContentH = 0;
    const MAX_BUY_VISIBLE_H = 420; // altura máxima visível na aba comprar
    if (view.shopTab === "sell") {
      const herdRows = Math.max(1, Math.min(herd.length, SELL_MAX));
      const herdSellAllH = herd.length > 0 ? 44 : 0;
      const basedRows = Math.max(1, Math.min(based.length, SELL_MAX));
      const basedSellAllH = based.length > 0 ? 44 : 0;
      contentH =
        24 +
        herdRows * ROW_H +
        herdSellAllH +
        12 +
        24 +
        basedRows * ROW_H +
        basedSellAllH +
        8;
    } else {
      // Calcular altura real do conteúdo (com alturas dinâmicas)
      totalBuyContentH = 8;
      for (const item of SHOP_ITEMS) {
        const descLines = view.wrapTextLines(
          item.description,
          PW - 50 - 72 - 24,
          "10px sans-serif",
        );
        totalBuyContentH += 72 + (descLines.length - 1) * 12;
      }
      contentH = Math.min(MAX_BUY_VISIBLE_H, totalBuyContentH);
    }
    const HEADER_H = 66; // title + coins
    const TAB_H = 38;
    const PH = Math.min(H - 40, HEADER_H + TAB_H + contentH);
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;

    // ── Overlay + panel ───────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, PX, PY, PW, PH, 0);

    // ── Title ─────────────────────────────────────────────────────────────────
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText("🤠  Loja do Vaqueiro", PX + PW / 2, PY + 26);
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFD700";
    const coinsText = `${view.coins} moedas`;
    const coinsTextWidth = ctx.measureText(coinsText).width;
    ctx.drawImage(
      view.moneyIcon,
      PX + PW / 2 - coinsTextWidth / 2 - 20,
      PY + 38,
      16,
      16,
    );
    ctx.fillText(coinsText, PX + PW / 2, PY + 48);

    // ── Close button ──────────────────────────────────────────────────────────
    const closeCX = PX + PW - 18,
      closeCY = PY + 18;
    view.out.shopCloseBtn = { x: closeCX, y: closeCY, r: 12 };
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

    // Divisor under header
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H);
    ctx.stroke();

    // ── Tabs ──────────────────────────────────────────────────────────────────
    view.out.shopTabBtns = [];
    const tabLabels: Array<{ tab: "sell" | "buy"; label: string }> = [
      { tab: "sell", label: "🐄 Vender" },
      { tab: "buy", label: "🛒 Comprar" },
    ];
    const tabW = PW / tabLabels.length;
    const tabY = PY + HEADER_H;
    for (let ti = 0; ti < tabLabels.length; ti++) {
      const { tab, label } = tabLabels[ti]!;
      const tx = PX + ti * tabW;
      const isActive = view.shopTab === tab;
      ctx.fillStyle = isActive ? "rgba(160,100,20,0.5)" : "rgba(0,0,0,0.25)";
      ctx.fillRect(tx, tabY, tabW, TAB_H);
      ctx.fillStyle = isActive ? "#FFD700" : "#C8A870";
      ctx.font = `${isActive ? "bold " : ""}13px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, tx + tabW / 2, tabY + 24);
      if (isActive) {
        ctx.fillStyle = "#c89040";
        ctx.fillRect(tx, tabY + TAB_H - 3, tabW, 3);
      }
      view.out.shopTabBtns.push({ tab, x: tx, y: tabY, w: tabW, h: TAB_H });
    }

    // Divisor under tabs
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H + TAB_H);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H + TAB_H);
    ctx.stroke();

    const contentY = PY + HEADER_H + TAB_H;

    // ── Helper: draw a cow row ─────────────────────────────────────────────────
    const drawCowRow = (
      cow: ShopCow,
      rowY: number,
      rowIdx: number,
      btnArr: ShopHitBox[],
    ) => {
      if (rowIdx % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(PX + 6, rowY, PW - 12, ROW_H);
      }
      // Clip to row so cow drawing can't bleed outside
      ctx.save();
      ctx.beginPath();
      ctx.rect(PX + 6, rowY, PW - 12, ROW_H);
      ctx.clip();
      // Draw cow centred vertically in the upper ⅔ of the row
      drawCowAt(ctx, PX + 30, rowY + Math.round(ROW_H * 0.52), cow.type);
      ctx.restore();
      const textX = PX + 58;
      ctx.textAlign = "left";
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(cow.type.name, textX, rowY + 16);
      const rc = RARITY_COLORS[cow.type.rarity] ?? "#9e9e9e";
      const rl = RARITY_LABELS[cow.type.rarity] ?? cow.type.rarity;
      ctx.font = "9px sans-serif";
      const bw = ctx.measureText(rl).width + 8;
      ctx.fillStyle = rc + "33";
      ctx.beginPath();
      ctx.roundRect(textX, rowY + 19, bw, 13, 3);
      ctx.fill();
      ctx.fillStyle = rc;
      ctx.fillText(rl, textX + 4, rowY + 29);
      const price = COW_SELL_PRICES[cow.type.rarity] ?? 10;
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.drawImage(view.moneyIcon, textX, rowY + 34, 12, 12);
      ctx.fillText(`${price}`, textX + 14, rowY + 44);
      const bW = 64,
        bH = 24;
      const bX = PX + PW - bW - 12,
        bY = rowY + (ROW_H - bH) / 2;
      drawPixelBtn(ctx, bX, bY, bW, bH, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Vender", bX + bW / 2, bY + bH / 2);
      ctx.textBaseline = "alphabetic";
      btnArr.push({ cow, x: bX, y: bY, w: bW, h: bH });
    };

    // ── Helper: "Vender Tudo" button ──────────────────────────────────────────
    const drawSellAllBtn = (
      cows: ShopCow[],
      atY: number,
    ): { x: number; y: number; w: number; h: number } => {
      if (cows.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      const total = cows.reduce(
        (s, c) => s + (COW_SELL_PRICES[c.type.rarity] ?? 10),
        0,
      );
      const bW = Math.min(PW - 40, 230),
        bH = 30;
      const bX = PX + (PW - bW) / 2,
        bY = atY + 7;
      drawPixelBtn(ctx, bX, bY, bW, bH, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const sellAllText = `Vender Tudo  ${total}`;
      const sellAllTextWidth = ctx.measureText(sellAllText).width;
      ctx.drawImage(
        view.moneyIcon,
        bX + bW / 2 - sellAllTextWidth / 2 + 68,
        bY + bH / 2 - 7,
        14,
        14,
      );
      ctx.fillText(`Vender Tudo       ${total}`, bX + bW / 2, bY + bH / 2);
      ctx.textBaseline = "alphabetic";
      return { x: bX, y: bY, w: bW, h: bH };
    };

    // ── Sell tab ──────────────────────────────────────────────────────────────
    if (view.shopTab === "sell") {
      view.out.shopSellButtons = [];
      view.out.shopSellBasedButtons = [];
      let cy = contentY + 6;

      // Sub-header: Rebanho
      ctx.textAlign = "left";
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.fillText("🐄 Rebanho", PX + 12, cy + 13);
      cy += 20;

      const herdVisible = herd.slice(0, SELL_MAX);
      if (herdVisible.length === 0) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#7a6040";
        ctx.textAlign = "center";
        ctx.fillText("Rebanho vazio", PX + PW / 2, cy + ROW_H / 2 + 4);
        cy += ROW_H;
      } else {
        for (let i = 0; i < herdVisible.length; i++) {
          drawCowRow(herdVisible[i]!, cy, i, view.out.shopSellButtons);
          cy += ROW_H;
        }
        if (herd.length > SELL_MAX) {
          ctx.font = "10px sans-serif";
          ctx.fillStyle = "#C8A870";
          ctx.textAlign = "center";
          ctx.fillText(`+${herd.length - SELL_MAX} mais`, PX + PW / 2, cy - 2);
        }
      }
      view.out.shopSellAllHerdBtn = drawSellAllBtn(herd, cy);
      cy += herd.length > 0 ? 44 : 0;

      // Divider
      cy += 8;
      ctx.strokeStyle = "rgba(200,160,80,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PX + 16, cy);
      ctx.lineTo(PX + PW - 16, cy);
      ctx.stroke();
      cy += 4;

      // Sub-header: Curral
      ctx.textAlign = "left";
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.fillText("🏠 Curral", PX + 12, cy + 13);
      cy += 20;

      const basedVisible = based.slice(0, SELL_MAX);
      if (basedVisible.length === 0) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#7a6040";
        ctx.textAlign = "center";
        ctx.fillText("Curral vazio", PX + PW / 2, cy + ROW_H / 2 + 4);
        cy += ROW_H;
      } else {
        for (let i = 0; i < basedVisible.length; i++) {
          drawCowRow(basedVisible[i]!, cy, i, view.out.shopSellBasedButtons);
          cy += ROW_H;
        }
        if (based.length > SELL_MAX) {
          ctx.font = "10px sans-serif";
          ctx.fillStyle = "#C8A870";
          ctx.textAlign = "center";
          ctx.fillText(`+${based.length - SELL_MAX} mais`, PX + PW / 2, cy - 2);
        }
      }
      view.out.shopSellAllBasedBtn = drawSellAllBtn(based, cy);

      // ── Buy tab ───────────────────────────────────────────────────────────────
    } else {
      view.out.shopBuyButtons = [];
      const btnW = 72;
      const textMaxWidth = PW - 50 - btnW - 24; // largura disponível para descrição

      // Helper para quebrar texto em linhas
      const wrapText = (
        text: string,
        maxWidth: number,
        font: string,
      ): string[] => {
        ctx.font = font;
        const words = text.split(" ");
        const lines: string[] = [];
        let currentLine = "";
        for (const word of words) {
          const testLine = currentLine ? currentLine + " " + word : word;
          if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };

      // Calcular altura total do conteúdo
      let totalContentHeight = 8;
      for (const item of SHOP_ITEMS) {
        const descLines = wrapText(
          item.description,
          textMaxWidth,
          "10px sans-serif",
        );
        totalContentHeight += 72 + (descLines.length - 1) * 12;
      }

      // Limitar o scroll ao máximo
      const maxScroll = Math.max(0, totalContentHeight - contentH);
      view.shopBuyScroll = Math.min(view.shopBuyScroll, maxScroll);

      // Guardar área de conteúdo para detectar scroll
      view.out.shopBuyContentArea = { x: PX, y: contentY, w: PW, h: contentH };

      // Aplicar clipping na área de conteúdo
      ctx.save();
      ctx.beginPath();
      ctx.rect(PX + 4, contentY, PW - 8, contentH);
      ctx.clip();

      let cy = contentY + 8 - view.shopBuyScroll;

      for (const item of SHOP_ITEMS) {
        const level = view.inventory.get(item.id) ?? 0;
        const maxed = level >= item.maxLevel;
        const price = maxed ? 0 : itemNextPrice(item, level);
        const canAfford = !maxed && view.coins >= price;

        // Calcula linhas da descrição
        const descLines = wrapText(
          item.description,
          textMaxWidth,
          "10px sans-serif",
        );
        const itemH = 72 + (descLines.length - 1) * 12;

        // Pular itens fora da área visível
        if (cy + itemH < contentY || cy > contentY + contentH) {
          cy += itemH;
          continue;
        }

        // Row bg
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(PX + 6, cy, PW - 12, itemH - 2);

        // Icon background
        const iconX = PX + 36;
        const iconY = cy + 36;
        ctx.fillStyle = "rgba(200,160,80,0.25)";
        ctx.beginPath();
        ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(180,130,40,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Icon (image or emoji)
        const shopItemImg = view.itemIcons.get(item.id);
        if (
          shopItemImg &&
          shopItemImg.complete &&
          shopItemImg.naturalWidth > 0
        ) {
          ctx.drawImage(shopItemImg, iconX - 12, iconY - 12, 24, 24);
        } else {
          ctx.font = "22px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#FFE0A0";
          ctx.fillText(item.icon, iconX, iconY);
          ctx.textBaseline = "alphabetic";
        }

        // Name
        ctx.textAlign = "left";
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = "#FFE0A0";
        ctx.fillText(item.name, PX + 60, cy + 18);

        // Description (múltiplas linhas)
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#C8A870";
        let descY = cy + 32;
        for (const line of descLines) {
          ctx.fillText(line, PX + 60, descY);
          descY += 12;
        }

        // Level pips ou quantidade (para itens placeáveis)
        const pipsY = cy + 32 + descLines.length * 12 + 4;
        if (item.placeable || item.consumable) {
          ctx.font = "bold 10px sans-serif";
          ctx.fillStyle = level > 0 ? "#98FF98" : "#C8A870";
          ctx.textAlign = "left";
          ctx.fillText(
            level > 0
              ? `x${level}/${item.maxLevel} em estoque`
              : `0/${item.maxLevel} em estoque`,
            PX + 62,
            pipsY + 4,
          );
        } else {
          ctx.fillStyle = "#9b7e57";
          for (let i = 0; i < item.maxLevel; i++) {
            ctx.fillStyle = i < level ? "#FFD700" : "#3a2208";
            ctx.beginPath();
            ctx.arc(PX + 62 + i * 14, pipsY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#9b7e57";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.font = "10px sans-serif";
          ctx.fillStyle = "#C8A870";
          ctx.textAlign = "left";
          ctx.fillText(
            `Nível ${level}/${item.maxLevel}`,
            PX + 62 + item.maxLevel * 14 + 4,
            pipsY + 4,
          );
        }

        // Buy button
        const bW = 72,
          bH = 28;
        const bX = PX + PW - bW - 12,
          bY = cy + (itemH - bH) / 2;
        if (maxed && item.consumable) {
          drawPixelBtn(ctx, bX, bY, bW, bH, "pressed");
          ctx.fillStyle = "#7a6040";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Cheio", bX + bW / 2, bY + bH / 2);
        } else if (maxed && !item.placeable) {
          drawPixelBtn(ctx, bX, bY, bW, bH, "pressed");
          ctx.fillStyle = "#7a6040";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Máximo", bX + bW / 2, bY + bH / 2);
        } else {
          drawPixelBtn(ctx, bX, bY, bW, bH, canAfford ? "normal" : "pressed");
          ctx.fillStyle = canAfford ? "#FFD700" : "#7a6040";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const priceText = `${price}`;
          const priceTextWidth = ctx.measureText(priceText).width;
          ctx.drawImage(
            view.moneyIcon,
            bX + bW / 2 - priceTextWidth / 2 - 16,
            bY + bH / 2 - 6,
            12,
            12,
          );
          ctx.fillText(priceText, bX + bW / 2, bY + bH / 2);
          // Só adicionar botão se estiver visível
          if (canAfford && bY + bH > contentY && bY < contentY + contentH)
            view.out.shopBuyButtons.push({ item, x: bX, y: bY, w: bW, h: bH });
        }
        ctx.textBaseline = "alphabetic";

        cy += itemH;
      }

      ctx.restore();

      // Desenhar scrollbar se necessário
      if (maxScroll > 0) {
        const scrollBarH = contentH - 8;
        const thumbH = Math.max(
          30,
          (contentH / totalContentHeight) * scrollBarH,
        );
        const thumbY =
          contentY +
          4 +
          (view.shopBuyScroll / maxScroll) * (scrollBarH - thumbH);

        // Track
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(PX + PW - 10, contentY + 4, 6, scrollBarH);

        // Thumb
        ctx.fillStyle = "rgba(200,160,80,0.6)";
        ctx.beginPath();
        ctx.roundRect(PX + PW - 10, thumbY, 6, thumbH, 3);
        ctx.fill();
      }
    }
  }
}
