import { SHOP_ITEMS, itemNextPrice, type GameItem } from "../items";
import { COW_SELL_PRICES, RARITY_COLORS, RARITY_LABELS } from "../constants";
import type { CowType } from "../cowTypes";
import { drawCowAt } from "./drawUtils";

const S = {
  overlay: [
    "position:fixed;inset:0;z-index:100",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.55)",
  ].join(";"),
  panel: [
    "width:min(420px,calc(100vw - 32px));max-height:92vh",
    "display:flex;flex-direction:column",
    "background:#2a1606;border:3px solid #9b7e57",
    "box-shadow:0 0 0 2px #4a3018,0 8px 32px rgba(0,0,0,.85)",
    "color:#FFE0A0;font-family:sans-serif;box-sizing:border-box",
  ].join(";"),
  header: [
    "display:flex;align-items:center;justify-content:space-between",
    "padding:12px 16px;background:#1a0a02;border-bottom:1px solid #4a3018;flex-shrink:0",
  ].join(";"),
  tabBar: "display:flex;flex-shrink:0;border-bottom:1px solid #4a3018",
  content: [
    "flex:1;overflow-y:auto;",
    "scrollbar-width:thin;scrollbar-color:#4a3018 #1a0a02",
  ].join(";"),
  subHeader: "padding:10px 14px 4px;font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px",
  cowRow: [
    "display:flex;align-items:center;gap:10px",
    "padding:8px 14px;border-bottom:1px solid rgba(74,48,24,0.4)",
  ].join(";"),
  sellBtn: [
    "padding:5px 14px;background:#9b6218;border:2px solid #e0a840",
    "color:#FFD700;font-size:11px;font-weight:bold;cursor:pointer;flex-shrink:0",
  ].join(";"),
  sellAllBtn: [
    "display:block;width:calc(100% - 28px);margin:6px 14px;padding:8px",
    "background:#3a2208;border:2px solid #9b7e57;color:#FFD700",
    "font-size:12px;font-weight:bold;cursor:pointer;text-align:center",
  ].join(";"),
  itemRow: [
    "display:flex;align-items:flex-start;gap:12px",
    "padding:10px 14px;border-bottom:1px solid rgba(74,48,24,0.4)",
  ].join(";"),
  buyBtn: [
    "padding:6px 12px;background:#9b6218;border:2px solid #e0a840",
    "color:#FFD700;font-size:11px;font-weight:bold;cursor:pointer;flex-shrink:0;white-space:nowrap",
  ].join(";"),
  buyBtnDisabled: [
    "padding:6px 12px;background:#2a1606;border:2px solid #4a3018",
    "color:#555;font-size:11px;cursor:not-allowed;flex-shrink:0;white-space:nowrap",
  ].join(";"),
  closeBtn: [
    "background:none;border:none;color:#9b7e57;font-size:20px",
    "cursor:pointer;line-height:1;padding:0",
  ].join(";"),
};

export interface ShopCow {
  type: CowType;
  herdIndex: number;
}

export interface ShopData {
  coins: number;
  shopTab: "sell" | "buy";
  herdCows: ShopCow[];
  basedCows: ShopCow[];
  inventory: ReadonlyMap<string, number>;
}

export interface ShopCallbacks {
  onSellCow(cow: ShopCow): void;
  onSellAllHerd(): void;
  onSellCowBased(cow: ShopCow): void;
  onSellAllBased(): void;
  onBuyItem(item: GameItem): void;
  onClose(): void;
}

export class ShopPanel {
  private _isOpen = false;
  private _tab: "sell" | "buy" = "sell";
  private cb: ShopCallbacks;

  constructor(cb: ShopCallbacks) {
    this.cb = cb;
  }

  open(data: ShopData): void {
    this._isOpen = true;
    this._tab = data.shopTab;
    document.getElementById("_shop_panel")?.remove();
    document.body.appendChild(this._build(data));
  }

  refresh(data: ShopData): void {
    if (!this._isOpen) return;
    // preserve current tab
    this.open({ ...data, shopTab: this._tab });
  }

  close(): void {
    this._isOpen = false;
    document.getElementById("_shop_panel")?.remove();
  }

  get isOpen(): boolean { return this._isOpen; }

