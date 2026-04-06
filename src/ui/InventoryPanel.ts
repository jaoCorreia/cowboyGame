import { SHOP_ITEMS, type GameItem } from "../items";
import { WOOD_MAX_STACK, STONE_MAX_STACK, MAX_INVENTORY_SLOTS } from "../constants";
import type { RemotePlayer } from "../network";

const S = {
  overlay: [
    "position:fixed;inset:0;z-index:100",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.55)",
  ].join(";"),
  panel: [
    "width:min(440px,calc(100vw - 32px));max-height:92vh",
    "display:flex;flex-direction:column",
    "background:#2a1606;border:3px solid #9b7e57",
    "box-shadow:0 0 0 2px #4a3018,0 8px 32px rgba(0,0,0,.85)",
    "color:#FFE0A0;font-family:sans-serif;box-sizing:border-box",
  ].join(";"),
  header: [
    "display:flex;align-items:center;justify-content:space-between",
    "padding:12px 16px;background:#1a0a02;border-bottom:1px solid #4a3018;flex-shrink:0",
  ].join(";"),
  content: [
    "flex:1;overflow-y:auto",
    "scrollbar-width:thin;scrollbar-color:#4a3018 #1a0a02",
  ].join(";"),
  sectionLabel: "padding:10px 14px 4px;font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px",
  resRow: [
    "display:flex;align-items:center;justify-content:space-between",
    "padding:6px 14px;border-bottom:1px solid rgba(74,48,24,0.3);font-size:13px",
  ].join(";"),
  itemRow: [
    "display:flex;align-items:flex-start;gap:12px",
    "padding:10px 14px;border-bottom:1px solid rgba(74,48,24,0.4)",
  ].join(";"),
  iconCircle: [
    "width:44px;height:44px;border-radius:50%;flex-shrink:0",
    "background:rgba(200,160,80,0.25);border:1.5px solid rgba(180,130,40,0.4)",
    "display:flex;align-items:center;justify-content:center;font-size:22px",
  ].join(";"),
  btnSmall: [
    "padding:5px 10px;border:2px solid #9b7e57;background:#3a2208",
    "color:#FFE0A0;font-size:10px;cursor:pointer;white-space:nowrap",
  ].join(";"),
  btnDrop: [
    "padding:5px 10px;border:2px solid #c04040;background:#5a1010",
    "color:#FF8080;font-size:10px;cursor:pointer;white-space:nowrap",
  ].join(";"),
  btnPrimary: [
    "padding:8px 18px;background:#9b6218;border:2px solid #e0a840",
    "color:#FFD700;font-size:12px;font-weight:bold;cursor:pointer",
  ].join(";"),
  btnGhost: [
    "padding:8px 18px;background:#3a2208;border:2px solid #9b7e57",
    "color:#C8A870;font-size:12px;cursor:pointer",
  ].join(";"),
  closeBtn: [
    "background:none;border:none;color:#9b7e57;font-size:20px",
    "cursor:pointer;line-height:1;padding:0",
  ].join(";"),
};

export interface InventoryData {
  inventory: ReadonlyMap<string, number>;
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
  leiteTimer: number;
}

export interface InventoryCallbacks {
  onDrop(item: GameItem): void;
  onTrade(item: GameItem): void;
  onPlace(item: GameItem): void;
  onUse(item: GameItem): void;
  onAcceptTrade(): void;
  onDeclineTrade(): void;
  onCancelTrade(): void;
  onSelectPlayer(playerId: string): void;
  onClose(): void;
}

export class InventoryPanel {
  private _isOpen = false;
  private cb: InventoryCallbacks;

  constructor(cb: InventoryCallbacks) {
    this.cb = cb;
  }

  open(data: InventoryData): void {
    this._isOpen = true;
    document.getElementById("_inv_panel")?.remove();
    document.body.appendChild(this._build(data));
  }

  refresh(data: InventoryData): void {
    if (!this._isOpen) return;
    this.open(data);
  }

  close(): void {
    this._isOpen = false;
    document.getElementById("_inv_panel")?.remove();
  }

  get isOpen(): boolean { return this._isOpen; }

