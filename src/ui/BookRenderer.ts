import { sprites } from "../sprites";
import { COW_TYPES } from "../cowTypes";
import { SHOP_ITEMS } from "../items";
import { RARITY_COLORS, RARITY_LABELS } from "../constants";
import { type NPCEntry, NPC_ENTRIES } from "../npcs";
import { drawPanel, drawPixelBtn, drawCowAt } from "./drawUtils";
import type { CowType } from "../cowTypes";

export interface BookCtx {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  bookTab: "vacas" | "itens" | "personagens";
  bookPage: number;
  bookPageAnimT: number;
  discovered: ReadonlySet<string>;
  capturedByType: ReadonlyMap<string, number>;
  discoveredNPCs: ReadonlySet<string>;
  inventory: ReadonlyMap<string, number>;
  itemIcons: ReadonlyMap<string, HTMLImageElement>;
}

export class BookRenderer {
  private view!: BookCtx;

  render(view: BookCtx): void {
    this.view = view;
    const { ctx, canvas } = view;
    const W = canvas.width,
      H = canvas.height;
    const BW = Math.min(W - 32, 500),
      BH = Math.min(H - 32, 620);
    const BX = (W - BW) / 2,
      BY = (H - BH) / 2;

    // Backdrop
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, W, H);

    // Book panel
    drawPanel(ctx, BX, BY, BW, BH, 1);

    // Inner parchment
    const parchX = BX + 26;
    const parchY = BY + 37;
    const parchW = BW - 50;
    const parchH = BH - 74;
    ctx.fillStyle = "#f2e8cc";
    ctx.fillRect(parchX, parchY, parchW, parchH);

    // Title
    ctx.fillStyle = "#5c2e08";
    ctx.font = "bold 20px serif";
    ctx.textAlign = "center";
    ctx.fillText("📖  Livro do Cowboy", BX + BW / 2, parchY + 26);

    // Tab buttons
    const ownedItemsCount = SHOP_ITEMS.filter(
      (it) => (view.inventory.get(it.id) ?? 0) > 0,
    ).length;
    const discovNPCCount = NPC_ENTRIES.filter((n) =>
      view.discoveredNPCs.has(n.id),
    ).length;
    const bookTabs: Array<{
      key: "vacas" | "itens" | "personagens";
      label: string;
    }> = [
      { key: "vacas", label: `🐄 ${view.discovered.size}/${COW_TYPES.length}` },
      { key: "itens", label: `🎒 ${ownedItemsCount}/${SHOP_ITEMS.length}` },
      {
        key: "personagens",
        label: `👤 ${discovNPCCount}/${NPC_ENTRIES.length}`,
      },
    ];
    const tabW = (parchW - 20) / 3;
    const tabY = parchY + 38;
    const tabH = 24;
    for (let i = 0; i < bookTabs.length; i++) {
      const tab = bookTabs[i]!;
      const tx = parchX + 10 + i * tabW;
      const active = view.bookTab === tab.key;
      ctx.fillStyle = active ? "#c8a060" : "#e0d0a8";
      ctx.beginPath();
      ctx.roundRect(tx, tabY, tabW - 4, tabH, [4, 4, 0, 0]);
      ctx.fill();
      ctx.strokeStyle = "#c8a060";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, tabY, tabW - 4, tabH, [4, 4, 0, 0]);
      ctx.stroke();
      ctx.fillStyle = active ? "#3a1a00" : "#887050";
      ctx.font = `bold ${active ? 12 : 11}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tab.label, tx + (tabW - 4) / 2, tabY + 12);
      ctx.textBaseline = "alphabetic";
    }

    const headerH = 74;
    ctx.strokeStyle = "#c8a060";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(parchX + 10, parchY + headerH);
    ctx.lineTo(parchX + parchW - 10, parchY + headerH);
    ctx.stroke();

    // Close button
    const closeBtnX = BX + BW - 54,
      closeBtnY = BY + 8;
    drawPixelBtn(ctx, closeBtnX, closeBtnY, 48, 40, "pressed");
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕", closeBtnX + 24, closeBtnY + 20);
    ctx.textBaseline = "alphabetic";

    const pageTop = parchY + headerH + 2;
    const pageH = parchH - headerH - 48;

    if (view.bookTab === "vacas") {
      this.renderBookVacas(
        parchX,
        parchY,
        parchW,
        parchH,
        pageTop,
        pageH,
        BX,
        BW,
      );
    } else if (view.bookTab === "itens") {
      this.renderBookItens(parchX, parchY, parchW, parchH, pageTop, BX, BW);
    } else {
      this.renderBookPersonagens(
        parchX,
        parchY,
        parchW,
        parchH,
        pageTop,
        pageH,
        BX,
        BW,
      );
    }
  }

  private renderBookVacas(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    pageTop: number,
    pageH: number,
    BX: number,
    BW: number,
  ) {
    const { ctx } = this.view;
    const pageCX = parchX + parchW / 2;

    const t = this.view.bookPageAnimT;
    const scaleX = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(parchX, pageTop, parchW, pageH + 40);
    ctx.clip();

    ctx.save();
    ctx.translate(pageCX, pageTop + pageH / 2);
    ctx.scale(scaleX, 1);
    ctx.translate(-pageCX, -(pageTop + pageH / 2));

    const cowType = COW_TYPES[this.view.bookPage]!;
    const discovered = this.view.discovered.has(cowType.id);
    const count = this.view.capturedByType.get(cowType.id) ?? 0;

    const cowCX = pageCX;
    const cowCY = pageTop + 90;

    if (discovered) {
      ctx.save();
      ctx.translate(cowCX, cowCY);
      ctx.scale(1.4, 1.4);
      drawCowAt(ctx, 0, 0, cowType);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.roundRect(cowCX - 44, cowCY - 44, 88, 80, 12);
      ctx.fill();
      ctx.fillStyle = "#bbb";
      ctx.font = "bold 52px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", cowCX, cowCY - 4);
      ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = discovered ? "#3a1a00" : "#888";
    ctx.font = `bold ${discovered ? 22 : 18}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(discovered ? cowType.name : "???", pageCX, cowCY + 64);