  private _build(data: ShopData): HTMLElement {
    const ov = document.createElement("div");
    ov.id = "_shop_panel";
    ov.style.cssText = S.overlay;

    const herdTotal = data.herdCows.reduce((s, c) => s + (COW_SELL_PRICES[c.type.rarity] ?? 10), 0);
    const basedTotal = data.basedCows.reduce((s, c) => s + (COW_SELL_PRICES[c.type.rarity] ?? 10), 0);

    ov.innerHTML = `
<div style="${S.panel}">
  <!-- Header -->
  <div style="${S.header}">
    <div>
      <div style="color:#FFD700;font-size:15px;font-weight:bold;letter-spacing:1px">🤠 Loja do Vaqueiro</div>
      <div style="font-size:12px;color:#FFD700;margin-top:2px">💰 ${data.coins} moedas</div>
    </div>
    <button id="_shop_close" style="${S.closeBtn}">✕</button>
  </div>

  <!-- Tabs -->
  <div style="${S.tabBar}">
    <button id="_shop_tab_sell" style="
      flex:1;padding:10px;background:${this._tab === "sell" ? "rgba(160,100,20,0.5)" : "transparent"};
      border:none;border-bottom:${this._tab === "sell" ? "3px solid #c89040" : "3px solid transparent"};
      color:${this._tab === "sell" ? "#FFD700" : "#C8A870"};
      font-size:13px;font-weight:${this._tab === "sell" ? "bold" : "normal"};
      cursor:pointer;font-family:sans-serif;
    ">🐄 Vender</button>
    <button id="_shop_tab_buy" style="
      flex:1;padding:10px;background:${this._tab === "buy" ? "rgba(160,100,20,0.5)" : "transparent"};
      border:none;border-bottom:${this._tab === "buy" ? "3px solid #c89040" : "3px solid transparent"};
      color:${this._tab === "buy" ? "#FFD700" : "#C8A870"};
      font-size:13px;font-weight:${this._tab === "buy" ? "bold" : "normal"};
      cursor:pointer;font-family:sans-serif;
    ">🛒 Comprar</button>
  </div>

  <!-- Content -->
  <div id="_shop_content" style="${S.content}"></div>
</div>`;

    const content = ov.querySelector("#_shop_content") as HTMLElement;
    if (this._tab === "sell") {
      this._buildSellTab(content, data, herdTotal, basedTotal);
    } else {
      this._buildBuyTab(content, data);
    }

    ov.querySelector("#_shop_close")!.addEventListener("click", () => this.cb.onClose());
    ov.addEventListener("click", (e) => { if (e.target === ov) this.cb.onClose(); });
    ov.querySelector("#_shop_tab_sell")!.addEventListener("click", () => {
      this._tab = "sell";
      this.refresh(data);
    });
    ov.querySelector("#_shop_tab_buy")!.addEventListener("click", () => {
      this._tab = "buy";
      this.refresh(data);
    });

    return ov;
  }

  private _buildSellTab(
    content: HTMLElement,
    data: ShopData,
    herdTotal: number,
    basedTotal: number,
  ): void {
    // Rebanho
    const h1 = document.createElement("div");
    h1.style.cssText = S.subHeader;
    h1.textContent = "🐄 Rebanho";
    content.appendChild(h1);

    if (data.herdCows.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:16px;text-align:center;color:#7a6040;font-size:12px";
      empty.textContent = "Rebanho vazio";
      content.appendChild(empty);
    } else {
      for (const cow of data.herdCows) {
        content.appendChild(this._cowRow(cow, () => this.cb.onSellCow(cow)));
      }
      const btn = document.createElement("button");
      btn.style.cssText = S.sellAllBtn;
      btn.textContent = `Vender Tudo  💰 ${herdTotal}`;
      btn.addEventListener("click", () => this.cb.onSellAllHerd());
      content.appendChild(btn);
    }

    // Divider
    const div = document.createElement("div");
    div.style.cssText = "border-top:1px solid rgba(200,160,80,0.3);margin:8px 0";
    content.appendChild(div);

    // Curral
    const h2 = document.createElement("div");
    h2.style.cssText = S.subHeader;
    h2.textContent = "🏠 Curral";
    content.appendChild(h2);

    if (data.basedCows.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:16px;text-align:center;color:#7a6040;font-size:12px";
      empty.textContent = "Curral vazio";
      content.appendChild(empty);
    } else {
      for (const cow of data.basedCows) {
        content.appendChild(this._cowRow(cow, () => this.cb.onSellCowBased(cow)));
      }
      const btn = document.createElement("button");
      btn.style.cssText = S.sellAllBtn;
      btn.textContent = `Vender Tudo  💰 ${basedTotal}`;
      btn.addEventListener("click", () => this.cb.onSellAllBased());
      content.appendChild(btn);
    }
  }

