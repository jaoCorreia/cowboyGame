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
  nightOnly?: boolean;      // only spawns during nighttime
  sprite?: string;          // path relativo a /sprites/ para substituir o canvas drawing
}

export const COW_TYPES: CowType[] = [
  // ── Comuns ────────────────────────────────────────────────────────────────
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
    sprite: 'cows/default_cow.gif',
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
  // ── Incomuns ──────────────────────────────────────────────────────────────
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
    id: 'nordestina',
    name: 'Vaca Nordestina',
    rarity: 'incomum',
    weight: 9,
    clicksNeeded: 12,
    bodyColor: '#c8724a',
    spotColor: '#7a3810',
    renderStyle: 'normal',
    description: 'Sobreviveu às secas do sertão e ao calor do meio-dia. Teimosa como um cangaceiro, mas no fundo é mansinha.',
    fearDistance: 2, fearSpeed: 0.8,
  },
  {
    id: 'junina',
    name: 'Vaca Junina',
    rarity: 'incomum',
    weight: 7,
    clicksNeeded: 12,
    bodyColor: '#e8b832',
    spotColor: '#c83820',
    secondaryColor: '#2050c0',
    renderStyle: 'spotted_color',
    description: 'Toda enfeitada como bandeirinha de São João. Mais animada que as outras, parece que está sempre querendo dançar forró.',
    fearDistance: 2.5, fearSpeed: 0.8,
  },
  // ── Raras ─────────────────────────────────────────────────────────────────
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
    id: 'zebu',
    name: 'Vaca Zebu',
    rarity: 'rara',
    weight: 3.5,
    clicksNeeded: 22,
    bodyColor: '#d0c8b4',
    spotColor: '#8a7860',
    secondaryColor: '#b8b0a0',
    renderStyle: 'normal',
    description: 'A rainha das fazendas brasileiras. Tem uma corcova imponente e um olhar que julga tudo. Responsável por mais de metade do gado nacional.',
    fearDistance: 5, fearSpeed: 1.8,
  },
  {
    id: 'pantaneira',
    name: 'Vaca Pantaneira',
    rarity: 'rara',
    weight: 3,
    clicksNeeded: 22,
    bodyColor: '#788c4a',
    spotColor: '#3a5020',
    secondaryColor: '#a4b870',
    renderStyle: 'normal',
    description: 'Nasceu nas cheias do Pantanal. Nada como peixe, some no barro como uma anta. Encontrá-la em terra firme é sinal de sorte.',
    fearDistance: 5.5, fearSpeed: 2.0,
  },
  // ── Super Raras ───────────────────────────────────────────────────────────
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
  // ── Terror (apenas à noite) ───────────────────────────────────────────────
  {
    id: 'zumbi',
    name: 'Vaca Zumbi',
    rarity: 'super_rara',
    weight: 2.5,
    clicksNeeded: 30,
    bodyColor: '#3a4820',
    spotColor: '#6a2818',
    glowColor: 'rgba(180,0,0,0.45)',
    renderStyle: 'glowing',
    description: 'Não tem medo. Não foge. Apenas se aproxima devagar olhando nos seus olhos. Dizem que morreu numa quinta-feira e nunca recebeu o recado.',
    fearDistance: 0, fearSpeed: 0,
    nightOnly: true,
  },
  {
    id: 'saci',
    name: 'Vaca Saci',
    rarity: 'rara',
    weight: 2.0,
    clicksNeeded: 38,
    bodyColor: '#1a0c04',
    spotColor: '#c84010',
    glowColor: 'rgba(200,60,0,0.5)',
    renderStyle: 'translucent',
    description: 'O espírito travesso das noites brasileiras. Aparece e some num piscar de olhos. Assobiar de noite pode atraí-la — ou afastá-la, ninguém sabe ao certo.',
    fearDistance: 11, fearSpeed: 5.5,
    nightOnly: true,
  },
  // ── Lendárias ─────────────────────────────────────────────────────────────
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
  {
    id: 'boi_bumba',
    name: 'Boi Bumbá',
    rarity: 'lendaria',
    weight: 0.18,
    clicksNeeded: 45,
    bodyColor: '#150808',
    spotColor: '#cc2010',
    glowColor: 'rgba(200,30,10,0.45)',
    renderStyle: 'glowing',
    description: 'Encarnação do folclore amazônico. É o espírito do Bumba Meu Boi em forma de lenda viva. Ao capturá-lo uma vez, dizem que ele sempre volta.',
    fearDistance: 12, fearSpeed: 4.5,
  },
  // ── Sprites customizados ──────────────────────────────────────────────────
  {
    id: 'bad_cow',
    name: 'Vaca Malvada',
    rarity: 'super_rara',
    weight: 1.2,
    clicksNeeded: 32,
    bodyColor: '#3a0a0a',
    spotColor: '#cc2020',
    glowColor: 'rgba(200,20,20,0.4)',
    renderStyle: 'glowing',
    description: 'Olhar torvo, chifres afiados e temperamento explosivo. Ninguém sabe de onde veio, mas todo mundo sabe que não quer descobrir.',
    fearDistance: 0, fearSpeed: 0,
    sprite: 'cows/bad_cow.png',
  },
  {
    id: 'glass_cow',
    name: 'Vaca de Vidro',
    rarity: 'rara',
    weight: 2.5,
    clicksNeeded: 20,
    bodyColor: '#c8e8f8',
    spotColor: '#80c0e0',
    glowColor: 'rgba(150,220,255,0.3)',
    renderStyle: 'translucent',
    description: 'Feita de algum material transparente misterioso. Reflete a luz do sertão de um jeito que nenhuma outra vaca faz.',
    fearDistance: 5, fearSpeed: 1.8,
    sprite: 'cows/glass_cow.png',
  },
  {
    id: 'demonizada',
    name: 'Vaca Demonizada',
    rarity: 'lendaria',
    weight: 0.4,
    clicksNeeded: 50,
    bodyColor: '#0a0505',
    spotColor: '#ff1010',
    glowColor: 'rgba(255,0,0,0.65)',
    renderStyle: 'cosmic',
    description: 'A temperatura cai quando ela aparece. Não corre porque não precisa. Quem tenta laçar raramente conta a história.',
    fearDistance: 0, fearSpeed: 0,
    nightOnly: true,
  },
];

// Weighted random selection – nightMode includes nightOnly cows in the pool
export function randomCowType(nightMode = false): CowType {
  const pool = nightMode ? COW_TYPES : COW_TYPES.filter(t => !t.nightOnly);
  const totalWeight = pool.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const t of pool) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return pool[0]!;
}
