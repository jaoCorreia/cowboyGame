export interface GameItem {
  id: string;
  name: string;
  description: string; // describes the per-level effect
  icon: string;
  basePrice: number;   // price at level 0 → 1; multiplied by (level + 1)
  maxLevel: number;
}

export const SHOP_ITEMS: GameItem[] = [
  {
    id: 'lasso_forte',
    name: 'Lasso Reforçado',
    description: '-3 puxadas necessárias',
    icon: '🪢',
    basePrice: 50,
    maxLevel: 3,
  },
  {
    id: 'esporas',
    name: 'Esporas de Ouro',
    description: '+10% de velocidade',
    icon: '⚡',
    basePrice: 80,
    maxLevel: 3,
  },
  {
    id: 'lasso_longo',
    name: 'Lasso Longo',
    description: '+0.5 tiles de alcance',
    icon: '📏',
    basePrice: 100,
    maxLevel: 3,
  },
];

/** Price to upgrade from currentLevel → currentLevel+1 */
export function itemNextPrice(item: GameItem, currentLevel: number): number {
  return item.basePrice * (currentLevel + 1);
}
