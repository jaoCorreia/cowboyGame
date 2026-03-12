export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_COLS = 80;
export const MAP_ROWS = 80;

export const BASE_COL = 4;
export const BASE_ROW = 4;
export const BASE_SIZE = 6;

// Layout das vacas no curral (mesma fórmula usada no servidor)
export const BASE_SLOT_COLS = 5;
export const BASE_SLOT_GAP  = 1.15;

export const COW_COUNT = 18;
export const PLAYER_SPEED = 5.5;
export const COW_WANDER_SPEED = 1.2;
export const COW_FLEE_SPEED = 3.8;
export const HERD_FOLLOW_SPEED = 6.5;
export const HERD_SPACING = 1.1;

export const CAPTURE_DIST = 3.5;
export const LASSO_CLICKS_NEEDED = 15;
export const LASSO_TIME_LIMIT = 5;
export const LASSO_THROW_DURATION = 0.7;

export const MAP_SEED = 31337;

// Stake (grappling hook)
export const STAKE_RANGE       = 11;   // max throw distance in tiles
export const STAKE_FLY_SPEED   = 18;   // tiles/sec during throw arc
export const STAKE_PULL_SPEED  = 10;   // tiles/sec pulling player

// ─── Vendedor ─────────────────────────────────────────────────────────────────
export const VENDOR_COL = 11;
export const VENDOR_ROW = 5;
export const VENDOR_INTERACT_DIST = 2.5;

export const COW_SELL_PRICES: Record<string, number> = {
  comum:      10,
  incomum:    30,
  rara:       80,
  super_rara: 200,
  lendaria:   500,
};

export const RARITY_COLORS: Record<string, string> = {
  comum:      '#9e9e9e',
  incomum:    '#4caf50',
  rara:       '#2196f3',
  super_rara: '#9c27b0',
  lendaria:   '#ffd700',
};

export const RARITY_LABELS: Record<string, string> = {
  comum:      '⭐ Comum',
  incomum:    '⭐⭐ Incomum',
  rara:       '⭐⭐⭐ Rara',
  super_rara: '💎 Super Rara',
  lendaria:   '👑 Lendária',
};
