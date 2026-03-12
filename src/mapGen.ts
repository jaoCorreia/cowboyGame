import {
  MAP_COLS,
  MAP_ROWS,
  BASE_COL,
  BASE_ROW,
  BASE_SIZE,
  MAP_SEED,
} from "./constants";

export type TileType =
  | "grass"
  | "dry_grass"
  | "dirt"
  | "sand"
  | "rock"
  | "water"
  | "base";

export interface Tile {
  type: TileType;
  decoration: "none" | "tree" | "boulder" | "flower" | "cactus" | "bush";
}

// ─── Noise ───────────────────────────────────────────────────────────────────

function hash(x: number, y: number, seed: number): number {
  let h = (seed ^ (x * 0x9e3779b9) ^ (y * 0x6c62272e)) >>> 0;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h >>> 0) / 0xffffffff;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = smoothstep(x - xi),
    yf = smoothstep(y - yi);
  return lerp(
    lerp(hash(xi, yi, seed), hash(xi + 1, yi, seed), xf),
    lerp(hash(xi, yi + 1, seed), hash(xi + 1, yi + 1, seed), xf),
    yf,
  );
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let v = 0,
    a = 0.5,
    f = 1,
    max = 0;
  for (let i = 0; i < octaves; i++) {
    v += vnoise(x * f, y * f, seed + i * 997) * a;
    max += a;
    a *= 0.5;
    f *= 2.1;
  }
  return v / max;
}

// Simple seeded PRNG (xorshift) for river generation
function makeRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAYER_START_COL = 12;
const PLAYER_START_ROW = 12;

function isInBase(c: number, r: number): boolean {
  return (
    c >= BASE_COL &&
    c < BASE_COL + BASE_SIZE &&
    r >= BASE_ROW &&
    r < BASE_ROW + BASE_SIZE
  );
}

function isNearBase(c: number, r: number, margin = 2): boolean {
  return (
    c >= BASE_COL - margin &&
    c < BASE_COL + BASE_SIZE + margin &&
    r >= BASE_ROW - margin &&
    r < BASE_ROW + BASE_SIZE + margin
  );
}

function isProtectedZone(c: number, r: number): boolean {
  // Keep base area and player start area clear of rivers
  if (isNearBase(c, r, 5)) return true;
  if (Math.hypot(c - PLAYER_START_COL, r - PLAYER_START_ROW) < 7) return true;
  return false;
}

// ─── River generation ─────────────────────────────────────────────────────────

function carveRiver(
  map: Tile[][],
  rng: () => number,
  startCol: number,
  startRow: number,
  startAngle: number,
) {
  let col = startCol,
    row = startRow;
  let angle = startAngle;
  const RIVER_RADIUS = 2.2; // tile radius — gives ~5 tiles width
  const MAX_STEPS = (MAP_COLS + MAP_ROWS) * 2;
  const r0 = Math.ceil(RIVER_RADIUS);

  for (let s = 0; s < MAX_STEPS; s++) {
    const fc = Math.floor(col),
      fr = Math.floor(row);

    // Carve a circular cross-section of water
    for (let dr = -r0; dr <= r0; dr++) {
      for (let dc = -r0; dc <= r0; dc++) {
        if (Math.hypot(dc, dr) > RIVER_RADIUS) continue;
        const r = fr + dr,
          c = fc + dc;
        if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) continue;
        if (isProtectedZone(c, r)) continue;
        map[r]![c]!.type = "water";
        map[r]![c]!.decoration = "none";
      }
    }

    // Meander: random turn biased back to roughly the same heading
    angle += (rng() - 0.5) * 0.45;

    col += Math.cos(angle) * 1.2;
    row += Math.sin(angle) * 1.2;

    if (col < -2 || col >= MAP_COLS + 2 || row < -2 || row >= MAP_ROWS + 2)
      break;
  }
}

function addRivers(map: Tile[][], seed: number) {
  const rng = makeRng(seed);

  // River configs: [startCol, startRow, angle]
  // Avoid top-left corner (base + player start are there)
  // Rivers flow from right/bottom edges toward left/top
  const rivers: [number, number, number][] = [
    // From right side, angled left + slightly up
    [MAP_COLS - 1, 25 + Math.floor(rng() * 20), Math.PI + (rng() - 0.5) * 0.6],
    // From bottom side, angled upward + slightly left
    [
      35 + Math.floor(rng() * 20),
      MAP_ROWS - 1,
      -Math.PI / 2 + (rng() - 0.5) * 0.6,
    ],
    // From right side, different row
    [MAP_COLS - 1, 52 + Math.floor(rng() * 15), Math.PI + (rng() - 0.5) * 0.5],
  ];

  for (const [c, r, a] of rivers) {
    carveRiver(map, rng, c, r, a);
  }
}

// ─── Full map generation ──────────────────────────────────────────────────────

export function generateMap(): Tile[][] {
  const seed = MAP_SEED;

  // Step 1: base terrain
  const map: Tile[][] = Array.from({ length: MAP_ROWS }, (_, r) =>
    Array.from({ length: MAP_COLS }, (_, c) => {
      if (isInBase(c, r))
        return { type: "base" as TileType, decoration: "none" };
      if (isNearBase(c, r))
        return { type: "grass" as TileType, decoration: "none" };

      const large = fbm(c / 18, r / 18, seed);
      const medium = fbm(c / 7, r / 7, seed + 1000);
      const fine = fbm(c / 3, r / 3, seed + 2000);

      // Small water ponds from noise (keep sparse — rivers are the main water)
      if (large < 0.24 && medium < 0.42)
        return { type: "water", decoration: "none" };
      if (large > 0.76 && medium > 0.62)
        return { type: "rock", decoration: "none" };

      let type: TileType;
      if (large > 0.68) type = fine > 0.55 ? "dry_grass" : "dirt";
      else if (medium < 0.35) type = "sand";
      else if (medium > 0.65) type = "dirt";
      else type = "grass";

      let decoration: Tile["decoration"] = "none";
      const dRng = hash(c, r, seed + 3000);
      if (type === "grass" && dRng < 0.06)
        decoration = dRng < 0.03 ? "tree" : "bush";
      else if (type === "grass" && dRng > 0.93) decoration = "flower";
      else if (type === "dry_grass" && dRng < 0.04) decoration = "cactus";
      else if (type === "dirt" && dRng < 0.05) decoration = "boulder";

      return { type, decoration };
    }),
  );

  // Step 2: carve rivers over the terrain
  addRivers(map, seed + 5555);

  // Step 3: re-stamp base area (rivers may have encroached)
  for (let r = BASE_ROW; r < BASE_ROW + BASE_SIZE; r++)
    for (let c = BASE_COL; c < BASE_COL + BASE_SIZE; c++)
      map[r]![c]! = { type: "base", decoration: "none" };

  // Step 4: clear a walkable zone around player start
  for (let dr = -5; dr <= 5; dr++)
    for (let dc = -5; dc <= 5; dc++) {
      const r = PLAYER_START_ROW + dr,
        c = PLAYER_START_COL + dc;
      if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) {
        const tile = map[r]![c]!;
        if (tile.type === "water") tile.type = "grass";
        if (tile.decoration === "tree" || tile.decoration === "boulder")
          tile.decoration = "none";
      }
    }

  return map;
}

export function isObstacle(tile: Tile): boolean {
  if (tile.type === "water") return true;
  if (tile.decoration === "boulder") return true;
  return false;
}
