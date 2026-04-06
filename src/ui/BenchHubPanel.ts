const S = {
  overlay: [
    "position:fixed;inset:0;z-index:100",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.55)",
  ].join(";"),
  panel: [
    "width:min(400px,calc(100vw - 32px));max-height:92vh;overflow-y:auto",
    "background:#2a1606;border:3px solid #9b7e57",
    "box-shadow:0 0 0 2px #4a3018,0 8px 32px rgba(0,0,0,.85)",
    "color:#FFE0A0;font-family:sans-serif;box-sizing:border-box",
    "scrollbar-width:thin;scrollbar-color:#4a3018 #1a0a02",
  ].join(";"),
  header: [
    "display:flex;align-items:center;justify-content:space-between",
    "padding:12px 16px;background:#1a0a02;border-bottom:1px solid #4a3018",
  ].join(";"),
  section: "padding:12px 16px;border-bottom:1px solid #4a3018",
  recipeCard: [
    "background:rgba(255,255,255,0.04);border:1px solid rgba(200,160,80,0.2)",
    "border-radius:2px;padding:12px 14px;display:flex;align-items:center;gap:12px",
  ].join(";"),
  btn: [
    "padding:8px 18px;background:#9b6218;border:2px solid #e0a840",
    "color:#FFD700;font-size:12px;font-weight:bold;cursor:pointer;min-width:80px",
  ].join(";"),
  btnDisabled: [
    "padding:8px 18px;background:#2a1606;border:2px solid #4a3018",
    "color:#555;font-size:12px;font-weight:bold;cursor:not-allowed;min-width:80px",
  ].join(";"),
  btnDanger: [
    "display:block;width:calc(100% - 32px);margin:12px 16px;padding:10px 12px",
    "background:#5a1010;border:2px solid #c04040;color:#FF8080",
    "font-size:12px;cursor:pointer;text-align:center;font-weight:bold",
  ].join(";"),
  closeBtn: [
    "background:none;border:none;color:#9b7e57;font-size:20px",
    "cursor:pointer;line-height:1;padding:0",
  ].join(";"),
};

export interface BenchData {
  type: string;
  owner: string;
  ownerColor: string;
  isOwner: boolean;
  stone: number;
  coins: number;
  machado: number;
}

export interface BenchCallbacks {
  onCraft(id: string): void;
  onPickup(): void;
  onClose(): void;
}

interface Recipe {
  id: string;
  name: string;
  icon: string;
  desc: string;
  stoneCost: number;
  coinCost: number;
}

const RECIPES: Recipe[] = [
  { id: "machado", name: "Machado de Pedra", icon: "🪓", desc: "Necessário para cortar árvores", stoneCost: 5, coinCost: 50 },
];

export class BenchHubPanel {
  private _isOpen = false;
  private cb: BenchCallbacks;

  constructor(cb: BenchCallbacks) {
    this.cb = cb;
  }

  open(data: BenchData): void {
    this._isOpen = true;
    document.getElementById("_bench_panel")?.remove();
    document.body.appendChild(this._build(data));
  }

  refresh(data: BenchData): void {
    if (!this._isOpen) return;
    this.open(data);
  }

  close(): void {
    this._isOpen = false;
    document.getElementById("_bench_panel")?.remove();
  }

  get isOpen(): boolean { return this._isOpen; }

  private _build(data: BenchData): HTMLElement {
    const ov = document.createElement("div");
    ov.id = "_bench_panel";
    ov.style.cssText = S.overlay;

    const isComm = data.type === "bancada_comunitaria";
    const title = isComm ? "🏗️ Bancada Comunitária" : "🔨 Bancada Individual";

    ov.innerHTML = `
<div style="${S.panel}">
  <!-- Header -->
  <div style="${S.header}">
    <div>
      <div style="color:#FFD700;font-size:15px;font-weight:bold;letter-spacing:1px">${title}</div>
      <div style="font-size:11px;color:${data.ownerColor};margin-top:2px">de ${data.owner}</div>
    </div>
    <button id="_bench_close" style="${S.closeBtn}">✕</button>
  </div>

  <!-- Receitas -->
  <div style="${S.section}">
    <div style="font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Receitas</div>
    <div id="_bench_recipes"></div>
  </div>

  <!-- Recolher -->
  ${data.isOwner ? `<button id="_bench_pickup" style="${S.btnDanger}">📦 Recolher bancada</button>` : ""}
</div>`;

    const recipesDiv = ov.querySelector("#_bench_recipes") as HTMLElement;
    for (const recipe of RECIPES) {
      const alreadyHas = recipe.id === "machado" && data.machado > 0;
      const stoneOk = data.stone >= recipe.stoneCost;
      const coinsOk = data.coins >= recipe.coinCost;
      const canCraft = stoneOk && coinsOk && !alreadyHas;

      const card = document.createElement("div");
      card.style.cssText = S.recipeCard;
      card.innerHTML = `
<span style="font-size:26px;flex-shrink:0">${recipe.icon}</span>
<div style="flex:1">
  <div style="font-weight:bold;font-size:13px;color:#FFE0A0;margin-bottom:2px">${recipe.name}</div>
  <div style="font-size:10px;color:#9b7e57;margin-bottom:6px">${recipe.desc}</div>
  <div style="display:flex;gap:12px;font-size:11px">
    <span style="color:${stoneOk ? "#90ee90" : "#ff8888"}">🪨 ${data.stone}/${recipe.stoneCost}</span>
    <span style="color:${coinsOk ? "#90ee90" : "#ff8888"}">💰 ${data.coins}/${recipe.coinCost}</span>
  </div>
</div>
${alreadyHas
  ? `<button disabled style="${S.btnDisabled}">✓ Tem</button>`
  : `<button id="_bench_craft_${recipe.id}" style="${canCraft ? S.btn : S.btnDisabled}" ${!canCraft ? "disabled" : ""}>${canCraft ? "✦ Criar" : "🔒 Criar"}</button>`
}`;
      recipesDiv.appendChild(card);

      if (!alreadyHas && canCraft) {
        card.querySelector(`#_bench_craft_${recipe.id}`)!
          .addEventListener("click", () => { this.cb.onCraft(recipe.id); });
      }
    }

    ov.querySelector("#_bench_close")!.addEventListener("click", () => {
      this.cb.onClose();
    });
    ov.addEventListener("click", (e) => {
      if (e.target === ov) this.cb.onClose();
    });

    if (data.isOwner) {
      ov.querySelector("#_bench_pickup")?.addEventListener("click", () => {
        this.cb.onPickup();
      });
    }

    return ov;
  }

  destroy(): void {
    this.close();
  }
}
