import { MAP_COLS, MAP_ROWS } from "../constants";

export class AdminController {
  public godMode = false;
  public forcePeriod: "manha" | "tarde" | "noite" | null = null;
  public cmdOpen = false;
  private cmdInput?: HTMLInputElement;
  private cmdResult = "";
  private cmdResultTimer = 0;

  constructor(private game: any) {}

  setupInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Comando admin... (Enter=executar, Esc=fechar, /help)";
    input.maxLength = 300;
    Object.assign(input.style, {
      position: "fixed", bottom: "10px", left: "10px", width: "calc(100% - 20px)",
      padding: "8px 12px", background: "rgba(40,3,3,0.96)", border: "2px solid #cc2222",
      borderRadius: "4px", color: "#FF9980", font: "bold 13px monospace",
      outline: "none", display: "none", zIndex: "20", boxSizing: "border-box",
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = input.value.trim();
        if (text) this.executeCmd(text);
        input.value = "";
        this.closeCmd();
      } else if (e.key === "Escape" || e.key === "`") {
        this.closeCmd();
        e.preventDefault();
      }
    });
    document.body.appendChild(input);
    this.cmdInput = input;
  }

  openCmd() {
    if (!this.cmdInput) return;
    this.cmdOpen = true;
    this.cmdInput.style.display = "block";
    this.cmdInput.value = "";
    this.cmdInput.focus();
  }

  closeCmd() {
    if (!this.cmdInput) return;
    this.cmdOpen = false;
    this.cmdInput.style.display = "none";
  }

  update(dt: number) {
    if (this.cmdResultTimer > 0) this.cmdResultTimer -= dt;
  }

  private executeCmd(raw: string) {
    const parts = raw.trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase().replace(/^\//, "");
    const ok = (msg: string) => { this.cmdResult = `✅ ${msg}`; this.cmdResultTimer = 3; };
    const err = (msg: string) => { this.cmdResult = `❌ ${msg}`; this.cmdResultTimer = 3; };

    switch (cmd) {
      case "tp": {
        const col = parseFloat(parts[1] ?? ""), row = parseFloat(parts[2] ?? "");
        if (isNaN(col) || isNaN(row)) { err("Uso: /tp <col> <row>"); return; }
        this.game.player.col = Math.max(0, Math.min(MAP_COLS - 1, col));
        this.game.player.row = Math.max(0, Math.min(MAP_ROWS - 1, row));
        ok(`Teletransportado para (${col}, ${row})`);
        break;
      }
      case "spawn": {
        const entity = this.game.spawnCowEntity(this.game.nextCowId++);
        const pos = this.game.worldState.must(entity, this.game.ecsPosition);
        pos.col = this.game.player.col + 2;
        pos.row = this.game.player.row + 2;
        ok(`Vaca spawned em (${pos.col.toFixed(1)}, ${pos.row.toFixed(1)})`);
        break;
      }
      case "godmode":
      case "god":
        this.godMode = !this.godMode;
        ok(`God mode: ${this.godMode ? "ON" : "OFF"}`);
        break;
      case "time": {
        const period = (parts[1] ?? "").toLowerCase();
        if (period === "day" || period === "manha") { this.forcePeriod = "manha"; ok("Hora: manhã"); }
        else if (period === "tarde") { this.forcePeriod = "tarde"; ok("Hora: tarde"); }
        else if (period === "night" || period === "noite") { this.forcePeriod = "noite"; ok("Hora: noite"); }
        else if (period === "auto" || period === "reset") { this.forcePeriod = null; ok("Hora: automático"); }
        else err("Uso: /time <manha|tarde|noite|auto>");
        break;
      }
      case "setcoins": {
        const amount = parseInt(parts[1] ?? "");
        if (isNaN(amount) || amount < 0) { err("Uso: /setcoins <amount>"); return; }
        this.game.coins = amount;
        ok(`Coins: ${amount}`);
        break;
      }
      case "pos":
        ok(`Posição: col=${this.game.player.col.toFixed(2)}, row=${this.game.player.row.toFixed(2)}`);
        break;
      case "help":
        ok("/tp /spawn /godmode /time /setcoins /pos");
        break;
      default:
        err(`Desconhecido: /${cmd}`);
    }
  }
}
