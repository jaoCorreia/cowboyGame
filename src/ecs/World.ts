export type Entity = number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor<T = unknown> = new (...args: any[]) => T;

export class World {
  private nextId = 0;
  private alive = new Set<Entity>();
  private store = new Map<Ctor, Map<Entity, unknown>>();

  // ── Ciclo de vida ──────────────────────────────────────────────────────

  create(): Entity {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  destroy(entity: Entity): this {
    this.alive.delete(entity);
    for (const map of this.store.values()) map.delete(entity);
    return this;
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  // ── Componentes ────────────────────────────────────────────────────────

  add<T extends object>(entity: Entity, component: T): this {
    const ctor = component.constructor as Ctor<T>;
    let map = this.store.get(ctor);
    if (!map) { map = new Map(); this.store.set(ctor, map); }
    map.set(entity, component);
    return this;
  }

  get<T>(entity: Entity, ctor: Ctor<T>): T | undefined {
    return this.store.get(ctor)?.get(entity) as T | undefined;
  }

  /** Lança se o componente não existir — use quando tem certeza que existe */
  must<T>(entity: Entity, ctor: Ctor<T>): T {
    const c = this.store.get(ctor)?.get(entity) as T | undefined;
    if (c === undefined) throw new Error(`Entity ${entity} missing ${ctor.name}`);
    return c;
  }

  has(entity: Entity, ctor: Ctor): boolean {
    return this.store.get(ctor)?.has(entity) ?? false;
  }

  remove(entity: Entity, ctor: Ctor): this {
    this.store.get(ctor)?.delete(entity);
    return this;
  }

  // ── Queries (overloads para type safety) ──────────────────────────────

  query<A>(a: Ctor<A>): Array<[Entity, A]>;
  query<A, B>(a: Ctor<A>, b: Ctor<B>): Array<[Entity, A, B]>;
  query<A, B, C>(a: Ctor<A>, b: Ctor<B>, c: Ctor<C>): Array<[Entity, A, B, C]>;
  query<A, B, C, D>(a: Ctor<A>, b: Ctor<B>, c: Ctor<C>, d: Ctor<D>): Array<[Entity, A, B, C, D]>;
  query(...ctors: Ctor[]): Array<unknown[]> {
    const [first, ...rest] = ctors;
    if (!first) return [];
    const primary = this.store.get(first);
    if (!primary) return [];
    const result: unknown[][] = [];
    for (const [entity, a] of primary) {
      if (!this.alive.has(entity)) continue;
      const others = rest.map(c => this.store.get(c)?.get(entity));
      if (others.some(x => x === undefined)) continue;
      result.push([entity, a, ...others]);
    }
    return result;
  }

  /** Todas as entidades vivas */
  entities(): ReadonlySet<Entity> {
    return this.alive;
  }
}