  private _build(data: InventoryData): HTMLElement {
    const ov = document.createElement("div");
    ov.id = "_inv_panel";
    ov.style.cssText = S.overlay;

    const woodQty = data.inventory.get("wood") ?? 0;
    const stoneQty = data.inventory.get("stone") ?? 0;
    const machadoQty = data.inventory.get("machado") ?? 0;
    const ownedItems = SHOP_ITEMS.filter((it) => (data.inventory.get(it.id) ?? 0) > 0);

    const slotUsed = ownedItems.length
      + (woodQty > 0 ? 1 : 0)
      + (stoneQty > 0 ? 1 : 0)
      + (machadoQty > 0 ? 1 : 0);

    const panel = document.createElement("div");
    panel.style.cssText = S.panel;

    // Header
    const hdr = document.createElement("div");
    hdr.style.cssText = S.header;
    hdr.innerHTML = `
<div style="color:#FFD700;font-size:15px;font-weight:bold;letter-spacing:1px">🎒 Inventário</div>
<div style="display:flex;align-items:center;gap:12px">
  <span style="font-size:11px;color:${slotUsed >= MAX_INVENTORY_SLOTS ? "#ff8888" : "#9b7e57"}">
    ${slotUsed}/${MAX_INVENTORY_SLOTS} slots
  </span>
  <button id="_inv_close" style="${S.closeBtn}">✕</button>
</div>`;
    panel.appendChild(hdr);

    // Content area
    const content = document.createElement("div");
    content.style.cssText = S.content;
    panel.appendChild(content);

    ov.appendChild(panel);

    // Render based on trade state
    switch (data.tradeState) {
      case "incoming":
        this._buildTradeIncoming(content, data);
        break;
      case "selecting":
        this._buildTradeSelecting(content, data);
        break;
      case "waiting":
        this._buildTradeWaiting(content, data);
        break;
      case "result":
        this._buildTradeResult(content, data);
        break;
      default:
        this._buildNormal(content, data, woodQty, stoneQty, machadoQty, ownedItems);
    }

    ov.querySelector("#_inv_close")!.addEventListener("click", () => {
      if (data.tradeState !== "idle") {
        this.cb.onCancelTrade();
      } else {
        this.cb.onClose();
      }
    });
    ov.addEventListener("click", (e) => {
      if (e.target === ov) {
        if (data.tradeState !== "idle") this.cb.onCancelTrade();
        else this.cb.onClose();
      }
    });

    return ov;
  }

  private _buildNormal(
    content: HTMLElement,
    data: InventoryData,
    woodQty: number,
    stoneQty: number,
    machadoQty: number,
    ownedItems: GameItem[],
  ): void {
    const hasResources = woodQty > 0 || stoneQty > 0 || machadoQty > 0;

    if (hasResources) {
      const lbl = document.createElement("div");
      lbl.style.cssText = S.sectionLabel;
      lbl.textContent = "RECURSOS";
      content.appendChild(lbl);

      if (woodQty > 0) content.appendChild(this._resRow("🪵 Madeira", woodQty, WOOD_MAX_STACK));
      if (stoneQty > 0) content.appendChild(this._resRow("🪨 Pedra", stoneQty, STONE_MAX_STACK));
      if (machadoQty > 0) content.appendChild(this._resRow("🪓 Machado de Pedra", 1, 1, true));

      const div = document.createElement("div");
      div.style.cssText = "border-top:1px solid rgba(200,160,80,0.25);margin:4px 0 0";
      content.appendChild(div);
    }

    if (ownedItems.length === 0 && !hasResources) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:32px;text-align:center;color:#7a6040;font-size:13px";
      empty.textContent = "Nenhum item ainda — compre na loja!";
      content.appendChild(empty);
      return;
    }

    if (ownedItems.length > 0) {
      const lbl = document.createElement("div");
      lbl.style.cssText = S.sectionLabel;
      lbl.textContent = "ITENS";
      content.appendChild(lbl);
    }

