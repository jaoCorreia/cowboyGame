import { System } from "../ecs/System";
import type { World, Entity } from "../ecs/World";
import { Position, BanditAI, CowAI, type BanditSystemCtx } from "../components";
import { MAP_COLS, MAP_ROWS } from "../constants";

// Velocidades dos bandidos (eram constantes locais no game.ts)
const BANDIT_APPROACH_SPEED = 1.8;
const BANDIT_FLEE_SPEED = 3.2;
const BANDIT_SCARED_SPEED = 4.0;
const MAX_BANDITS = 3;
const SPAWN_INTERVAL_MIN = 120;
const SPAWN_INTERVAL_RANGE = 60;

export class BanditAISystem extends System<BanditSystemCtx> {
  private spawnTimer = 60;

  update(world: World, dt: number, ctx: BanditSystemCtx): void {
    const { activePeriods, currentPeriod } = ctx;
    const inActivePeriod = activePeriods.includes(currentPeriod);
    const bandits = world.query(Position, BanditAI);

    // ── Proximidade: player perto de bandido em fuga → assustar ───────────
    for (const [, pos, ai] of bandits) {
      if (ai.state !== "fleeing") continue;
      const d = Math.hypot(pos.col - ctx.playerCol, pos.row - ctx.playerRow);
      if (d <= 2.5) {
        if (ai.targetCowEntity !== null) {
          const cowAI = world.get(ai.targetCowEntity, CowAI);
          if (cowAI) cowAI.state = "wandering";
          ai.targetCowEntity = null;
        }
        ai.state = "scared";
        pos.col > MAP_COLS / 2
          ? (ai.fleeCol = 1)
          : (ai.fleeCol = MAP_COLS - 2);
        pos.row > MAP_ROWS / 2
          ? (ai.fleeRow = 1)
          : (ai.fleeRow = MAP_ROWS - 2);
      }
    }

    // ── Atualizar cada bandido ─────────────────────────────────────────────
    const toDestroy: Entity[] = [];

    for (const [entity, pos, ai] of world.query(Position, BanditAI)) {
      if (ai.state === "approaching") {
        const target = ai.targetCowEntity;
        const cowAI = target !== null ? world.get(target, CowAI) : null;
        const cowPos = target !== null ? world.get(target, Position) : null;

        // Alvo inválido → assustar
        if (
          !cowAI ||
          !cowPos ||
          (cowAI.state !== "wandering" &&
            cowAI.state !== "fleeing" &&
            cowAI.state !== "based")
        ) {
          ai.state = "scared";
          ai.targetCowEntity = null;
          ai.fleeCol = pos.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
          ai.fleeRow = pos.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;
        } else {
          const dx = cowPos.col - pos.col;
          const dy = cowPos.row - pos.row;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1.2) {
            // Rouba a vaca
            cowAI.state = "stolen" as never;
            ai.state = "fleeing";
            ai.fleeCol = pos.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
            ai.fleeRow = pos.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;
            ctx.onStealCow(target!);
          } else {
            pos.col += (dx / d) * BANDIT_APPROACH_SPEED * dt;
            pos.row += (dy / d) * BANDIT_APPROACH_SPEED * dt;
          }
        }
      } else if (ai.state === "fleeing") {
        const dx = ai.fleeCol - pos.col;
        const dy = ai.fleeRow - pos.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) {
          // Escapou — destrói o bandido (e a vaca roubada é destruída no Game)
          toDestroy.push(entity);
          continue;
        }
        const spd = BANDIT_FLEE_SPEED * dt;
        pos.col += (dx / d) * spd;
        pos.row += (dy / d) * spd;
        // Arrasta a vaca junto
        if (ai.targetCowEntity !== null) {
          const cowPos = world.get(ai.targetCowEntity, Position);
          if (cowPos) { cowPos.col = pos.col; cowPos.row = pos.row; }
        }
      } else if (ai.state === "scared") {
        const dx = ai.fleeCol - pos.col;
        const dy = ai.fleeRow - pos.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) {
          toDestroy.push(entity);
          continue;
        }
        pos.col += (dx / d) * BANDIT_SCARED_SPEED * dt;
        pos.row += (dy / d) * BANDIT_SCARED_SPEED * dt;
      }
    }

    for (const e of toDestroy) world.destroy(e);

    // ── Spawn timer ────────────────────────────────────────────────────────
    if (inActivePeriod && world.query(BanditAI).length < MAX_BANDITS) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer =
          SPAWN_INTERVAL_MIN + Math.random() * SPAWN_INTERVAL_RANGE;
        // O spawn em si fica no Game (precisa de nextBanditId e map)
        ctx.onStealCow(-1 as Entity); // sinal para o Game fazer o spawn
      }
    }
  }

  resetSpawnTimer(value = 60): void {
    this.spawnTimer = value;
  }
}
