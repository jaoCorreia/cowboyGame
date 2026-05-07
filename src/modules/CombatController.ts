import {
  TILE_W, TILE_H, BASE_COL, BASE_ROW, BASE_SIZE, BASE_SLOT_COLS, BASE_SLOT_GAP,
  COW_COUNT, LASSO_TIME_LIMIT, LASSO_THROW_DURATION,
  STAKE_RANGE, STAKE_FLY_SPEED, STAKE_PULL_SPEED, COW_SELL_PRICES, MAP_COLS, MAP_ROWS
} from "../constants";
import { type Tile, isObstacle } from "../mapGen";
import { type CowType, randomCowType } from "../cowTypes";
import { type Entity } from "../ecs/World";
import { Position as EcsPosition, CowAI, CowTypeComp } from "../components";
import { saveGameState } from "../auth";

type CowState = "wandering" | "fleeing" | "lassoed" | "captured" | "based" | "stolen";

interface Cow {
  id: number;
  col: number;
  row: number;
  state: CowState;
  type: CowType;
  wanderTimer: number;
  wanderDirCol: number;
  wanderDirRow: number;
  herdIndex: number;
  sparkTimer: number;
}

interface Lasso {
  active: boolean;
  cowEntity: Entity | null;
  phase: "throwing" | "pulling" | "fail";
  throwT: number;
  clickCount: number;
  timeLeft: number;
  flashTimer: number;
}

type StakePhase = "idle" | "aiming" | "flying" | "anchored" | "pulling";
interface StakeData {
  phase: StakePhase;
  targetCol: number;
  targetRow: number;
  flyCol: number;
  flyRow: number;
  pullStartCol: number;
  pullStartRow: number;
  pullT: number;
  pullDist: number;
}

export function basedSlotPos(slot: number) {
  return {
    col: BASE_COL + 0.5 + (slot % BASE_SLOT_COLS) * BASE_SLOT_GAP,
    row: BASE_ROW + 0.5 + Math.floor(slot / BASE_SLOT_COLS) * BASE_SLOT_GAP,
  };
}

function dist(a: { col: number; row: number }, b: { col: number; row: number }) {
  return Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2);
}

export class CombatController {
  public lasso: Lasso;
  public stake: StakeData;
  private saveTimer = 60;

  constructor(private game: any) {
    this.lasso = {
      active: false,
      cowEntity: null,
      phase: "throwing",
      throwT: 0,
      clickCount: 0,
      timeLeft: 0,
      flashTimer: 0,
    };
    this.stake = {
      phase: "idle",
      targetCol: 0,
      targetRow: 0,
      flyCol: 0,
      flyRow: 0,
      pullStartCol: 0,
      pullStartRow: 0,
      pullT: 0,
      pullDist: 1,
    };
  }

  spawnCowRaw(id: number, map: Tile[][], nightMode = false): Cow {
    const minC = BASE_COL + BASE_SIZE + 4;
    let col: number, row: number;
    let tries = 0;
    do {
      col = minC + Math.random() * (MAP_COLS - minC - 4);
      row = minC + Math.random() * (MAP_ROWS - minC - 4);
      tries++;
    } while (tries < 30 && isObstacle(map[Math.floor(row)]![Math.floor(col)]!));
    return {
      id,
      col,
      row,
      state: "wandering",
      type: randomCowType(nightMode),
      wanderTimer: Math.random() * 3,
      wanderDirCol: 0,
      wanderDirRow: 0,
      herdIndex: -1,
      sparkTimer: 0,
    };
  }

