export type CowRarity = 'comum' | 'incomum' | 'rara' | 'super_rara' | 'lendaria';
export type RenderStyle = 'normal' | 'striped' | 'translucent' | 'glowing' | 'cosmic' | 'spotted_color';

export interface CowType {
  id: string;
  name: string;
  rarity: CowRarity;
  weight: number;           // spawn weight (higher = more common)
  clicksNeeded: number;     // clicks required to lasso (harder = rarer)
  bodyColor: string;
  spotColor: string;
  secondaryColor?: string;  // accent / stripe color
  glowColor?: string;
  renderStyle: RenderStyle;
  description: string;
  fearDistance: number;     // tiles — starts slowly backing away at this range (0 = not fearful)
  fearSpeed: number;        // tiles/sec when wary (scaled by proximity)
}

export const COW_TYPES: CowType[] = [
  {
    id: 'branca',
    name: 'Vaca Branca',
    rarity: 'comum',
    weight: 38,
    clicksNeeded: 10,
    bodyColor: '#f5f5f5',
    spotColor: '#1a1a1a',
    renderStyle: 'normal',
    description: 'A clássica vaca do sertão. Mansinha e fácil de laçar.',
    fearDistance: 0, fearSpeed: 0,
  },
  {
    id: 'caramelo',
    name: 'Vaca Caramelo',
    rarity: 'comum',
    weight: 25,
    clicksNeeded: 10,
    bodyColor: '#d4896a',
    spotColor: '#7a3c10',
    renderStyle: 'normal',
    description: 'Cor de caramelo derretido. Muito comum nas fazendas do interior.',
    fearDistance: 0, fearSpeed: 0,
  },
  {
    id: 'malhada',
    name: 'Vaca Malhada',
    rarity: 'incomum',
    weight: 14,
    clicksNeeded: 15,
    bodyColor: '#f0e0b8',
    spotColor: '#c0682a',
    secondaryColor: '#e8b040',
    renderStyle: 'spotted_color',
    description: 'Manchas laranjas e amarelas incomuns. Um pouco mais ardia que as comuns.',
    fearDistance: 3.5, fearSpeed: 1.0,
  },
  {
    id: 'preta',
    name: 'Vaca Preta',
    rarity: 'incomum',
    weight: 10,
    clicksNeeded: 15,
    bodyColor: '#1e1e1e',
    spotColor: '#f0f0f0',
    renderStyle: 'normal',
    description: 'Escura como a noite. Difícil de enxergar no entardecer do sertão.',
    fearDistance: 4, fearSpeed: 1.2,
  },
  {
    id: 'tigrada',
    name: 'Vaca Tigrada',
    rarity: 'rara',
    weight: 5,
    clicksNeeded: 22,
    bodyColor: '#c89050',
    spotColor: '#3a1a08',
    renderStyle: 'striped',
    description: 'Listrada como um tigre das savanas. Ágil e muito esperta. Percebe você de longe.',
    fearDistance: 5.5, fearSpeed: 2.0,
  },
  {
    id: 'esmeralda',
    name: 'Vaca Esmeralda',
    rarity: 'rara',
    weight: 4,
    clicksNeeded: 22,
    bodyColor: '#72b87c',
    spotColor: '#2a6e38',
    secondaryColor: '#a8e0b0',
    renderStyle: 'normal',
    description: 'Verde como o pampa florido na primavera. Tímida, se afasta ao sentir presença humana.',
    fearDistance: 5, fearSpeed: 1.8,
  },
  {
    id: 'safira',
    name: 'Vaca Safira',
    rarity: 'super_rara',
    weight: 1.5,
    clicksNeeded: 30,
    bodyColor: '#5a8ec8',
    spotColor: '#1a3090',
    glowColor: 'rgba(90,160,255,0.35)',
    renderStyle: 'glowing',
    description: 'Azul como o céu de inverno. Extremamente desconfiada — mantém distância.',
    fearDistance: 7, fearSpeed: 2.8,
  },
  {
    id: 'fantasma',
    name: 'Vaca Fantasma',
    rarity: 'super_rara',
    weight: 1.0,
    clicksNeeded: 30,
    bodyColor: '#d8d8f0',
    spotColor: '#a0a0d0',
    glowColor: 'rgba(200,200,255,0.25)',
    renderStyle: 'translucent',
    description: 'Translúcida e silenciosa. Recua quando sente alguém se aproximando.',
    fearDistance: 8, fearSpeed: 3.0,
  },
  {
    id: 'dourada',
    name: 'Vaca Dourada',
    rarity: 'lendaria',
    weight: 0.35,
    clicksNeeded: 45,
    bodyColor: '#FFD700',
    spotColor: '#B8860B',
    glowColor: 'rgba(255,215,0,0.5)',
    renderStyle: 'glowing',
    description: 'Lendária entre os cowbóis. Sente sua presença a grande distância e some antes de você chegar.',
    fearDistance: 10, fearSpeed: 3.8,
  },
  {
    id: 'cosmica',
    name: 'Vaca Cósmica',
    rarity: 'lendaria',
    weight: 0.15,
    clicksNeeded: 45,
    bodyColor: '#0a0520',
    spotColor: '#ffffff',
    glowColor: 'rgba(180,100,255,0.6)',
    renderStyle: 'cosmic',
    description: 'Surgiu de outro mundo. Detecta qualquer movimento a enorme distância. Quase impossível de aproximar.',
    fearDistance: 13, fearSpeed: 4.5,
  },
];

// Weighted random selection
export function randomCowType(): CowType {
  const totalWeight = COW_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const t of COW_TYPES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return COW_TYPES[0]!;
}
