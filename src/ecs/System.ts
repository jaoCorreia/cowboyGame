import type { World } from "./World";

/**
 * Base para todos os sistemas ECS.
 * Cada sistema define seu próprio contexto tipado via `ctx`.
 */
export abstract class System<TCtx = void> {
  abstract update(world: World, dt: number, ctx: TCtx): void;
}