  update(dt: number) {
    this.updateStake(dt);
    this.updateCows(dt);
    if (this.lasso.active) {
      this.updateLasso(dt);
    }

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 60;
      this.triggerSave();
    }
  }

  private updateStake(dt: number) {
    const s = this.stake;
    if (s.phase === "flying") {
      const dc = s.targetCol - s.flyCol, dr = s.targetRow - s.flyRow;
      const d = Math.hypot(dc, dr);
      const step = STAKE_FLY_SPEED * dt;
      if (d <= step) {
        s.flyCol = s.targetCol;
        s.flyRow = s.targetRow;
        s.pullStartCol = this.game.player.col;
        s.pullStartRow = this.game.player.row;
        s.pullDist = Math.max(0.1, dist(this.game.player, { col: s.targetCol, row: s.targetRow }));
        s.pullT = 0;
        s.phase = "pulling";
      } else {
        s.flyCol += (dc / d) * step;
        s.flyRow += (dr / d) * step;
      }
    }
  }

  private updateCows(dt: number) {
    this.game.cowAISystemRef?.update(this.game.worldState, dt, {
      map: this.game.map,
      playerCol: this.game.player.col,
      playerRow: this.game.player.row,
      lassoActive: this.lasso.active,
      lassoTargetEntity: this.lasso.cowEntity ?? null,
      herdCapacity: this.game.player.effectiveHerdCapacity,
      isNight: this.game.timeManager.isNight,
    });
  }

  private updateLasso(dt: number) {
    const l = this.lasso;
    if (l.cowEntity === null || !this.game.worldState.isAlive(l.cowEntity)) {
      l.active = false;
      return;
    }
    if (l.flashTimer > 0) l.flashTimer -= dt;

    if (l.phase === "throwing") {
      l.throwT += dt / LASSO_THROW_DURATION;
      if (l.throwT >= 1) {
        l.throwT = 1;
        l.phase = "pulling";
        l.timeLeft = LASSO_TIME_LIMIT;
        l.clickCount = 0;
      }
      return;
    }

    if (l.phase === "pulling") {
      l.timeLeft -= dt;
      const clicksNeeded = this.game.worldState.must(l.cowEntity, CowTypeComp).cowType.clicksNeeded;
      const effectiveClicks = this.effectiveLassoClicks(clicksNeeded);
      if (l.clickCount >= effectiveClicks) {
        this.captureCow(l.cowEntity);
        l.active = false;
        return;
      }
      if (l.timeLeft <= 0) {
        if (this.game.admin?.godMode) {
          this.captureCow(l.cowEntity);
          l.active = false;
        } else {
          l.phase = "fail";
          this.game.worldState.must(l.cowEntity, CowAI).state = "fleeing";
          setTimeout(() => { this.lasso.active = false; }, 700);
        }
      }
    }
  }

  effectiveLassoClicks(base: number) {
    return Math.max(1, base - (this.game.inventory.items.get("lasso_forte") ?? 0) * 3);
  }

  captureCow(entity: Entity) {
    const herdLen = this.herdCows().length;
    const pos = this.game.worldState.must(entity, EcsPosition);
    const ai = this.game.worldState.must(entity, CowAI);
    const tc = this.game.worldState.must(entity, CowTypeComp);
    ai.state = "herd";
    ai.herdIndex = herdLen;
    pos.col = this.game.player.col;
    pos.row = this.game.player.row;
    ai.sparkTimer = 1.5;
    this.game.discovered.add(tc.cowType.id);
    this.game.capturedByType.set(tc.cowType.id, (this.game.capturedByType.get(tc.cowType.id) ?? 0) + 1);
  }

  startLasso(entity: Entity) {
    const ai = this.game.worldState.must(entity, CowAI);
    const tc = this.game.worldState.must(entity, CowTypeComp);
    ai.state = "lassoed" as any;
    this.game.discovered.add(tc.cowType.id);
    this.lasso = {
      active: true,
      cowEntity: entity,
      phase: "throwing",
      throwT: 0,
      clickCount: 0,
      timeLeft: 0,
      flashTimer: 0,
    };
  }

  herdCows(): any[] {
    return this.game.worldState
      .query(EcsPosition, CowAI)
      .filter(([, , ai]: [any, any, CowAI]) => ai.state === "herd")
      .sort((a: any, b: any) => a[2].herdIndex - b[2].herdIndex)
      .map(([e]: [Entity]) => this.game.cowCompat(e));
  }

  basedCows(): any[] {
    return this.game.worldState
      .query(EcsPosition, CowAI)
      .filter(([, , ai]: [any, any, CowAI]) => ai.state === "based")
      .map(([e]: [Entity]) => this.game.cowCompat(e));
  }

  depositCows() {
    const herd = this.herdCows();
    const startIdx = this.game.basedCount;
    this.game.basedCount += herd.length;
    for (let i = 0; i < herd.length; i++) {
      const cow = herd[i]!;
      cow.state = "based";
      cow.herdIndex = startIdx + i;
      const slotPos = basedSlotPos(startIdx + i);
      cow.col = slotPos.col;
      cow.row = slotPos.row;
    }
    this.game.network?.sendCowBased?.(herd.map((c: any) => c.type.id));
    this.triggerSave();
  }

  isAtBase() {
    const c = Math.floor(this.game.player.col), r = Math.floor(this.game.player.row);
    return c >= BASE_COL && c < BASE_COL + BASE_SIZE && r >= BASE_ROW && r < BASE_ROW + BASE_SIZE;
  }

  sellCow(cow: any) {
    const price = COW_SELL_PRICES[cow.type.rarity] ?? 10;
    this.game.coins += price;
    this.saveCoinsLocally();
    if (cow._entity !== undefined) this.game.worldState.destroy(cow._entity);
    this.herdCows().forEach((c: any, i: number) => { c.herdIndex = i; });
    this.triggerSave();
  }

  sellAllCows() {
    const herd = this.herdCows();
    if (herd.length === 0) return;
    for (const cow of herd) {
      this.game.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
      if (cow._entity !== undefined) this.game.worldState.destroy(cow._entity);
    }
    this.saveCoinsLocally();
    this.triggerSave();
  }

  sellBasedCow(cow: any) {
    this.game.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
    this.saveCoinsLocally();
    if (cow._entity !== undefined) this.game.worldState.destroy(cow._entity);
    this.game.basedCount = Math.max(0, this.game.basedCount - 1);
    this.basedCows().sort((a: any, b: any) => a.herdIndex - b.herdIndex).forEach((c: any, i: number) => {
      c.herdIndex = i;
      const slotPos = basedSlotPos(i);
      c.col = slotPos.col;
      c.row = slotPos.row;
    });
    this.triggerSave();
  }

  sellAllBasedCows() {
    const based = this.basedCows();
    if (based.length === 0) return;
    for (const cow of based) {
      this.game.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
      if (cow._entity !== undefined) this.game.worldState.destroy(cow._entity);
    }
    this.game.basedCount = 0;
    this.saveCoinsLocally();
    this.triggerSave();
  }

  private saveCoinsLocally() {
    localStorage.setItem(`cowboy_coins_${this.game.myName}`, String(this.game.coins));
  }

  toggleStakeAim() {
    if (this.stake.phase === "flying" || this.stake.phase === "pulling" || this.stake.phase === "anchored") return;
    this.stake.phase = this.stake.phase === "aiming" ? "idle" : "aiming";
  }

  throwStakeTo(screenX: number, screenY: number) {
    const wx = screenX - this.game.camX, wy = screenY - this.game.camY;
    const targetCol = wx / TILE_W + wy / TILE_H;
    const targetRow = -wx / TILE_W + wy / TILE_H;
    const d = dist(this.game.player, { col: targetCol, row: targetRow });
    if (d > STAKE_RANGE) return;
    const tc = Math.floor(targetCol), tr = Math.floor(targetRow);
    if (tc < 0 || tc >= MAP_COLS || tr < 0 || tr >= MAP_ROWS) return;
    const tile = this.game.map[tr]?.[tc];
    if (!tile || tile.type === "water" || isObstacle(tile)) return;
    this.stake.phase = "flying";
    this.stake.targetCol = targetCol;
    this.stake.targetRow = targetRow;
    this.stake.flyCol = this.game.player.col;
    this.stake.flyRow = this.game.player.row;
  }

  private triggerSave() {
    this.game.network?.sendSave?.(
      this.game.basedCount, [...this.game.discovered], [...this.game.discoveredNPCs],
      Object.fromEntries(this.game.capturedByType),
      this.basedCows().sort((a: any, b: any) => a.herdIndex - b.herdIndex).map((c: any) => c.type.id),
      this.game.coins, Object.fromEntries(this.game.inventory.items)
    );
    saveGameState(
      this.game.myToken, this.game.basedCount, [...this.game.discovered], [...this.game.discoveredNPCs],
      Object.fromEntries(this.game.capturedByType),
      this.basedCows().map((c: any) => c.type.id),
      this.game.coins, Object.fromEntries(this.game.inventory.items)
    );
  }

  nearestWanderingCow(): Entity | null {
    return this.game.cowAISystemRef?.nearestWandering(
      this.game.worldState, this.game.player.col, this.game.player.row, this.game.player.effectiveCaptureRange
    ) ?? null;
  }
}
