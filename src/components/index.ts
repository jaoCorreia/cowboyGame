import type { CowType } from "../cowTypes";
import type { Tile } from "../mapGen";
import type { Entity } from "../ecs/World";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────

export type CowState = "wandering" | "fleeing" | "herd" | "based";
export type BanditState = "approaching" | "fleeing" | "scared";

// ─────────────────────────────────────────────────────────────────────────────
// Componentes compartilhados
// ─────────────────────────────────────────────────────────────────────────────

/** Posição no mundo isométrico */
export class Position {
  constructor(public col: number, public row: number) {}
}

/** Identidade numérica legada (preserva o id original para referências externas) */
export class LegacyId {
  constructor(public id: number) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Vaca
// ─────────────────────────────────────────────────────────────────────────────

export class CowAI {
  state: CowState = "wandering";
  wanderTimer = 0;
  wanderDirCol = 0;
  wanderDirRow = 0;
  herdIndex = -1;       // -1 = não está no rebanho
  sparkTimer = 0;       // efeito visual para vacas lendárias
}

export class CowTypeComp {
  constructor(public cowType: CowType) {}
}

/** Tag: vaca está depositada na base */
export class BasedTag {}

// ─────────────────────────────────────────────────────────────────────────────
// Bandido
// ─────────────────────────────────────────────────────────────────────────────

export class BanditAI {
  state: BanditState = "approaching";
  fleeCol = 0;
  fleeRow = 0;
  targetCowEntity: Entity | null = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contextos de sistema (shared read-only state passado para os Systems)
// ─────────────────────────────────────────────────────────────────────────────

export interface CowSystemCtx {
  map: Tile[][];
  playerCol: number;
  playerRow: number;
  lassoActive: boolean;
  lassoTargetEntity: Entity | null;
  herdCapacity: number;
  isNight: boolean;
}

export interface BanditSystemCtx {
  map: Tile[][];
  playerCol: number;
  playerRow: number;
  activePeriods: ReadonlyArray<"manha" | "tarde" | "noite">;
  currentPeriod: "manha" | "tarde" | "noite";
  onStealCow: (cowEntity: Entity) => void;
}
