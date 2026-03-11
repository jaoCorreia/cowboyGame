import { MongoClient, ObjectId } from "mongodb";
import { checkServerIdentity as tlsCheckServerIdentity } from "tls";
import index from "./index.html";

// ─── Banco de dados (MongoDB) ─────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI environment variable is not set");

// Bun has a bug where checkServerIdentity receives a null cert during TLS
// handshake with MongoDB Atlas, crashing the process. Guard against it while
// still performing the real check when the cert is properly available.
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

// Índice único para username (case-insensitive)
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
  capturedByType: Record<string, number>;
  basedCows: string[]; // IDs dos tipos de vaca na base
}

// ─── Sessões em memória ───────────────────────────────────────────────────────

interface Session {
  userId: string;
  username: string;
  color: string;
}
const sessions = new Map<string, Session>();

// ─── Cor determinística por username ─────────────────────────────────────────

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

// ─── Posição de slot no curral (mesma fórmula do cliente em constants.ts) ─────

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

// ─── Estado dos jogadores conectados ─────────────────────────────────────────

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
        capturedByType: {},
        basedCows: [],
      } as Omit<UserDoc, "_id">);

      const token = crypto.randomUUID();
      sessions.set(token, {
        userId: result.insertedId.toString(),
        username,
        color,
      });
      return Response.json({
        token,
        username,
        color,
        basedCount: 0,
        discovered: [],
        capturedByType: {},
        basedCows: [],
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

      const token = crypto.randomUUID();
      sessions.set(token, {
        userId: row._id.toString(),
        username: row.username,
        color: row.color,
      });
      return Response.json({
        token,
        username: row.username,
        color: row.color,
        basedCount: row.basedCount ?? 0,
        discovered: row.discoveredTypes ?? [],
        capturedByType: row.capturedByType ?? {},
        basedCows: row.basedCows ?? [],
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
        capturedByType: row.capturedByType ?? {},
        basedCows: row.basedCows ?? [],
      });
    },

    "/auth/save": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = (await req.json()) as {
        token?: string;
        basedCount?: number;
        discovered?: string[];
        capturedByType?: Record<string, number>;
        basedCowTypes?: string[];
      };
      const sess = sessions.get(body.token ?? "");
      if (!sess) return new Response("Unauthorized", { status: 401 });

      await users.updateOne(
        { _id: new ObjectId(sess.userId) },
        {
          $set: {
            basedCount: body.basedCount ?? 0,
            discoveredTypes: body.discovered ?? [],
            capturedByType: body.capturedByType ?? {},
            basedCows: Array.isArray(body.basedCowTypes)
              ? body.basedCowTypes
              : [],
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

      // Carrega vacas salvas no MongoDB para este jogador
      const row = (await users.findOne({
        _id: new ObjectId(userId),
      })) as UserDoc | null;
      const savedTypeIds: string[] = row?.basedCows ?? [];
      const savedBasedPositions = savedTypeIds.map((_, i) => userSlotToPos(i));

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
                capturedByType: u.capturedByType ?? {},
                basedCows: Array.isArray(u.basedCowTypes)
                  ? u.basedCowTypes
                  : [],
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
        }
      } catch {
        /* ignora */
      }
    },

    close(ws) {
      const { id } = ws.data;
      players.delete(id);
      ws.publish("game", JSON.stringify({ type: "leave", id }));
    },
  },
});

console.log(`🤠 Cowboy Game rodando em ${server.url}`);
