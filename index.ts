import { MongoClient, ObjectId } from "mongodb";
import { checkServerIdentity as tlsCheckServerIdentity } from "tls";
import index from "./index.html";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI environment variable is not set");
const mongo = new MongoClient(MONGO_URI, {
  serverSelectionTimeoutMS: 10_000,
  checkServerIdentity: (host, cert) => {
    if (!cert?.subject) return undefined;
    return tlsCheckServerIdentity(host, cert);
  },
});
try {
  await mongo.connect();
} catch (err) {
  console.error(
    "\n[MongoDB] Falha ao conectar. Verifique se o IP do servidor está na allowlist do Atlas (Network Access > Allow 0.0.0.0/0).\n",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}

const db = mongo.db("cowboyGame");
const users = db.collection("users");

interface PlacedObjectDoc {
  _id: ObjectId;
  type: "bancada_individual" | "bancada_comunitaria";
  owner: string;
  ownerColor: string;
  col: number;
  row: number;
  placedAt: Date;
}
const placedObjects = db.collection<PlacedObjectDoc>("placedObjects");

await users.createIndex(
  { username: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

interface UserDoc {
  _id: ObjectId;
  username: string;
  password: string;
  color: string;
  basedCount: number;
  discoveredTypes: string[];
  discoveredNPCs: string[];
  capturedByType: Record<string, number>;
  basedCows: string[];
  coins: number;
  inventory: Record<string, number>;
}

interface Session {
  userId: string;
  username: string;
  color: string;
}
const sessions = new Map<string, Session>();

const activeTokenByUserId = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeWsByUserId = new Map<string, any>();

const PLAYER_COLORS = [
  "#4a90d9",
  "#e05555",
  "#55c876",
  "#e0b855",
  "#9f55e0",
  "#55c8c8",
  "#e07a35",
  "#7a55e0",
  "#e055b0",
  "#55e0a8",
  "#c8e055",
  "#7055e0",
];

function colorForUsername(username: string): string {
  let h = 0;
  for (const c of username) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return PLAYER_COLORS[Math.abs(h) % PLAYER_COLORS.length]!;
}

const BASE_COL_S = 4,
  BASE_ROW_S = 4,
  SLOT_COLS = 5,
  SLOT_GAP = 1.15;

function userSlotToPos(slot: number) {
  return {
    col: BASE_COL_S + 0.5 + (slot % SLOT_COLS) * SLOT_GAP,
    row: BASE_ROW_S + 0.5 + Math.floor(slot / SLOT_COLS) * SLOT_GAP,
  };
}

interface PlayerState {
  id: string;
  col: number;
  row: number;
  dirCol: number;
  dirRow: number;
  moving: boolean;
  color: string;
  name: string;
  herdCount: number;
  basedCows: Array<{ col: number; row: number }>;
}

const players = new Map<string, PlayerState>();

// ─── Server ───────────────────────────────────────────────────────────────────

interface WsData {
  id: string;
  userId: string;
  username: string;
  color: string;
}

let server!: ReturnType<typeof Bun.serve<WsData>>;

server = Bun.serve<WsData>({
  port: 3200,

  routes: {
    // ── Auth ─────────────────────────────────────────────────────────────────

    "/auth/register": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const { username, password } = (await req.json()) as {
        username?: string;
        password?: string;
      };
      if (!username || !password || username.length < 2 || password.length < 4)
        return Response.json(
          { error: "Usuário (mín. 2) e senha (mín. 4) obrigatórios." },
          { status: 400 },
        );

      const existing = await users.findOne(
        { username },
        { collation: { locale: "en", strength: 2 } },
      );
      if (existing)
        return Response.json({ error: "Usuário já existe." }, { status: 409 });

      const hash = await Bun.password.hash(password);
      const color = colorForUsername(username);
      const result = await users.insertOne({
        username,
        password: hash,
        color,
        basedCount: 0,
        discoveredTypes: [],
        discoveredNPCs: [],
        capturedByType: {},
        basedCows: [],
        coins: 0,
        inventory: {},
      } as Omit<UserDoc, "_id">);

      const newUserId = result.insertedId.toString();
      const token = crypto.randomUUID();
      sessions.set(token, { userId: newUserId, username, color });
      activeTokenByUserId.set(newUserId, token);
      return Response.json({
        token,
        username,
        color,
        basedCount: 0,
        discovered: [],
        discoveredNPCs: [],
        capturedByType: {},
        basedCows: [],
        coins: 0,
        inventory: {},
      });
    },

    "/auth/login": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const { username, password } = (await req.json()) as {
        username?: string;
        password?: string;
      };
      if (!username || !password)
        return Response.json(
          { error: "Preencha usuário e senha." },
          { status: 400 },
        );

      const row = (await users.findOne(
        { username },
        { collation: { locale: "en", strength: 2 } },
      )) as UserDoc | null;
      if (!row || !(await Bun.password.verify(password, row.password)))
        return Response.json(
          { error: "Usuário ou senha incorretos." },
          { status: 401 },
        );

      const loginUserId = row._id.toString();
      const oldToken = activeTokenByUserId.get(loginUserId);

      if (oldToken) {
        sessions.delete(oldToken);
        const oldWs = activeWsByUserId.get(loginUserId);
        if (oldWs) {
          try {
            oldWs.send(JSON.stringify({ type: "kicked" }));
          } catch {
            /* ignorar */
          }
          try {
            oldWs.close();
          } catch {
            /* ignorar */
          }
        }
      }

      const token = crypto.randomUUID();
      sessions.set(token, {
        userId: loginUserId,
        username: row.username,
        color: row.color,
      });
      activeTokenByUserId.set(loginUserId, token);
      return Response.json({
        token,
        username: row.username,
        color: row.color,
        basedCount: row.basedCount ?? 0,
        discovered: row.discoveredTypes ?? [],
        discoveredNPCs: row.discoveredNPCs ?? [],
        capturedByType: row.capturedByType ?? {},
        basedCows: row.basedCows ?? [],
        coins: row.coins ?? 0,
        inventory: row.inventory ?? {},
      });
    },

    "/auth/verify": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const { token } = (await req.json()) as { token?: string };
      const sess = sessions.get(token ?? "");
      if (!sess)
        return Response.json({ error: "Sessão expirada." }, { status: 401 });

      const row = (await users.findOne({
        _id: new ObjectId(sess.userId),
      })) as UserDoc | null;
      if (!row)
        return Response.json(
          { error: "Usuário não encontrado." },
          { status: 404 },
        );

      return Response.json({
        token,
        username: sess.username,
        color: row.color,
        basedCount: row.basedCount ?? 0,
        discovered: row.discoveredTypes ?? [],
        discoveredNPCs: row.discoveredNPCs ?? [],
        capturedByType: row.capturedByType ?? {},
        basedCows: row.basedCows ?? [],
        coins: row.coins ?? 0,
        inventory: row.inventory ?? {},
      });
    },

    // ── Placed Objects ────────────────────────────────────────────────────────

    "/objects": async (req: Request) => {
      if (req.method !== "GET")
        return new Response("Method Not Allowed", { status: 405 });
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const sess = sessions.get(token);
      if (!sess) return new Response("Unauthorized", { status: 401 });

      const objs = await placedObjects
        .find({
          $or: [
            { type: "bancada_comunitaria" },
            { type: "bancada_individual", owner: sess.username },
          ],
        })
        .toArray();

      return Response.json(
        objs.map((o) => ({
          id: o._id.toString(),
          type: o.type,
          owner: o.owner,
          ownerColor: o.ownerColor,
          col: o.col,
          row: o.row,
        })),
      );
    },

    "/objects/place": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = (await req.json()) as {
        token?: string;
        type?: string;
        col?: number;
        row?: number;
      };
      const sess = sessions.get(body.token ?? "");
      if (!sess) return new Response("Unauthorized", { status: 401 });

      const validTypes = ["bancada_individual", "bancada_comunitaria"];
      if (!validTypes.includes(body.type ?? ""))
        return Response.json({ error: "Tipo inválido" }, { status: 400 });
      if (typeof body.col !== "number" || typeof body.row !== "number")
        return Response.json({ error: "Posição inválida" }, { status: 400 });

      const col = Math.round(body.col * 10) / 10;
      const row = Math.round(body.row * 10) / 10;
      const type = body.type as "bancada_individual" | "bancada_comunitaria";

      const user = (await users.findOne({
        _id: new ObjectId(sess.userId),
      })) as UserDoc | null;
      if (!user) return new Response("Unauthorized", { status: 401 });

      const qty = (user.inventory[type] ?? 0) as number;
      if (qty <= 0)
        return Response.json(
          { error: "Sem bancada no inventário" },
          { status: 400 },
        );

      // Bancada comunitária: máximo 1 no chão por usuário
      if (type === "bancada_comunitaria") {
        const existing = await placedObjects.findOne({
          type: "bancada_comunitaria",
          owner: sess.username,
        });
        if (existing)
          return Response.json(
            { error: "Você já tem uma bancada comunitária no mapa" },
            { status: 400 },
          );
      }

      // Verificar sobreposição com outra bancada (dentro de 1 tile)
      const overlap = await placedObjects.findOne({
        col: { $gte: col - 1, $lte: col + 1 },
        row: { $gte: row - 1, $lte: row + 1 },
      });
      if (overlap)
        return Response.json(
          { error: "Já existe uma bancada nessa posição" },
          { status: 400 },
        );

      const newInventory = { ...user.inventory };
      if (qty <= 1) delete newInventory[type];
      else newInventory[type] = qty - 1;

      await users.updateOne(
        { _id: new ObjectId(sess.userId) },
        { $set: { inventory: newInventory } },
      );

      const result = await placedObjects.insertOne({
        type,
        owner: sess.username,
        ownerColor: sess.color,
        col,
        row,
        placedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      if (type === "bancada_comunitaria") {
        server.publish(
          "game",
          JSON.stringify({
            type: "object_placed",
            id: result.insertedId.toString(),
            objectType: type,
            owner: sess.username,
            ownerColor: sess.color,
            col,
            row,
          }),
        );
      }

      return Response.json({
        id: result.insertedId.toString(),
        inventory: newInventory,
      });
    },

    "/objects/:id": async (req: Request) => {
      if (req.method !== "DELETE")
        return new Response("Method Not Allowed", { status: 405 });
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const sess = sessions.get(token);
      if (!sess) return new Response("Unauthorized", { status: 401 });

      const id = new URL(req.url).pathname.split("/").pop() ?? "";
      let objId: ObjectId;
      try {
        objId = new ObjectId(id);
      } catch {
        return Response.json({ error: "ID inválido" }, { status: 400 });
      }

      const obj = await placedObjects.findOne({ _id: objId });
      if (!obj) return Response.json({ error: "Objeto não encontrado" }, { status: 404 });
      if (obj.owner !== sess.username)
        return Response.json({ error: "Sem permissão" }, { status: 403 });

      await placedObjects.deleteOne({ _id: objId });

      // Devolve 1 unidade ao inventário do dono
      await users.updateOne(
        { _id: new ObjectId(sess.userId) },
        { $inc: { [`inventory.${obj.type}`]: 1 } },
      );

      if (obj.type === "bancada_comunitaria") {
        server.publish("game", JSON.stringify({ type: "object_removed", id }));
      }

      return new Response("OK");
    },

    "/auth/save": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = (await req.json()) as {
        token?: string;
        basedCount?: number;
        discovered?: string[];
        discoveredNPCs?: string[];
        capturedByType?: Record<string, number>;
        basedCowTypes?: string[];
        coins?: number;
        inventory?: Record<string, number>;
      };
      const sess = sessions.get(body.token ?? "");
      if (!sess) return new Response("Unauthorized", { status: 401 });

      await users.updateOne(
        { _id: new ObjectId(sess.userId) },
        {
          $set: {
            basedCount: body.basedCount ?? 0,
            discoveredTypes: body.discovered ?? [],
            discoveredNPCs: body.discoveredNPCs ?? [],
            capturedByType: body.capturedByType ?? {},
            basedCows: Array.isArray(body.basedCowTypes)
              ? body.basedCowTypes
              : [],
            coins:
              typeof body.coins === "number" && body.coins >= 0
                ? Math.floor(body.coins)
                : 0,
            inventory:
              body.inventory && typeof body.inventory === "object"
                ? body.inventory
                : {},
          },
        },
      );
      return new Response("OK");
    },

    // ── Assets ───────────────────────────────────────────────────────────────

    "/sprites/*": async (req: Request) => {
      const url = new URL(req.url);
      const file = Bun.file("./public" + url.pathname);
      if (await file.exists()) return new Response(file);
      return new Response("Not Found", { status: 404 });
    },

    "/sounds/*": async (req: Request) => {
      const url = new URL(req.url);
      const file = Bun.file("./public" + url.pathname);
      if (await file.exists()) return new Response(file);
      return new Response("Not Found", { status: 404 });
    },

    // ── WebSocket ─────────────────────────────────────────────────────────────

    "/ws": (req: Request) => {
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const sess = sessions.get(token);
      if (!sess)
        return new Response("Unauthorized — faça login primeiro.", {
          status: 401,
        });
      server.upgrade(req, { data: { id: crypto.randomUUID(), ...sess } });
      return new Response("WebSocket only", { status: 400 });
    },

    "/": index,
    "/*": index,
  },

  websocket: {
    async open(ws) {
      const { id, username, color, userId } = ws.data;

      // Desconecta sessão anterior se existir (evita login duplicado)
      const oldWs = activeWsByUserId.get(userId);
      if (oldWs && oldWs !== ws) {
        const oldId = oldWs.data?.id;
        try {
          oldWs.send(JSON.stringify({ type: "kicked" }));
        } catch {
          /* ignorar */
        }
        try {
          oldWs.close();
        } catch {
          /* ignorar */
        }
        // Remove jogador antigo da lista
        if (oldId) {
          players.delete(oldId);
          server.publish("game", JSON.stringify({ type: "leave", id: oldId }));
        }
      }

      // Registra este WS como a conexão ativa do usuário
      activeWsByUserId.set(userId, ws);

      // Carrega vacas salvas no MongoDB para este jogador
      const row = (await users.findOne({
        _id: new ObjectId(userId),
      })) as UserDoc | null;

      // Se outro refresh chegou durante o await, abortar
      if (activeWsByUserId.get(userId) !== ws) return;

      const savedTypeIds: string[] = row?.basedCows ?? [];
      const savedBasedPositions = savedTypeIds.map((_, i) => userSlotToPos(i));

      // Carrega bancadas comunitárias existentes para enviar ao novo jogador
      const communityBenches = await placedObjects
        .find({ type: "bancada_comunitaria" })
        .toArray();

      // Verificar novamente após segundo await
      if (activeWsByUserId.get(userId) !== ws) return;

      ws.send(
        JSON.stringify({
          type: "init",
          id,
          color,
          name: username,
          players: [...players.values()].map((p) => ({
            id: p.id,
            col: p.col,
            row: p.row,
            dirCol: p.dirCol,
            dirRow: p.dirRow,
            moving: p.moving,
            color: p.color,
            name: p.name,
            herdCount: p.herdCount,
          })),
          basedCows: [...players.values()]
            .filter((p) => p.basedCows.length > 0)
            .map((p) => ({ id: p.id, color: p.color, cows: p.basedCows })),
          communityBenches: communityBenches.map((o) => ({
            id: o._id.toString(),
            objectType: o.type,
            owner: o.owner,
            ownerColor: o.ownerColor,
            col: o.col,
            row: o.row,
          })),
        }),
      );

      const state: PlayerState = {
        id,
        col: 12,
        row: 12,
        dirCol: 1,
        dirRow: 0,
        moving: false,
        color,
        name: username,
        herdCount: 0,
        basedCows: savedBasedPositions,
      };
      players.set(id, state);
      ws.subscribe("game");
      ws.subscribe(`player:${id}`);
      ws.publish(
        "game",
        JSON.stringify({
          type: "join",
          player: {
            id: state.id,
            col: state.col,
            row: state.row,
            dirCol: state.dirCol,
            dirRow: state.dirRow,
            moving: state.moving,
            color: state.color,
            name: state.name,
            herdCount: 0,
          },
        }),
      );
    },

    async message(ws, msg) {
      const { id, userId } = ws.data;
      const player = players.get(id);
      if (!player) return;
      try {
        const u = JSON.parse(msg as string);

        if (u.type === "move") {
          player.col = u.col;
          player.row = u.row;
          player.dirCol = u.dirCol;
          player.dirRow = u.dirRow;
          player.moving = u.moving;
          player.herdCount =
            typeof u.herdCount === "number"
              ? Math.min(Math.max(0, Math.floor(u.herdCount)), 20)
              : 0;
          ws.publish(
            "game",
            JSON.stringify({
              type: "move",
              id,
              col: player.col,
              row: player.row,
              dirCol: player.dirCol,
              dirRow: player.dirRow,
              moving: player.moving,
              herdCount: player.herdCount,
            }),
          );
        } else if (u.type === "cow_based" && Array.isArray(u.typeIds)) {
          const typeIds = (u.typeIds as unknown[])
            .filter((t): t is string => typeof t === "string")
            .slice(0, 20);
          if (typeIds.length === 0) return;
          const startSlot = player.basedCows.length;
          const newPositions = typeIds.map((_, i) =>
            userSlotToPos(startSlot + i),
          );
          player.basedCows.push(...newPositions);
          const payload = JSON.stringify({
            type: "cow_based",
            id,
            color: player.color,
            cows: player.basedCows,
          });
          ws.publish("game", payload);
          ws.send(payload);
        } else if (u.type === "save") {
          await users.updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: {
                basedCount: u.basedCount ?? 0,
                discoveredTypes: u.discovered ?? [],
                discoveredNPCs: u.discoveredNPCs ?? [],
                capturedByType: u.capturedByType ?? {},
                basedCows: Array.isArray(u.basedCowTypes)
                  ? u.basedCowTypes
                  : [],
                coins:
                  typeof u.coins === "number" && u.coins >= 0
                    ? Math.floor(u.coins)
                    : 0,
                inventory:
                  u.inventory && typeof u.inventory === "object"
                    ? u.inventory
                    : {},
              },
            },
          );
        } else if (u.type === "chat" && typeof u.text === "string") {
          const text = String(u.text).slice(0, 200).trim();
          if (text) {
            const chatMsg = JSON.stringify({
              type: "chat",
              id,
              name: player.name,
              color: player.color,
              text,
            });
            ws.publish("game", chatMsg);
            ws.send(chatMsg);
          }
        } else if (
          u.type === "trade_offer" &&
          typeof u.toId === "string" &&
          typeof u.itemId === "string"
        ) {
          const level =
            typeof u.level === "number" ? Math.max(1, Math.floor(u.level)) : 1;
          server.publish(
            `player:${u.toId}`,
            JSON.stringify({
              type: "trade_offer",
              fromId: id,
              fromName: player.name,
              fromColor: player.color,
              itemId: String(u.itemId).slice(0, 64),
              level,
            }),
          );
        } else if (u.type === "trade_accept" && typeof u.fromId === "string") {
          server.publish(
            `player:${u.fromId}`,
            JSON.stringify({ type: "trade_accepted", fromId: id }),
          );
        } else if (u.type === "trade_decline" && typeof u.fromId === "string") {
          server.publish(
            `player:${u.fromId}`,
            JSON.stringify({ type: "trade_declined", fromId: id }),
          );
        }
      } catch {
        /* ignora */
      }
    },

    close(ws) {
      const { id, userId } = ws.data;
      players.delete(id);
      ws.publish("game", JSON.stringify({ type: "leave", id }));
      if (
        (activeWsByUserId.get(userId) as { data?: { id: string } } | undefined)
          ?.data?.id === id
      ) {
        activeWsByUserId.delete(userId);
      }
    },
  },
});

console.log(`🤠 Cowboy Game rodando em ${server.url}`);
