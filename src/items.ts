export interface GameItem {
  id: string;
  name: string;
  description: string; // describes the per-level effect
  icon: string; // emoji icon for display
  basePrice: number; // price at level 0 → 1; multiplied by (level + 1)
  maxLevel: number;
  placeable?: boolean; // se true, level = quantidade; pode ser posicionado no mapa
}

export const SHOP_ITEMS: GameItem[] = [
  {
    id: "lasso_forte",
    name: "Lasso Reforçado",
    description: "-3 puxadas necessárias",
    icon: "🪢",
    basePrice: 50,
    maxLevel: 3,
  },
  {
    id: "esporas",
    name: "Esporas de Ouro",
    description: "+10% de velocidade",
    icon: "⚡",
    basePrice: 80,
    maxLevel: 3,
  },
  {
    id: "lasso_longo",
    name: "Lasso Longo",
    description: "+0.5 tiles de alcance",
    icon: "📏",
    basePrice: 100,
    maxLevel: 3,
  },
  {
    id: "corda_aco",
    name: "Corda de Aço",
    description: "Captura até 5 vacas ao mesmo tempo",
    icon: "⛓️",
    basePrice: 350,
    maxLevel: 1,
  },
  {
    id: "bola_vermelha",
    name: "Bola Vermelha Misteriosa",
    description:
      "Essa bola lembra uma doença sombria que mudou o mundo. O que será que ela desbloqueia?",
    icon: "/sprites/hud/icons/red_ball_key.png",
    basePrice: 10000,
    maxLevel: 1,
  },
  {
    id: "bancada_individual",
    name: "Bancada Individual",
    description: "Bancada de criação visível só para você. Posicione no mapa.",
    icon: "🔨",
    basePrice: 300,
    maxLevel: 10,
    placeable: true,
  },
  {
    id: "bancada_comunitaria",
    name: "Bancada Comunitária",
    description: "Bancada visível a todos os jogadores. Mais cara.",
    icon: "🏗️",
    basePrice: 800,
    maxLevel: 10,
    placeable: true,
  },
];

/** Price to upgrade from currentLevel → currentLevel+1 */
export function itemNextPrice(item: GameItem, currentLevel: number): number {
  if (item.placeable) return item.basePrice; // preço fixo por unidade
  return item.basePrice * (currentLevel + 1);
}
