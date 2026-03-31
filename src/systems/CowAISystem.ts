import { System } from "../ecs/System";
import type { World, Entity } from "../ecs/World";
import { Position, CowAI, CowTypeComp, type CowSystemCtx } from "../components";
import {
  COW_WANDER_SPEED,
  COW_FLEE_SPEED,
  HERD_FOLLOW_SPEED,
  HERD_SPACING,
  MAP_COLS,
  MAP_ROWS,
} from "../constants";
import { isObstacle } from "../mapGen";

export class CowAISystem extends System<CowSystemCtx> {
  update(world: World, dt: number, ctx: CowSystemCtx): void {
    this.updateHerd(world, dt, ctx);
    this.updateWandering(world, dt, ctx);
  }

  // ── Rebanho segue o player em fila ───────────────────────────────────────

  private updateHerd(world: World, dt: number, ctx: CowSystemCtx): void {
    const herd = world
      .query(Position, CowAI)
      .filter(([, , ai]) => ai.herdIndex >= 0)
      .sort((a, b) => a[2].herdIndex - b[2].herdIndex);

    let prevCol = ctx.playerCol;
    let prevRow = ctx.playerRow;

    for (const [, pos, ai] of herd) {
      if (ai.state !== "herd") continue;
      const dc = prevCol - pos.col;
      const dr = prevRow - pos.row;
      const d = Math.hypot(dc, dr);
      if (d > HERD_SPACING) {
        const spd = Math.min(HERD_FOLLOW_SPEED, d * 6) * dt;
        pos.col += (dc / d) * spd;
        pos.row += (dr / d) * spd;
      }
      prevCol = pos.col;
      prevRow = pos.row;
    }
  }

  // ── Vagando, fugindo e medo de proximidade ───────────────────────────────

  private updateWandering(world: World, dt: number, ctx: CowSystemCtx): void {
    const entries = world.query(Position, CowAI, CowTypeComp);

    for (const [, pos, ai, typeComp] of entries) {
      if (ai.sparkTimer > 0) ai.sparkTimer -= dt;
      if (ai.state !== "wandering" && ai.state !== "fleeing") continue;

      // ── Fuga total (após lasso falho) ──────────────────────────────────
      if (ai.state === "fleeing") {
        const dc = pos.col - ctx.playerCol;
        const dr = pos.row - ctx.playerRow;
        const d = Math.hypot(dc, dr);
        if (d < 10 && d > 0) {
          const nc = pos.col + (dc / d) * COW_FLEE_SPEED * dt;
          const nr = pos.row + (dr / d) * COW_FLEE_SPEED * dt;
          const tile = ctx.map[Math.floor(nr)]?.[Math.floor(nc)];
          if (tile && !isObstacle(tile)) {
            pos.col = Math.max(1, Math.min(MAP_COLS - 2, nc));
            pos.row = Math.max(1, Math.min(MAP_ROWS - 2, nr));
          }
        } else {
          ai.state = "wandering";
          ai.wanderTimer = 1;
        }
        continue;
      }

      // ── Medo de proximidade ────────────────────────────────────────────
      const cowType = typeComp.cowType;
      if (cowType.fearDistance > 0) {
        const pd = Math.hypot(pos.col - ctx.playerCol, pos.row - ctx.playerRow);
        if (pd < cowType.fearDistance && pd > 0.5) {
          const dc = pos.col - ctx.playerCol;
          const dr = pos.row - ctx.playerRow;
          const len = Math.hypot(dc, dr);
          const intensity = 1 - pd / cowType.fearDistance;
          const speed = cowType.fearSpeed * intensity;
          const nc = pos.col + (dc / len) * speed * dt;
          const nr = pos.row + (dr / len) * speed * dt;
          const tile = ctx.map[Math.floor(nr)]?.[Math.floor(nc)];
          if (tile && !isObstacle(tile)) {
            pos.col = Math.max(1, Math.min(MAP_COLS - 2, nc));
            pos.row = Math.max(1, Math.min(MAP_ROWS - 2, nr));
          } else {
            // Tenta deslizar pelo obstáculo
            const ncX = pos.col + (dc / len) * speed * dt;
            const tileX = ctx.map[Math.floor(pos.row)]?.[Math.floor(ncX)];
            if (tileX && !isObstacle(tileX))
              pos.col = Math.max(1, Math.min(MAP_COLS - 2, ncX));
            const nrY = pos.row + (dr / len) * speed * dt;
            const tileY = ctx.map[Math.floor(nrY)]?.[Math.floor(pos.col)];
            if (tileY && !isObstacle(tileY))
              pos.row = Math.max(1, Math.min(MAP_ROWS - 2, nrY));
          }
          continue;
        }
      }

      // ── Wander normal ──────────────────────────────────────────────────
      ai.wanderTimer -= dt;
      if (ai.wanderTimer <= 0) {
        const a = Math.random() * Math.PI * 2;
        ai.wanderDirCol = Math.cos(a);
        ai.wanderDirRow = Math.sin(a);
        ai.wanderTimer = 2 + Math.random() * 3;
      }
      const nc = pos.col + ai.wanderDirCol * COW_WANDER_SPEED * dt;
      const nr = pos.row + ai.wanderDirRow * COW_WANDER_SPEED * dt;
      const tile = ctx.map[Math.floor(nr)]?.[Math.floor(nc)];
      if (tile && !isObstacle(tile)) {
        pos.col = Math.max(1, Math.min(MAP_COLS - 2, nc));
        pos.row = Math.max(1, Math.min(MAP_ROWS - 2, nr));
      } else {
        ai.wanderTimer = 0;
      }
    }
  }

  // ── Helpers públicos usados pelo Game ────────────────────────────────────

  static herdEntities(world: World): Entity[] {
    return world
      .query(Position, CowAI)
      .filter(([, , ai]) => ai.state === "herd")
      .map(([e]) => e)
      .sort((a, b) => {
        const aiA = world.must(a, CowAI);
        const aiB = world.must(b, CowAI);
        return aiA.herdIndex - aiB.herdIndex;
      });
  }

  static wanderingEntities(world: World): Entity[] {
    return world
      .query(CowAI)
      .filter(([, ai]) => ai.state === "wandering")
      .map(([e]) => e);
  }

  /** Retorna a vaca vagante mais próxima de (col, row), ou null */
  static nearestWandering(
    world: World,
    col: number,
    row: number,
    maxDist: number,
  ): Entity | null {
    let best: Entity | null = null;
    let bestDist = maxDist;
    for (const [e, ai] of world.query(CowAI)) {
      if (ai.state !== "wandering") continue;
      const pos = world.get(e, Position)!;
      const d = Math.hypot(pos.col - col, pos.row - row);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }
}
