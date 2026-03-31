import { SHOP_ITEMS, type GameItem } from "../items";
import { MAX_INVENTORY_SLOTS, WOOD_MAX_STACK, STONE_MAX_STACK } from "../constants";
import { drawPanel, drawPixelBtn } from "./drawUtils";
import type { RemotePlayer } from "../network";

export interface InventoryHitBox {
  item: GameItem;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TradePlayerBtn {
  playerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InventoryCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  inventory: ReadonlyMap<string, number>;
  inventoryScroll: number;
  itemIcons: ReadonlyMap<string, HTMLImageElement>;
  leiteTimer: number;
  time: number;
  tradeState: "idle" | "selecting" | "waiting" | "incoming" | "result";
  tradeIncoming: {
    fromId: string;
    fromName: string;
    fromColor: string;
    item: GameItem;
    level: number;
  } | null;
  tradeItem: GameItem | null;
  tradeResultMsg: string;
  onlinePlayers: RemotePlayer[];
  icons: {
    trunkIcon: HTMLImageElement;
    axeIcon: HTMLImageElement;
  };
  wrapTextLines(text: string, maxWidth: number, font: string): string[];
  inventorySlotCount(): number;
  out: {
    inventoryCloseBtn: { x: number; y: number; r: number };
    inventoryContentArea: { x: number; y: number; w: number; h: number };
    inventoryScroll: number;
    inventoryDropBtns: InventoryHitBox[];
    inventoryTradeBtns: InventoryHitBox[];
    inventoryPlaceBtns: InventoryHitBox[];
    inventoryUseBtns: InventoryHitBox[];
    tradeAcceptBtn: { x: number; y: number; w: number; h: number };
    tradeDeclineBtn: { x: number; y: number; w: number; h: number };
    tradeCancelBtn: { x: number; y: number; w: number; h: number };
    tradePlayerBtns: TradePlayerBtn[];
  };
}

export class InventoryRenderer {
  private view!: InventoryCtx;

  render(view: InventoryCtx): void {
    this.view = view;
    const { ctx, canvas } = view;
    const W = canvas.width,
      H = canvas.height;
    this._renderInventory(W, H);
  }

  private _renderInventory(W: number, H: number): void {
    const view = this.view;
    const { ctx } = view;
    const ownedItems = SHOP_ITEMS.filter(
      (it) => (view.inventory.get(it.id) ?? 0) > 0,
    );
    const resources: Array<{ id: string; name: string; icon: string; qty: number; max: number }> = [];
    const woodQty = view.inventory.get("wood") ?? 0;
    const stoneQty = view.inventory.get("stone") ?? 0;
    const machadoQty = view.inventory.get("machado") ?? 0;
    if (woodQty > 0) resources.push({ id: "wood", name: "Madeira", icon: "🪵", qty: woodQty, max: WOOD_MAX_STACK });
    if (stoneQty > 0) resources.push({ id: "stone", name: "Pedra", icon: "🪨", qty: stoneQty, max: STONE_MAX_STACK });
    if (machadoQty > 0) resources.push({ id: "machado", name: "Machado de Pedra", icon: "", qty: machadoQty, max: 1 });
    const PW = Math.min(W - 32, 400);
    const HEADER_H = 56;
    const btnW = 74;
    const textMaxWidth = PW - 60 - (btnW + 6) * 2 - 16;

    // Calcular altura dinâmica do conteúdo
    let totalContentH = 16;
    // Resources section height
    if (resources.length > 0) totalContentH += 16 + resources.length * 36;
    if (ownedItems.length > 0) {
      for (const item of ownedItems) {
        const descLines = view.wrapTextLines(
          item.description,
          textMaxWidth,
          "10px sans-serif",
        );
        totalContentH += 72 + (descLines.length - 1) * 12;
      }
    } else {
      totalContentH = 60;
    }

    const MAX_VISIBLE_H = 420;
    const contentH = Math.min(MAX_VISIBLE_H, totalContentH);
    const PH = Math.min(H - 40, HEADER_H + contentH);
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, PX, PY, PW, PH, 0);
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.drawImage(view.icons.trunkIcon, PX + PW / 2 - 70, PY + 8, 20, 20);
    ctx.fillText("Inventário", PX + PW / 2 - 2, PY + 26);
    const closeCX = PX + PW - 18,
      closeCY = PY + 18;
    view.out.inventoryCloseBtn = { x: closeCX, y: closeCY, r: 12 };
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
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H);
    ctx.stroke();