    const rarityColor = RARITY_COLORS[cowType.rarity] ?? "#aaa";
    const rarityLabel = RARITY_LABELS[cowType.rarity] ?? cowType.rarity;
    ctx.font = "12px sans-serif";
    const badgeW = ctx.measureText(rarityLabel).width + 16;
    const badgeX = pageCX - badgeW / 2;
    ctx.fillStyle = rarityColor + "33";
    ctx.beginPath();
    ctx.roundRect(badgeX, cowCY + 70, badgeW, 20, 6);
    ctx.fill();
    ctx.fillStyle = rarityColor;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(rarityLabel, pageCX, cowCY + 84);

    ctx.strokeStyle = "#c8a060";
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(parchX + 30, cowCY + 98);
    ctx.lineTo(parchX + parchW - 30, cowCY + 98);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (discovered) {
      ctx.fillStyle = "#5c3010";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      const maxDescW = parchW - 60;
      const words = cowType.description.split(" ");
      let line = "";
      let lineY = cowCY + 118;
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxDescW) {
          ctx.fillText(line, pageCX, lineY);
          line = word;
          lineY += 18;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, pageCX, lineY);
      lineY += 28;
      // Capturadas badge
      const capText =
        count > 0
          ? `🏆 ${count} capturada${count !== 1 ? "s" : ""}`
          : "🎯 Ainda não capturada";
      ctx.font = "bold 12px sans-serif";
      const capBW = ctx.measureText(capText).width + 20;
      const capBX = pageCX - capBW / 2;
      ctx.fillStyle = count > 0 ? "rgba(180,130,0,0.18)" : "rgba(0,0,0,0.07)";
      ctx.beginPath();
      ctx.roundRect(capBX, lineY - 14, capBW, 22, 8);
      ctx.fill();
      ctx.strokeStyle = count > 0 ? "rgba(180,130,0,0.5)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(capBX, lineY - 14, capBW, 22, 8);
      ctx.stroke();
      ctx.fillStyle = count > 0 ? "#8a6000" : "#999";
      ctx.textBaseline = "middle";
      ctx.fillText(capText, pageCX, lineY - 3);
      ctx.textBaseline = "alphabetic";
    } else {
      ctx.fillStyle = "#aaa";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      ctx.fillText("Não descoberta ainda.", pageCX, cowCY + 120);
    }

    ctx.restore();
    ctx.restore();

    this.renderBookNav(
      parchX,
      parchY,
      parchW,
      parchH,
      BX,
      BW,
      this.view.bookPage,
      COW_TYPES.length,
    );

    ctx.fillStyle = "#887050";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "← → ou scroll para navegar",
      BX + BW / 2,
      parchY + parchH - 6,
    );
  }

  private renderBookItens(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    pageTop: number,
    BX: number,
    BW: number,
  ) {
    const { ctx } = this.view;
    const pageCX = parchX + parchW / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(parchX, pageTop, parchW, parchH - (pageTop - parchY));
    ctx.clip();

    const itemH = 74;
    let iy = pageTop + 10;

    for (const item of SHOP_ITEMS) {
      const level = this.view.inventory.get(item.id) ?? 0;
      const owned = level > 0;
      const maxed = level >= item.maxLevel;

      ctx.fillStyle = owned ? "rgba(180,130,40,0.12)" : "rgba(0,0,0,0.05)";
      ctx.beginPath();
      ctx.roundRect(parchX + 14, iy, parchW - 28, itemH - 6, 8);
      ctx.fill();
      if (owned) {
        ctx.strokeStyle = "rgba(180,130,40,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(parchX + 14, iy, parchW - 28, itemH - 6, 8);
        ctx.stroke();
      }

      const iconX = parchX + 40;
      const iconY = iy + (itemH - 6) / 2 - 2;
      const iconRadius = 22;

      // Fundo circular do ícone
      ctx.fillStyle = owned ? "rgba(200,160,80,0.3)" : "rgba(100,100,100,0.15)";
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = owned
        ? "rgba(180,130,40,0.5)"
        : "rgba(100,100,100,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Ícone (imagem ou emoji)
      ctx.globalAlpha = owned ? 1 : 0.4;
      const itemImg = this.view.itemIcons.get(item.id);
      if (itemImg && itemImg.complete && itemImg.naturalWidth > 0) {
        const imgSize = 28;
        ctx.drawImage(
          itemImg,
          iconX - imgSize / 2,
          iconY - imgSize / 2,
          imgSize,
          imgSize,
        );
      } else {
        ctx.font = "26px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000";
        ctx.fillText(item.icon, iconX, iconY);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = owned ? "#3a1a00" : "#999";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(owned ? item.name : "???", parchX + 70, iy + 22);

      if (owned) {
        ctx.fillStyle = "#5c3010";
        ctx.font = "11px serif";
        ctx.fillText(item.description, parchX + 70, iy + 38);
      } else {
        ctx.fillStyle = "#bbb";
        ctx.font = "11px serif";
        ctx.fillText("Item não descoberto", parchX + 70, iy + 38);
      }

      if (owned) {
        const badgeText =
          item.placeable || item.consumable
            ? `x${level}`
            : maxed
              ? "MAX"
              : `Nív. ${level}/${item.maxLevel}`;
        ctx.font = "bold 11px sans-serif";
        const bw = ctx.measureText(badgeText).width + 12;
        const bx = parchX + parchW - 28 - bw;
        ctx.fillStyle =
          (maxed && !item.placeable && !item.consumable
            ? "#FFD700"
            : "#c8a060") + "44";
        ctx.beginPath();
        ctx.roundRect(bx, iy + 10, bw, 18, 5);
        ctx.fill();
        ctx.fillStyle =
          maxed && !item.placeable && !item.consumable ? "#b08000" : "#6a4020";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, bx + bw / 2, iy + 19);
        ctx.textBaseline = "alphabetic";
      }

      iy += itemH;
    }

    ctx.restore();

    const ownedCount = SHOP_ITEMS.filter(
      (it) => (this.view.inventory.get(it.id) ?? 0) > 0,
    ).length;
    ctx.fillStyle = "#887050";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Itens descobertos: ${ownedCount} / ${SHOP_ITEMS.length}`,
      BX + BW / 2,
      parchY + parchH - 6,
    );
  }

  private renderBookPersonagens(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    pageTop: number,
    pageH: number,
    BX: number,
    BW: number,
  ) {
    const { ctx } = this.view;
    const pageCX = parchX + parchW / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(parchX, pageTop, parchW, pageH + 40);
    ctx.clip();

    const npc = NPC_ENTRIES[this.view.bookPage];
    if (!npc) {
      ctx.restore();
      return;
    }
    const discovered = this.view.discoveredNPCs.has(npc.id);

    const npcCX = pageCX;
    const npcCY = pageTop + 90;

    if (discovered) {
      const img = sprites.get(npc.spriteKey);
      const SW = 64,
        SH = 64;
      if (img) {
        ctx.save();
        ctx.translate(npcCX, npcCY - 14);
        ctx.scale(1.4, 1.4);
        // Se for sprite sheet (bandit), extrair um frame específico
        if (npc.spriteKey.includes("bandit")) {
          // Pegar frame 0 da row 2 (direção leste)
          ctx.drawImage(img, 0, 2 * SH, SW, SH, -SW / 2, -SH / 2, SW, SH);
        } else {
          ctx.drawImage(img, -SW / 2, -SH / 2, SW, SH);
        }
        ctx.restore();
      } else {
        ctx.font = "52px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#887050";
        ctx.fillText("🧑‍🌾", npcCX, npcCY - 10);
        ctx.textBaseline = "alphabetic";
      }
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.roundRect(npcCX - 44, npcCY - 54, 88, 80, 12);
      ctx.fill();
      ctx.fillStyle = "#bbb";
      ctx.font = "bold 52px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", npcCX, npcCY - 14);
      ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = discovered ? "#3a1a00" : "#888";
    ctx.font = `bold ${discovered ? 22 : 18}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(discovered ? npc.name : "???", pageCX, npcCY + 60);

    if (discovered) {
      ctx.font = "12px sans-serif";
      const bw = ctx.measureText(npc.role).width + 16;
      const bx = pageCX - bw / 2;
      ctx.fillStyle = "rgba(92,46,8,0.15)";
      ctx.beginPath();
      ctx.roundRect(bx, npcCY + 66, bw, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#5c2e08";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(npc.role, pageCX, npcCY + 80);

      ctx.strokeStyle = "#c8a060";
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(parchX + 30, npcCY + 94);
      ctx.lineTo(parchX + parchW - 30, npcCY + 94);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#5c3010";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      const maxDescW = parchW - 60;
      const words = npc.description.split(" ");
      let line = "";
      let lineY = npcCY + 116;
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxDescW) {
          ctx.fillText(line, pageCX, lineY);
          line = word;
          lineY += 18;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, pageCX, lineY);
    } else {
      ctx.fillStyle = "#aaa";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      ctx.fillText("Personagem não encontrado.", pageCX, npcCY + 112);
    }

    ctx.restore();

    if (NPC_ENTRIES.length > 1) {
      this.renderBookNav(
        parchX,
        parchY,
        parchW,
        parchH,
        BX,
        BW,
        this.view.bookPage,
        NPC_ENTRIES.length,
      );
    }

    const discCount = NPC_ENTRIES.filter((n) =>
      this.view.discoveredNPCs.has(n.id),
    ).length;
    ctx.fillStyle = "#887050";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Encontrados: ${discCount} / ${NPC_ENTRIES.length}`,
      BX + BW / 2,
      parchY + parchH - 6,
    );
  }

  private renderBookNav(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    BX: number,
    BW: number,
    page: number,
    total: number,
  ) {
    const { ctx } = this.view;
    const navY = parchY + parchH - 44;
    const prevCX = BX + BW / 2 - 70;
    const nextCX = BX + BW / 2 + 70;

    const canPrev = page > 0;
    drawPixelBtn(
      ctx,
      prevCX - 28,
      navY - 16,
      56,
      34,
      canPrev ? "normal" : "pressed",
    );
    ctx.fillStyle = canPrev ? "#FFD700" : "#888";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("◀  Ant.", prevCX, navY + 1);

    ctx.fillStyle = "#887050";
    ctx.font = "bold 13px serif";
    ctx.fillText(`${page + 1} / ${total}`, BX + BW / 2, navY + 1);

    const canNext = page < total - 1;
    drawPixelBtn(
      ctx,
      nextCX - 28,
      navY - 16,
      56,
      34,
      canNext ? "normal" : "pressed",
    );
    ctx.fillStyle = canNext ? "#FFD700" : "#888";
    ctx.fillText("Próx.  ▶", nextCX, navY + 1);
    ctx.textBaseline = "alphabetic";
  }
}