  private _cowRow(cow: ShopCow, onSell: () => void): HTMLElement {
    const rarityColor = RARITY_COLORS[cow.type.rarity] ?? "#9e9e9e";
    const rarityLabel = RARITY_LABELS[cow.type.rarity] ?? cow.type.rarity;
    const price = COW_SELL_PRICES[cow.type.rarity] ?? 10;

    const row = document.createElement("div");
    row.style.cssText = S.cowRow;

    // Cow icon
    const iconEl = document.createElement("div");
    iconEl.style.cssText = [
      "width:40px;height:40px;flex-shrink:0;border-radius:4px",
      "background:rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;overflow:hidden",
    ].join(";");
    if (cow.type.sprite) {
      const img = document.createElement("img");
      img.src = `/sprites/${cow.type.sprite}`;
      img.style.cssText = "width:36px;height:36px;object-fit:contain;image-rendering:pixelated";
      iconEl.appendChild(img);
    } else {
      const cvs = document.createElement("canvas");
      cvs.width = 40;
      cvs.height = 40;
      const ctx2d = cvs.getContext("2d");
      if (ctx2d) drawCowAt(ctx2d, 20, 28, cow.type);
      iconEl.appendChild(cvs);
    }
    row.appendChild(iconEl);

    const info = document.createElement("div");
    info.style.cssText = "flex:1";
    info.innerHTML = `
<div style="font-size:13px;font-weight:bold;color:#FFE0A0">${cow.type.name}</div>
<div style="display:flex;align-items:center;gap:8px;margin-top:2px">
  <span style="font-size:10px;color:${rarityColor};background:${rarityColor}22;padding:1px 6px;border-radius:2px">${rarityLabel}</span>
  <span style="font-size:11px;color:#FFD700">💰 ${price}</span>
</div>`;
    row.appendChild(info);

    const btn = document.createElement("button");
    btn.style.cssText = S.sellBtn;
    btn.textContent = "Vender";
    btn.addEventListener("click", onSell);
    row.appendChild(btn);

    return row;
  }

  private _buildBuyTab(content: HTMLElement, data: ShopData): void {
    for (const item of SHOP_ITEMS) {
      const level = data.inventory.get(item.id) ?? 0;
      const maxed = level >= item.maxLevel;
      const price = maxed ? 0 : itemNextPrice(item, level);
      const canAfford = !maxed && data.coins >= price;

      const row = document.createElement("div");
      row.style.cssText = S.itemRow;

      // Icon circle
      const iconCircle = document.createElement("div");
      iconCircle.style.cssText = [
        "width:44px;height:44px;border-radius:50%;flex-shrink:0",
        "background:rgba(200,160,80,0.25);border:1.5px solid rgba(180,130,40,0.4)",
        "display:flex;align-items:center;justify-content:center;font-size:22px",
      ].join(";");
      if (item.icon.includes("/")) {
        const img = document.createElement("img");
        img.src = item.icon;
        img.style.cssText = "width:24px;height:24px;object-fit:contain";
        iconCircle.appendChild(img);
      } else {
        iconCircle.textContent = item.icon;
      }
      row.appendChild(iconCircle);

      // Info
      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0";
      info.innerHTML = `
<div style="font-weight:bold;font-size:13px;color:#FFE0A0">${item.name}</div>
<div style="font-size:10px;color:#9b7e57;margin-top:2px">${item.description}</div>
${_levelIndicator(item, level)}`;
      row.appendChild(info);

      // Buy button
      const buyBtn = document.createElement("button");
      if (maxed && !item.placeable && !item.consumable) {
        buyBtn.style.cssText = S.buyBtnDisabled;
        buyBtn.textContent = "Máximo";
        buyBtn.disabled = true;
      } else if (maxed && item.consumable) {
        buyBtn.style.cssText = S.buyBtnDisabled;
        buyBtn.textContent = "Cheio";
        buyBtn.disabled = true;
      } else {
        buyBtn.style.cssText = canAfford ? S.buyBtn : S.buyBtnDisabled;
        buyBtn.disabled = !canAfford;
        buyBtn.innerHTML = `💰 ${price}`;
        if (canAfford) {
          buyBtn.addEventListener("click", () => this.cb.onBuyItem(item));
        }
      }
      row.appendChild(buyBtn);
      content.appendChild(row);
    }
  }

  destroy(): void {
    this.close();
  }
}

function _levelIndicator(item: GameItem, level: number): string {
  if (item.placeable || item.consumable) {
    return `<div style="font-size:10px;color:${level > 0 ? "#98FF98" : "#9b7e57"};margin-top:4px">
      ${level > 0 ? `x${level}/${item.maxLevel} em estoque` : `0/${item.maxLevel} em estoque`}
    </div>`;
  }
  const pips = Array.from({ length: item.maxLevel }, (_, i) =>
    `<span style="
      display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;
      background:${i < level ? "#FFD700" : "#3a2208"};border:1px solid #9b7e57
    "></span>`,
  ).join("");
  return `<div style="margin-top:6px;display:flex;align-items:center;gap:4px">
    ${pips}
    <span style="font-size:10px;color:#9b7e57">Nível ${level}/${item.maxLevel}</span>
  </div>`;
}