    // Guardar área de conteúdo para detectar scroll
    view.out.inventoryContentArea = { x: PX, y: PY + HEADER_H, w: PW, h: contentH };

    if (view.tradeState === "incoming" && view.tradeIncoming) {
      this._renderTradeIncomingView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else if (view.tradeState === "selecting") {
      this._renderTradeSelectView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else if (view.tradeState === "waiting") {
      this._renderTradeWaitingView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else if (view.tradeState === "result") {
      this._renderTradeResultView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else {
      // Recursos primeiro
      let resourcesY = PY + HEADER_H + 8 - view.inventoryScroll;
      if (resources.length > 0) {
        const ctx2 = ctx;
        ctx2.save();
        ctx2.beginPath();
        ctx2.rect(PX + 4, PY + HEADER_H, PW - 8, contentH);
        ctx2.clip();
        ctx2.font = "bold 11px sans-serif";
        ctx2.fillStyle = "#C8A870";
        ctx2.textAlign = "left";
        ctx2.fillText("RECURSOS", PX + 14, resourcesY + 12);
        resourcesY += 20;
        for (const res of resources) {
          ctx2.fillStyle = "rgba(255,255,255,0.05)";
          ctx2.fillRect(PX + 8, resourcesY, PW - 16, 30);
          ctx2.font = "14px sans-serif";
          ctx2.fillStyle = "#FFE0A0";
          ctx2.textAlign = "left";
          if (res.id === "machado") {
            ctx2.drawImage(view.icons.axeIcon, PX + 16, resourcesY + 6, 16, 16);
            ctx2.fillText(`  ${res.name}`, PX + 32, resourcesY + 20);
          } else {
            ctx2.fillText(`${res.icon}  ${res.name}`, PX + 16, resourcesY + 20);
          }
          ctx2.textAlign = "right";
          ctx2.fillStyle = "#FFD700";
          ctx2.font = "bold 13px sans-serif";
          const label = res.max === 1 ? "✓" : `${res.qty}/${res.max}`;
          ctx2.fillText(label, PX + PW - 16, resourcesY + 20);
          resourcesY += 36;
        }
        // slot count
        const slotUsed = view.inventorySlotCount();
        ctx2.font = "10px sans-serif";
        ctx2.fillStyle = slotUsed >= MAX_INVENTORY_SLOTS ? "#ff8888" : "#888";
        ctx2.textAlign = "right";
        ctx2.fillText(`Mochila: ${slotUsed}/${MAX_INVENTORY_SLOTS} slots`, PX + PW - 14, resourcesY + 4);
        resourcesY += 12;
        ctx2.restore();
      }
      this._renderInventoryItems(
        PX,
        PY + HEADER_H,
        PW,
        contentH,
        ownedItems,
        totalContentH,
        resources.length > 0 ? 16 + resources.length * 36 + 16 : 0,
      );
    }
  }

  private _renderInventoryItems(
    PX: number,
    PY: number,
    PW: number,
    PH: number,
    ownedItems: GameItem[],
    totalContentH: number,
    resourceOffset = 0,
  ): void {
    const view = this.view;
    const { ctx } = view;
    view.out.inventoryDropBtns = [];
    view.out.inventoryTradeBtns = [];
    view.out.inventoryPlaceBtns = [];
    view.out.inventoryUseBtns = [];
    if (ownedItems.length === 0 && resourceOffset === 0) {
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#7a6040";
      ctx.textAlign = "center";
      ctx.fillText(
        "Nenhum item ainda — compre na loja!",
        PX + PW / 2,
        PY + PH / 2,
      );
      return;
    }
    if (ownedItems.length === 0) return;

    const btnW = 74;
    const textMaxWidth = PW - 60 - (btnW + 6) * 2 - 16; // espaço para descrição

    // Limitar o scroll ao máximo
    const maxScroll = Math.max(0, totalContentH - PH);
    view.out.inventoryScroll = Math.min(view.inventoryScroll, maxScroll);

    // Aplicar clipping na área de conteúdo
    ctx.save();
    ctx.beginPath();
    ctx.rect(PX + 4, PY, PW - 8, PH);
    ctx.clip();

    let cy = PY + 8 + resourceOffset - view.inventoryScroll;

    for (let i = 0; i < ownedItems.length; i++) {
      const item = ownedItems[i]!;
      const level = view.inventory.get(item.id) ?? 0;

      // Calcular linhas da descrição
      const descLines = view.wrapTextLines(
        item.description,
        textMaxWidth,
        "10px sans-serif",
      );
      const ROW_H = 72 + (descLines.length - 1) * 12;

      // Pular itens fora da área visível
      if (cy + ROW_H < PY || cy > PY + PH) {
        cy += ROW_H;
        continue;
      }

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(PX + 6, cy, PW - 12, ROW_H - 2);
      }

      // Icon background
      const invIconX = PX + 30;
      const invIconY = cy + 36;
      ctx.fillStyle = "rgba(200,160,80,0.25)";
      ctx.beginPath();
      ctx.arc(invIconX, invIconY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,130,40,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(invIconX, invIconY, 18, 0, Math.PI * 2);
      ctx.stroke();

      // Icon (image or emoji)
      const invItemImg = view.itemIcons.get(item.id);
      if (invItemImg && invItemImg.complete && invItemImg.naturalWidth > 0) {
        ctx.drawImage(invItemImg, invIconX - 12, invIconY - 12, 24, 24);
      } else {
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFE0A0";
        ctx.fillText(item.icon, invIconX, invIconY);
        ctx.textBaseline = "alphabetic";
      }

      ctx.textAlign = "left";
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(item.name, PX + 52, cy + 18);

      // Descrição (múltiplas linhas)
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#C8A870";
      let descY = cy + 32;
      for (const line of descLines) {
        ctx.fillText(line, PX + 52, descY);
        descY += 12;
      }

      // Level pips ou quantidade (após a descrição)
      const pipsY = cy + 32 + descLines.length * 12 + 4;
      if (item.placeable || item.consumable) {
        // Itens placeáveis/consumíveis: mostrar quantidade em vez de dots de nível
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = item.consumable ? "#A0FFCC" : "#98FF98";
        ctx.textAlign = "left";
        ctx.fillText(`x${level} no inventário`, PX + 54, pipsY);
        if (
          item.consumable &&
          view.leiteTimer > 0 &&
          item.id === "leite_fluorescente"
        ) {
          ctx.fillStyle = "#FFD080";
          const mins = Math.ceil(view.leiteTimer / 60);
          const secs = Math.ceil(view.leiteTimer % 60);
          ctx.fillText(
            `✨ ativo: ${mins}m${secs < 10 ? "0" : ""}${secs}s`,
            PX + 150,
            pipsY,
          );
        }
      } else {
        for (let p = 0; p < item.maxLevel; p++) {
          ctx.fillStyle = p < level ? "#FFD700" : "#3a2208";
          ctx.beginPath();
          ctx.arc(PX + 54 + p * 14, pipsY - 4, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#9b7e57";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#C8A870";
        ctx.textAlign = "left";
        ctx.fillText(
          `Lv ${level}/${item.maxLevel}`,
          PX + 54 + item.maxLevel * 14 + 4,
          pipsY,
        );
      }
      const bH = 26;
      const dropX = PX + PW - (btnW + 6) * 2 - 8,
        dropY = cy + (ROW_H - bH) / 2;
      const tradeX = PX + PW - btnW - 8,
        tradeY = dropY;
      drawPixelBtn(ctx, dropX, dropY, btnW, bH, "normal");
      ctx.fillStyle = "#FF9980";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🗑 Descartar", dropX + btnW / 2, dropY + bH / 2);
      if (item.placeable) {
        drawPixelBtn(ctx, tradeX, tradeY, btnW, bH, "normal");
        ctx.fillStyle = "#98FF98";
        ctx.fillText("📍 Posicionar", tradeX + btnW / 2, tradeY + bH / 2);
        if (dropY + bH > PY && dropY < PY + PH) {
          view.out.inventoryPlaceBtns.push({
            item,
            x: tradeX,
            y: tradeY,
            w: btnW,
            h: bH,
          });
        }
      } else if (item.consumable) {
        const canUse = level > 0 && view.leiteTimer <= 0;
        drawPixelBtn(
          ctx,
          tradeX,
          tradeY,
          btnW,
          bH,
          canUse ? "normal" : "pressed",
        );
        ctx.fillStyle = canUse ? "#A0FFCC" : "#668866";
        ctx.fillText(
          view.leiteTimer > 0 ? "✨ Ativo" : "✨ Usar",
          tradeX + btnW / 2,
          tradeY + bH / 2,
        );
        if (canUse && dropY + bH > PY && dropY < PY + PH) {
          view.out.inventoryUseBtns.push({
            item,
            x: tradeX,
            y: tradeY,
            w: btnW,
            h: bH,
          });
        }
      } else {
        drawPixelBtn(ctx, tradeX, tradeY, btnW, bH, "normal");
        ctx.fillStyle = "#FFD700";
        ctx.fillText("↔ Trocar", tradeX + btnW / 2, tradeY + bH / 2);
        if (dropY + bH > PY && dropY < PY + PH) {
          view.out.inventoryTradeBtns.push({
            item,
            x: tradeX,
            y: tradeY,
            w: btnW,
            h: bH,
          });
        }
      }
      ctx.textBaseline = "alphabetic";
      if (dropY + bH > PY && dropY < PY + PH) {
        view.out.inventoryDropBtns.push({
          item,
          x: dropX,
          y: dropY,
          w: btnW,
          h: bH,
        });
      }
      cy += ROW_H;
    }

    ctx.restore();

    // Desenhar scrollbar se necessário
    if (maxScroll > 0) {
      const scrollBarH = PH - 8;
      const thumbH = Math.max(30, (PH / totalContentH) * scrollBarH);
      const thumbY =
        PY + 4 + (view.inventoryScroll / maxScroll) * (scrollBarH - thumbH);

      // Track
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(PX + PW - 10, PY + 4, 6, scrollBarH);

      // Thumb
      ctx.fillStyle = "rgba(200,160,80,0.6)";
      ctx.beginPath();
      ctx.roundRect(PX + PW - 10, thumbY, 6, thumbH, 3);
      ctx.fill();
    }
  }

  private _renderTradeIncomingView(
    PX: number,
    PY: number,
    PW: number,
    _PH: number,
  ): void {
    const view = this.view;
    const { ctx } = view;
    const offer = view.tradeIncoming!;
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFE0A0";
    ctx.fillText("Oferta de troca recebida!", PX + PW / 2, PY + 28);
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = offer.fromColor;
    ctx.fillText(`De: ${offer.fromName}`, PX + PW / 2, PY + 46);

    // Trade item icon with background
    const tradeIconX = PX + PW / 2;
    const tradeIconY = PY + 80;
    ctx.fillStyle = "rgba(200,160,80,0.3)";
    ctx.beginPath();
    ctx.arc(tradeIconX, tradeIconY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,130,40,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tradeIconX, tradeIconY, 24, 0, Math.PI * 2);
    ctx.stroke();

    const tradeItemImg = view.itemIcons.get(offer.item.id);
    if (
      tradeItemImg &&
      tradeItemImg.complete &&
      tradeItemImg.naturalWidth > 0
    ) {
      ctx.drawImage(tradeItemImg, tradeIconX - 16, tradeIconY - 16, 32, 32);
    } else {
      ctx.font = "28px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(offer.item.icon, tradeIconX, tradeIconY);
      ctx.textBaseline = "alphabetic";
    }

    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText(
      `${offer.item.name}  Lv ${offer.level}`,
      PX + PW / 2,
      PY + 112,
    );
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.fillText(offer.item.description, PX + PW / 2, PY + 128);
    const bW = 110,
      bH = 32;
    const aX = PX + PW / 2 - bW - 8,
      aY = PY + 146;
    const dX = PX + PW / 2 + 8,
      dY = PY + 146;
    drawPixelBtn(ctx, aX, aY, bW, bH, "active");
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("✅ Aceitar", aX + bW / 2, aY + bH / 2);
    drawPixelBtn(ctx, dX, dY, bW, bH, "normal");
    ctx.fillStyle = "#FF9980";
    ctx.fillText("❌ Recusar", dX + bW / 2, dY + bH / 2);
    ctx.textBaseline = "alphabetic";
    view.out.tradeAcceptBtn = { x: aX, y: aY, w: bW, h: bH };
    view.out.tradeDeclineBtn = { x: dX, y: dY, w: bW, h: bH };
  }

  private _renderTradeSelectView(
    PX: number,
    PY: number,
    PW: number,
    _PH: number,
  ): void {
    const view = this.view;
    const { ctx } = view;
    view.out.tradePlayerBtns = [];
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFE0A0";
    ctx.fillText(
      `Enviar ${view.tradeItem?.icon ?? ""} ${view.tradeItem?.name ?? ""} para:`,
      PX + PW / 2,
      PY + 26,
    );
    const online = view.onlinePlayers;
    let cy = PY + 42;
    if (online.length === 0) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#7a6040";
      ctx.fillText("Nenhum jogador online.", PX + PW / 2, cy + 20);
    } else {
      for (const rp of online.slice(0, 5)) {
        const bW = PW - 40,
          bH = 32;
        const bX = PX + 20,
          bY = cy;
        drawPixelBtn(ctx, bX, bY, bW, bH, "normal");
        ctx.fillStyle = rp.color;
        ctx.beginPath();
        ctx.arc(bX + 18, bY + bH / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFE0A0";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(rp.name, bX + 32, bY + bH / 2 + 4);
        view.out.tradePlayerBtns.push({
          playerId: rp.id,
          name: rp.name,
          color: rp.color,
          x: bX,
          y: bY,
          w: bW,
          h: bH,
        });
        cy += bH + 8;
      }
    }
    const cW = 120,
      cH = 28;
    const cX = PX + (PW - cW) / 2,
      cY = cy + 8;
    drawPixelBtn(ctx, cX, cY, cW, cH, "pressed");
    ctx.fillStyle = "#C8A870";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Cancelar", cX + cW / 2, cY + cH / 2);
    ctx.textBaseline = "alphabetic";
    view.out.tradeCancelBtn = { x: cX, y: cY, w: cW, h: cH };
  }

  private _renderTradeWaitingView(
    PX: number,
    PY: number,
    PW: number,
    PH: number,
  ): void {
    const view = this.view;
    const { ctx } = view;
    const pulse = 0.7 + 0.3 * Math.sin(view.time * 3);
    ctx.globalAlpha = pulse;
    ctx.textAlign = "center";
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText("⏳ Aguardando resposta...", PX + PW / 2, PY + PH / 2 - 12);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.fillText(
      `Oferecendo: ${view.tradeItem?.icon ?? ""} ${view.tradeItem?.name ?? ""}`,
      PX + PW / 2,
      PY + PH / 2 + 10,
    );
    ctx.globalAlpha = 1;
    const cW = 120,
      cH = 28;
    const cX = PX + (PW - cW) / 2,
      cY = PY + PH / 2 + 30;
    drawPixelBtn(ctx, cX, cY, cW, cH, "pressed");
    ctx.fillStyle = "#C8A870";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Cancelar", cX + cW / 2, cY + cH / 2);
    ctx.textBaseline = "alphabetic";
    view.out.tradeCancelBtn = { x: cX, y: cY, w: cW, h: cH };
  }

  private _renderTradeResultView(
    PX: number,
    PY: number,
    PW: number,
    PH: number,
  ): void {
    const view = this.view;
    const { ctx } = view;
    ctx.textAlign = "center";
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText(view.tradeResultMsg, PX + PW / 2, PY + PH / 2);
  }
}