    for (const item of ownedItems) {
      const level = data.inventory.get(item.id) ?? 0;
      content.appendChild(this._itemRow(item, level, data));
    }
  }

  private _resRow(label: string, qty: number, max: number, check = false): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = S.resRow;
    row.innerHTML = `
<span>${label}</span>
<span style="color:#FFD700;font-weight:bold">${check ? "✓" : `${qty}/${max}`}</span>`;
    return row;
  }

  private _itemRow(item: GameItem, level: number, data: InventoryData): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = S.itemRow;

    const iconEl = document.createElement("div");
    iconEl.style.cssText = S.iconCircle;
    if (item.icon.includes("/")) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.style.cssText = "width:24px;height:24px;object-fit:contain";
      iconEl.appendChild(img);
    } else {
      iconEl.textContent = item.icon;
    }
    row.appendChild(iconEl);

    const info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0";

    let levelHtml = "";
    if (item.placeable || item.consumable) {
      const isActive = item.id === "leite_fluorescente" && data.leiteTimer > 0;
      const activeText = isActive
        ? ` <span style="color:#FFD080;font-size:10px">✨ ativo: ${Math.ceil(data.leiteTimer / 60)}m${String(Math.ceil(data.leiteTimer % 60)).padStart(2, "0")}s</span>`
        : "";
      levelHtml = `<div style="font-size:10px;color:#98FF98;margin-top:4px">x${level} no inventário${activeText}</div>`;
    } else {
      const pips = Array.from({ length: item.maxLevel }, (_, i) =>
        `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:2px;background:${i < level ? "#FFD700" : "#3a2208"};border:1px solid #9b7e57"></span>`,
      ).join("");
      levelHtml = `<div style="margin-top:5px;display:flex;align-items:center">
        ${pips}
        <span style="font-size:10px;color:#9b7e57;margin-left:4px">Lv ${level}/${item.maxLevel}</span>
      </div>`;
    }

    info.innerHTML = `
<div style="font-weight:bold;font-size:13px;color:#FFE0A0">${item.name}</div>
<div style="font-size:10px;color:#9b7e57;margin-top:2px">${item.description}</div>
${levelHtml}`;
    row.appendChild(info);

    // Action buttons
    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;flex-direction:column;gap:5px;flex-shrink:0";

    const dropBtn = document.createElement("button");
    dropBtn.style.cssText = S.btnDrop;
    dropBtn.textContent = "🗑 Descartar";
    dropBtn.addEventListener("click", () => this.cb.onDrop(item));
    btns.appendChild(dropBtn);

    const actionBtn = document.createElement("button");
    if (item.placeable) {
      actionBtn.style.cssText = S.btnSmall;
      actionBtn.innerHTML = "📍 Posicionar";
      actionBtn.style.color = "#98FF98";
      actionBtn.style.borderColor = "#98FF98";
      actionBtn.addEventListener("click", () => this.cb.onPlace(item));
    } else if (item.consumable) {
      const canUse = level > 0 && data.leiteTimer <= 0;
      actionBtn.style.cssText = S.btnSmall;
      actionBtn.textContent = data.leiteTimer > 0 ? "✨ Ativo" : "✨ Usar";
      actionBtn.style.color = canUse ? "#A0FFCC" : "#668866";
      actionBtn.disabled = !canUse;
      if (canUse) actionBtn.addEventListener("click", () => this.cb.onUse(item));
    } else {
      actionBtn.style.cssText = S.btnSmall;
      actionBtn.textContent = "↔ Trocar";
      actionBtn.addEventListener("click", () => this.cb.onTrade(item));
    }
    btns.appendChild(actionBtn);
    row.appendChild(btns);

    return row;
  }

  private _buildTradeIncoming(content: HTMLElement, data: InventoryData): void {
    const offer = data.tradeIncoming!;
    content.style.padding = "24px 16px";

    const iconHtml = offer.item.icon.includes("/")
      ? `<img src="${offer.item.icon}" style="width:30px;height:30px;object-fit:contain"/>`
      : offer.item.icon;

    content.innerHTML = `
<div style="text-align:center">
  <div style="font-size:14px;font-weight:bold;color:#FFE0A0;margin-bottom:6px">Oferta de troca recebida!</div>
  <div style="font-size:12px;color:${offer.fromColor};margin-bottom:16px">De: ${offer.fromName}</div>
  <div style="
    width:56px;height:56px;border-radius:50%;margin:0 auto 12px;
    background:rgba(200,160,80,0.3);border:2px solid rgba(180,130,40,0.5);
    display:flex;align-items:center;justify-content:center;font-size:30px
  ">${iconHtml}</div>
  <div style="font-weight:bold;font-size:13px;color:#FFD700;margin-bottom:4px">${offer.item.name}  Lv ${offer.level}</div>
  <div style="font-size:11px;color:#9b7e57;margin-bottom:20px">${offer.item.description}</div>
  <div style="display:flex;justify-content:center;gap:12px">
    <button id="_inv_trade_accept" style="${S.btnPrimary}">✅ Aceitar</button>
    <button id="_inv_trade_decline" style="${S.btnGhost}">❌ Recusar</button>
  </div>
</div>`;

    content.querySelector("#_inv_trade_accept")!.addEventListener("click", () => this.cb.onAcceptTrade());
    content.querySelector("#_inv_trade_decline")!.addEventListener("click", () => this.cb.onDeclineTrade());
  }

  private _buildTradeSelecting(content: HTMLElement, data: InventoryData): void {
    content.style.padding = "20px 16px";

    const title = document.createElement("div");
    title.style.cssText = "text-align:center;font-size:13px;font-weight:bold;color:#FFE0A0;margin-bottom:14px";
    const tradeIconDisplay = data.tradeItem?.icon?.includes("/")
      ? `[img]` : (data.tradeItem?.icon ?? "");
    title.textContent = `Enviar ${tradeIconDisplay} ${data.tradeItem?.name ?? ""} para:`;
    content.appendChild(title);

    if (data.onlinePlayers.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "text-align:center;color:#7a6040;font-size:12px;padding:16px";
      empty.textContent = "Nenhum jogador online.";
      content.appendChild(empty);
    } else {
      for (const rp of data.onlinePlayers.slice(0, 5)) {
        const btn = document.createElement("button");
        btn.style.cssText = [
          "display:flex;align-items:center;gap:10px;width:100%",
          "padding:10px 14px;margin-bottom:6px",
          "background:#3a2208;border:2px solid #9b7e57;cursor:pointer",
          "font-size:13px;color:#FFE0A0;text-align:left",
        ].join(";");
        btn.innerHTML = `
<span style="width:10px;height:10px;border-radius:50%;background:${rp.color};flex-shrink:0;display:inline-block"></span>
<span>${rp.name}</span>`;
        btn.addEventListener("click", () => this.cb.onSelectPlayer(rp.id));
        content.appendChild(btn);
      }
    }

    const cancel = document.createElement("button");
    cancel.style.cssText = `display:block;width:100%;margin-top:12px;${S.btnGhost}`;
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", () => this.cb.onCancelTrade());
    content.appendChild(cancel);
  }

  private _buildTradeWaiting(content: HTMLElement, data: InventoryData): void {
    content.style.padding = "40px 16px";
    content.innerHTML = `
<div style="text-align:center">
  <div style="font-size:32px;margin-bottom:12px;animation:spin 1.5s linear infinite">⏳</div>
  <div style="font-size:14px;font-weight:bold;color:#FFD700;margin-bottom:6px">Aguardando resposta...</div>
  <div style="font-size:12px;color:#9b7e57;margin-bottom:20px">
    Oferecendo: ${data.tradeItem?.icon?.includes("/") ? "[img]" : (data.tradeItem?.icon ?? "")} ${data.tradeItem?.name ?? ""}
  </div>
  <button id="_inv_cancel_wait" style="${S.btnGhost}">Cancelar</button>
</div>
<style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>`;
    content.querySelector("#_inv_cancel_wait")!.addEventListener("click", () => this.cb.onCancelTrade());
  }

  private _buildTradeResult(content: HTMLElement, data: InventoryData): void {
    content.style.padding = "40px 16px";
    content.innerHTML = `
<div style="text-align:center;font-size:15px;font-weight:bold;color:#FFD700">
  ${data.tradeResultMsg}
</div>`;
  }

  destroy(): void {
    this.close();
  }
}
