import { TREE_CHOP_DIST, STONE_HARVEST_DIST, STONE_DROP_MIN, STONE_DROP_MAX, WOOD_DROP_MIN, WOOD_DROP_MAX, WOOD_MAX_STACK, STONE_MAX_STACK, CHOP_CLICKS_NEEDED, CHOP_TIME_LIMIT } from "../constants";

interface ChopData {
  active: boolean;
  col: number;
  row: number;
  clickCount: number;
  timeLeft: number;
  flashTimer: number;
}

export class ResourceController {
  public chop: ChopData = { active: false, col: 0, row: 0, clickCount: 0, timeLeft: 0, flashTimer: 0 };
  public chopFlash = 0;

  constructor(private game: any) {}

  update(dt: number) {
    if (!this.chop.active) return;
    this.chop.timeLeft -= dt;
    if (this.chop.flashTimer > 0) this.chop.flashTimer -= dt;

    if (this.chop.clickCount >= CHOP_CLICKS_NEEDED) {
      const drop = WOOD_DROP_MIN + Math.floor(Math.random() * (WOOD_DROP_MAX - WOOD_DROP_MIN + 1));
      this.game.inventory.addResource("wood", drop, WOOD_MAX_STACK);
      const { col, row } = this.chop;
      this.game.map[row]![col]!.decoration = "none";
      this.game.choppedTrees.set(`${col},${row}`, 0);
      this.chopFlash = 0.3;
      this.chop.active = false;
      this.game.network?.sendTreeChop?.(col, row);
    } else if (this.chop.timeLeft <= 0) {
      this.chop.active = false;
    }
  }

  startChop(col: number, row: number) {
    this.chop = { active: true, col, row, clickCount: 0, timeLeft: CHOP_TIME_LIMIT, flashTimer: 0 };
  }

  startHarvest(col: number, row: number) {
    const drop = STONE_DROP_MIN + Math.floor(Math.random() * (STONE_DROP_MAX - STONE_DROP_MIN + 1));
    this.game.inventory.addResource("stone", drop, STONE_MAX_STACK);
    this.chopFlash = 0.2;
  }

  hasMachado(): boolean {
    return (this.game.inventory.items.get("machado") ?? 0) > 0;
  }

  nearestChoppableTree(): { col: number; row: number } | null {
    const pc = this.game.player.col, pr = this.game.player.row;
    const r = Math.ceil(TREE_CHOP_DIST) + 1;
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const c = Math.floor(pc) + dc, ro = Math.floor(pr) + dr;
        if (c < 0 || ro < 0 || c >= 50 || ro >= 50) continue;
        if (this.game.map[ro]?.[c]?.decoration !== "tree") continue;
        const d = Math.hypot(pc - c, pr - ro);
        if (d <= TREE_CHOP_DIST && d < bestDist) {
          bestDist = d;
          best = { col: c, row: ro };
        }
      }
    }
    return best;
  }

  nearestBoulder(): { col: number; row: number } | null {
    const pc = this.game.player.col, pr = this.game.player.row;
    const r = Math.ceil(STONE_HARVEST_DIST) + 1;
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const c = Math.floor(pc) + dc, ro = Math.floor(pr) + dr;
        if (c < 0 || ro < 0 || c >= 50 || ro >= 50) continue;
        if (this.game.map[ro]?.[c]?.decoration !== "boulder") continue;
        const d = Math.hypot(pc - c, pr - ro);
        if (d <= STONE_HARVEST_DIST && d < bestDist) {
          bestDist = d;
          best = { col: c, row: ro };
        }
      }
    }
    return best;
  }
}
