export interface NPCEntry {
  id: string;
  name: string;
  role: string;
  description: string;
  spriteKey: string;
}

export const NPC_ENTRIES: NPCEntry[] = [
  {
    id: "vendedor",
    name: "Vendedor",
    role: "Comerciante",
    description:
      "Dizem que cruzou três desertos a pé, carregando tudo nas costas e sem beber uma gota d'água. Nunca reclama do calor, nunca pede descanso — só fareja lucro no horizonte. Alguns dizem que é meio camelo, outros dizem que é todo camelo.",
    spriteKey: "npcs/saler.png",
  },
  {
    id: "ladrao_culto",
    name: "Ladrão do Culto",
    role: "Ladrão de Gado",
    description:
      "Membro de um culto de nudismo cujo principal ritual é roubar gado alheio. Aparece de noite e some antes do amanhecer. O grau de nudismo é variável e, francamente, desconcertante.",
    spriteKey: "npcs/bandit/Unarmed_Idle_without_shadow.png",
  },
];
