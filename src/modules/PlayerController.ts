import { MAP_COLS, MAP_ROWS, PLAYER_SPEED, CAPTURE_DIST } from "../constants";
import { sprites } from "../sprites";

export class PlayerController {
  public col: number;
  public row: number;
  public dirCol: number;
  public dirRow: number;
  public moving: boolean;
  
  private keys = new Set<string>();
  private joystickActive = false;
  private joystickDx = 0;
  private joystickDy = 0;
  private joystickStartX = 0;
  private joystickStartY = 0;
  private joystickTouchId = -1;

  constructor(private game: any) {
    this.col = 12;
    this.row = 12;
    this.dirCol = 1;
    this.dirRow = 0;
    this.moving = false;
  }

  get effectiveSpeed() {
    return PLAYER_SPEED * (1 + ((this.game.inventory?.items?.get("esporas") ?? 0) * 0.05));
  }

  get effectiveHerdCapacity() {
    if ((this.game.inventory?.items?.get("corda_aco") ?? 0) >= 1) return 5;
    return 1 + (this.game.inventory?.items?.get("lasso_extra") ?? 0);
  }

  getSpriteDir(dc = this.dirCol, dr = this.dirRow): string {
    if (dc > 0 && dr < 0) return "north-east";
    if (dc > 0 && dr === 0) return "east";
    if (dc > 0 && dr > 0) return "south-east";
    if (dc === 0 && dr > 0) return "south";
    if (dc < 0 && dr > 0) return "south-west";
    if (dc < 0 && dr === 0) return "west";
    if (dc < 0 && dr < 0) return "north-west";
    if (dc === 0 && dr < 0) return "north";
    return "north";
  }

  update(dt: number) {
    if (this.game.combat.lasso.active || this.game.combat.stake.phase === "pulling" || this.game.resources.chop.active) {
      return;
    }

    let dc = 0, dr = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) { dc--; dr--; }
    if (this.keys.has("s") || this.keys.has("arrowdown")) { dc++; dr++; }
    if (this.keys.has("a") || this.keys.has("arrowleft")) { dc--; dr++; }
    if (this.keys.has("d") || this.keys.has("arrowright")) { dc++; dr--; }

    if (this.joystickActive) {
      dc += this.joystickDx + this.joystickDy;
      dr += -this.joystickDx + this.joystickDy;
    }

    const len = Math.hypot(dc, dr);
    if (len > 0) {
      dc /= len;
      dr /= len;
      const nc = Math.max(0.5, Math.min(MAP_COLS - 1.5, this.col + dc * this.effectiveSpeed * dt));
      const nr = Math.max(0.5, Math.min(MAP_ROWS - 1.5, this.row + dr * this.effectiveSpeed * dt));
      const tc = this.game.map[Math.floor(nr)]![Math.floor(nc)]!;
      if (!tc.obstacle) {
        this.col = nc;
        this.row = nr;
      }
      if (dc !== 0) this.dirCol = dc > 0 ? 1 : -1;
      if (dr !== 0) this.dirRow = dr > 0 ? 1 : -1;
      this.moving = true;
    } else {
      this.moving = false;
    }

    this.game.combat.updateHerd?.(dt);
  }

  onKeyDown(key: string) {
    this.keys.add(key.toLowerCase());
  }

  onKeyUp(key: string) {
    this.keys.delete(key.toLowerCase());
  }

  onJoystickStart(touchId: number, x: number, y: number) {
    this.joystickActive = true;
    this.joystickTouchId = touchId;
    this.joystickStartX = x;
    this.joystickStartY = y;
  }

  onJoystickMove(touchId: number, x: number, y: number) {
    if (!this.joystickActive || touchId !== this.joystickTouchId) return;
    const maxR = 50;
    const dx = x - this.joystickStartX;
    const dy = y - this.joystickStartY;
    const d = Math.hypot(dx, dy);
    const f = Math.min(d, maxR) / maxR;
    this.joystickDx = (d > 0 ? dx / d : 0) * f;
    this.joystickDy = (d > 0 ? dy / d : 0) * f;
  }

  onJoystickEnd(touchId: number) {
    if (touchId === this.joystickTouchId) {
      this.joystickActive = false;
      this.joystickDx = 0;
      this.joystickDy = 0;
    }
  }

  draw(game: any) {
    const { ctx } = game;
    const { x, y } = game.isoToScreen(this.col, this.row);

    if (this.game.inventory.leiteTimer > 0) {
      const pulse = 0.65 + 0.35 * Math.sin(game.gameTime * 3.5);
      const alpha = Math.min(1, this.game.inventory.leiteTimer / 5) * pulse;
      const grad = ctx.createRadialGradient(x, y - 16, 8, x, y - 16, 72);
      grad.addColorStop(0, `rgba(180,255,120,${alpha * 0.8})`);
      grad.addColorStop(0.45, `rgba(100,220,60,${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(60,180,20,0)`);
      ctx.beginPath();
      ctx.ellipse(x, y - 16, 72, 72, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const SW = 64, SH = 64;
    const dir = this.getSpriteDir();
    let spritePath: string;
    if (this.moving) {
      const frame = Math.floor(game.gameTime * 8) % 4;
      spritePath = `player/run/${dir}/frame_00${frame}.png`;
    } else {
      spritePath = `player/idle/${dir}.png`;
    }

    const img = sprites.get(spritePath);
    if (img) {
      ctx.drawImage(img, x - SW / 2, y - SH + 12, SW, SH);
    } else {
      ctx.fillStyle = this.game.myColor ?? "#3a5a9f";
      ctx.fillRect(x - 9, y - 26, 18, 20);
      ctx.fillStyle = "#f4c28a";
      ctx.fillRect(x - 7, y - 38, 14, 14);
      ctx.fillStyle = "#5c3010";
      ctx.fillRect(x - 10, y - 54, 20, 18);
      ctx.fillStyle = "#3a1a00";
      ctx.fillRect(x - 12, y - 38, 24, 4);
    }
  }
}
