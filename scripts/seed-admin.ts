/**
 * Seed: cria o usuário admin no MongoDB.
 * Uso: bun run scripts/seed-admin.ts
 * Variáveis de ambiente: MONGO_URI, ADMIN_PASSWORD (opcional, padrão: "admin123")
 */

import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI não definida.");

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

const PLAYER_COLORS = [
  "#4a90d9", "#e05555", "#55c876", "#e0b855", "#9f55e0", "#55c8c8",
  "#e07a35", "#7a55e0", "#e055b0", "#55e0a8", "#c8e055", "#7055e0",
];

function colorForUsername(username: string): string {
  let h = 0;
  for (const c of username) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return PLAYER_COLORS[Math.abs(h) % PLAYER_COLORS.length]!;
}

const mongo = new MongoClient(MONGO_URI);
await mongo.connect();

const users = mongo.db("cowboyGame").collection("users");

const existing = await users.findOne(
  { username: ADMIN_USERNAME },
  { collation: { locale: "en", strength: 2 } },
);

if (existing) {
  console.log(`Usuário '${ADMIN_USERNAME}' já existe. Seed ignorada.`);
  await mongo.close();
  process.exit(0);
}

const hash = await Bun.password.hash(ADMIN_PASSWORD);
const color = colorForUsername(ADMIN_USERNAME);

await users.insertOne({
  username: ADMIN_USERNAME,
  password: hash,
  color,
  basedCount: 0,
  discoveredTypes: [],
  discoveredNPCs: [],
  capturedByType: {},
  basedCows: [],
  coins: 0,
  inventory: {},
});

console.log(`✓ Usuário '${ADMIN_USERNAME}' criado com sucesso.`);
console.log(`  Senha: ${ADMIN_PASSWORD}`);
console.log(`  Cor:   ${color}`);

await mongo.close();
