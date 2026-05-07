import { MongoClient, ObjectId } from "mongodb";
import { checkServerIdentity as tlsCheckServerIdentity } from "tls";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import index from "./index.html";

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET ?? "";
const APP_URL = process.env.APP_URL ?? ""; // ex: https://seudominio.com

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@vaqueiro.up.railway.app";

const PORT = Number(process.env.PORT ?? 3200);
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_AVATAR_BODY_BYTES = 220 * 1024;
const MAX_WS_MESSAGE_BYTES = 16 * 1024;
const MAX_BASED_COWS = 20;
const MAX_PROFILE_LIST_ITEMS = 200;
const MAX_INVENTORY_ITEMS = 64;
const MAX_PLACED_OBJECTS_PER_RESPONSE = 500;
const MAX_CHOPPED_TREES_PER_RESPONSE = 6_400;
const TREE_REGROW_BATCH_SIZE = 500;
const ASSET_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

async function readLimitedText(req: Request, maxBytes: number): Promise<string | Response> {
  const rawLength = req.headers.get("content-length");
  if (rawLength) {
    const contentLength = Number(rawLength);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return Response.json({ error: "Payload muito grande." }, { status: 413 });
    }
  }

  const reader = req.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      return Response.json({ error: "Payload muito grande." }, { status: 413 });
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function parseJsonBody<T>(
  req: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<T | Response> {
  const text = await readLimitedText(req, maxBytes);
  if (text instanceof Response) return text;
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
}

function clampStringArray(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, maxItems)
    : [];
}

function clampNumberRecord(value: unknown, maxItems: number): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(value).slice(0, maxItems)) {
    if (key.length > 64) continue;
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;
    out[key] = Math.max(0, Math.floor(rawValue));
  }
  return out;
}

function clampNonNegativeInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(max, Math.floor(value))
    : 0;
}

async function assetResponse(pathname: string): Promise<Response | null> {
  if (pathname.includes("..") || pathname.includes("\\")) {
    return new Response("Bad Request", { status: 400 });
  }
  const file = Bun.file("./public" + pathname);
  if (!(await file.exists())) return null;
  const headers = new Headers(ASSET_CACHE_HEADERS);
  if (file.type) headers.set("Content-Type", file.type);
  return new Response(file, { headers });
}

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

interface ChoppedTreeDoc {
  _id: ObjectId;
  col: number;
  row: number;
  choppedAt: Date;
}
const choppedTreesColl = db.collection<ChoppedTreeDoc>("choppedTrees");
await choppedTreesColl.createIndex({ col: 1, row: 1 }, { unique: true });
await choppedTreesColl.createIndex({ choppedAt: 1 });

const gameState = db.collection<{ _id: string; value: number }>("gameState");

interface SessionDoc {
  _id: string; // token
  userId: string;
  username: string;
  color: string;
  isAdmin: boolean;
  expiresAt: Date;
}
const sessionsColl = db.collection<SessionDoc>("sessions");
await sessionsColl.createIndex(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);
await sessionsColl.createIndex({ userId: 1 });

interface ChatMessageDoc {
  _id: ObjectId;
  playerId: string;
  name: string;
  color: string;
  text: string;
  sentAt: Date;
}
const chatMessages = db.collection<ChatMessageDoc>("chatMessages");
await chatMessages.createIndex({ sentAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL
await placedObjects.createIndex({ type: 1, owner: 1 });
await placedObjects.createIndex({ col: 1, row: 1 });

await users.createIndex(
  { username: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
await users.createIndex({ email: 1 }, { unique: true, sparse: true });
await users.createIndex({ googleId: 1 }, { unique: true, sparse: true });
await users.createIndex({ githubId: 1 }, { unique: true, sparse: true });

interface OAuthStateDoc {
  _id: string; // state UUID
  expiresAt: Date;
  linkToken?: string; // se presente, modo de vinculação
}
const oauthStatesColl = db.collection<OAuthStateDoc>("oauthStates");
await oauthStatesColl.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// Migração: garante que usuários admin já existentes têm isAdmin: true no DB
await users.updateMany(
  { username: { $in: ["admin", "joao"] }, isAdmin: { $ne: true } },
  { $set: { isAdmin: true } },
  { collation: { locale: "en", strength: 2 } },
);

async function getSession(token: string): Promise<Session | null> {
  if (!token) return null;
  const doc = await sessionsColl.findOne({ _id: token });
  if (!doc) return null;
  return { userId: doc.userId, username: doc.username, color: doc.color, isAdmin: doc.isAdmin };
}

async function createSession(token: string, sess: Session): Promise<void> {
  await sessionsColl.replaceOne(
    { _id: token },
    { _id: token, ...sess, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } as unknown as SessionDoc,
    { upsert: true },
  );
}

async function deleteSession(token: string): Promise<void> {
  await sessionsColl.deleteOne({ _id: token });
}

async function deleteSessionsByUserId(userId: string): Promise<void> {
  await sessionsColl.deleteMany({ userId });
}

function buildUserPayload(user: UserDoc, token: string, isAdmin: boolean) {
  return {
    token,
    username: user.username,
    color: user.color,
    basedCount: user.basedCount ?? 0,
    discovered: user.discoveredTypes ?? [],
    discoveredNPCs: user.discoveredNPCs ?? [],
    capturedByType: user.capturedByType ?? {},
    basedCows: clampStringArray(user.basedCows, MAX_BASED_COWS),
    coins: user.coins ?? 0,
    inventory: user.inventory ?? {},
    isAdmin,
  };
}

async function loginUser(user: UserDoc): Promise<{ token: string; payload: ReturnType<typeof buildUserPayload> }> {
  const userId = user._id.toString();
  await deleteSessionsByUserId(userId);
  const oldWs = activeWsByUserId.get(userId);
  if (oldWs) {
    try { oldWs.send(JSON.stringify({ type: "kicked" })); } catch { /**/ }
    try { oldWs.close(); } catch { /**/ }
  }
  const token = crypto.randomUUID();
  const isAdmin = user.isAdmin ?? false;
  await createSession(token, { userId, username: user.username, color: user.color, isAdmin });
  return { token, payload: buildUserPayload(user, token, isAdmin) };
}

/** Faz upsert de usuário OAuth. Retorna o documento atualizado/criado. */
async function upsertOAuthUser(opts: {
  provider: "google" | "github";
  providerId: string;
  email: string | null;
  displayName: string;
}): Promise<UserDoc> {
  const providerKey = opts.provider === "google" ? "googleId" : "githubId";

  // 1. Já tem conta vinculada a esse provider
  let user = await users.findOne({ [providerKey]: opts.providerId }) as UserDoc | null;
  if (user) return user;

  // 2. Tem conta com mesmo email → vincula provider
  if (opts.email) {
    user = await users.findOne({ email: opts.email }) as UserDoc | null;
    if (user) {
      await users.updateOne({ _id: user._id }, { $set: { [providerKey]: opts.providerId } });
      return { ...user, [providerKey]: opts.providerId };
    }
  }

  // 3. Criar novo usuário — gerar username único
  const base = (opts.displayName.replace(/\s+/g, "").slice(0, 18) || opts.email?.split("@")[0]?.slice(0, 18) || "Vaqueiro");
  let username = base;
  let suffix = 1;
  while (await users.findOne({ username }, { collation: { locale: "en", strength: 2 } })) {
    username = `${base}${suffix++}`;
  }
  const color = colorForUsername(username);
  const result = await users.insertOne({
    username,
    password: null,
    color,
    ...(opts.email ? { email: opts.email, emailVerified: true } : {}),
    [providerKey]: opts.providerId,
    basedCount: 0,
    discoveredTypes: [],
    discoveredNPCs: [],
    capturedByType: {},
    basedCows: [],
    coins: 0,
    inventory: {},
  } as unknown as Omit<UserDoc, "_id">);

  return (await users.findOne({ _id: result.insertedId })) as UserDoc;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[Email] RESEND_API_KEY não configurada — email não enviado para ${to}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) console.error("[Email] Resend error:", await res.text());
  } catch (err) {
    console.error("[Email] fetch error:", err);
  }
}

async function sendMagicLink(email: string, rawToken: string, purpose: "login" | "verify"): Promise<void> {
  const url = `${APP_URL}/auth/magic/${rawToken}`;
  const label = purpose === "login" ? "Entrar no Vaqueiro" : "Confirmar email";
  await sendEmail(
    email,
    purpose === "login" ? "🤠 Seu link de acesso — Vaqueiro" : "🤠 Confirme seu email — Vaqueiro",
    `<div style="font-family:sans-serif;background:#1a0a02;color:#FFE0A0;padding:32px;text-align:center">
      <h2 style="color:#FFD700">🤠 Jogo do Vaqueiro</h2>
      <p style="margin:16px 0">${purpose === "login" ? "Clique no botão abaixo para entrar:" : "Clique para confirmar seu email:"}</p>
      <a href="${url}" style="display:inline-block;padding:12px 28px;background:#9b6218;color:#FFD700;font-weight:bold;text-decoration:none;border:2px solid #e0a840;border-radius:4px">${label}</a>
      <p style="margin-top:20px;font-size:12px;color:#9b7e57">Link válido por 15 minutos. Ignore se não foi você.</p>
    </div>`,
  );
}

/** Redireciona para o jogo com parâmetro de erro OAuth. */
function oauthError(code: string) {
  return Response.redirect(`${APP_URL}/?error=${code}`, 302);
}

/** Retorna uma página que envia postMessage para a janela pai e fecha o popup. */
function oauthPopupResult(type: "linked" | "error", detail: string) {
  const html = `<!DOCTYPE html><html><body><script>
    try { window.opener.postMessage(${JSON.stringify({ type, detail })}, '*'); } catch(e){}
    window.close();
  </script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

/** Gera hash SHA-256 de uma string e retorna em hex. */
async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface UserDoc {
  _id: ObjectId;
  username: string;
  password: string | null; // null para contas OAuth-only
  color: string;
  isAdmin?: boolean;
  basedCount: number;
  discoveredTypes: string[];
  discoveredNPCs: string[];
  capturedByType: Record<string, number>;
  basedCows: string[];
  coins: number;
  inventory: Record<string, number>;
  // Campos de auth extendida
  email?: string | null;
  emailVerified?: boolean;
  googleId?: string | null;
  githubId?: string | null;
  magicTokenHash?: string | null;
  magicTokenExpires?: Date | null;
  avatarUrl?: string | null;
}

interface Session {
  userId: string;
  username: string;
  color: string;
  isAdmin: boolean;
}

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
const _bdDoc = await gameState.findOne({ _id: "birthdayParabensCount" });
let birthdayParabensCount = _bdDoc?.value ?? 0;

// ─── Server ───────────────────────────────────────────────────────────────────

interface WsData {
  id: string;
  userId: string;
  username: string;
  color: string;
}

let server!: ReturnType<typeof Bun.serve<WsData>>;

server = Bun.serve<WsData>({
  port: PORT,

  routes: {
    // ── Auth ─────────────────────────────────────────────────────────────────

    "/auth/register": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ username?: string; password?: string }>(req, 8 * 1024);
      if (body instanceof Response) return body;
      const { username, password } = body;
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
      const isAdmin = false; // novos usuários nunca são admin
      await createSession(token, { userId: newUserId, username, color, isAdmin });
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
        isAdmin,
      });
    },

    "/auth/login": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ username?: string; password?: string }>(req, 8 * 1024);
      if (body instanceof Response) return body;
      const { username, password } = body;
      if (!username || !password)
        return Response.json(
          { error: "Preencha usuário e senha." },
          { status: 400 },
        );

      const row = (await users.findOne(
        { username },
        { collation: { locale: "en", strength: 2 } },
      )) as UserDoc | null;
      if (!row || !row.password)
        return Response.json(
          { error: row ? "Conta criada via Google/GitHub — use o botão correspondente ou recupere a senha por email." : "Usuário ou senha incorretos." },
          { status: 401 },
        );
      if (!(await Bun.password.verify(password, row.password)))
        return Response.json({ error: "Usuário ou senha incorretos." }, { status: 401 });

      const { payload } = await loginUser(row);
      return Response.json(payload);
    },

    "/auth/verify": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ token?: string }>(req, 8 * 1024);
      if (body instanceof Response) return body;
      const { token } = body;
      const sess = await getSession(token ?? "");
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
        basedCows: clampStringArray(row.basedCows, MAX_BASED_COWS),
        coins: row.coins ?? 0,
        inventory: row.inventory ?? {},
        isAdmin: sess.isAdmin,
      });
    },

    // ── OAuth — Google ────────────────────────────────────────────────────────

    "/auth/google": async (req: Request) => {
      if (!GOOGLE_CLIENT_ID)
        return new Response("Google OAuth não configurado.", { status: 501 });
      const linkToken = new URL(req.url).searchParams.get("link") ?? "";
      const state = crypto.randomUUID();
      await oauthStatesColl.insertOne({
        _id: state,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        ...(linkToken ? { linkToken } : {}),
      } as OAuthStateDoc);
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${APP_URL}/auth/google/callback`,
        response_type: "code",
        scope: "openid email profile",
        state,
      });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
    },

    "/auth/google/callback": async (req: Request) => {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errParam = url.searchParams.get("error");
      if (errParam || !code || !state)
        return oauthError("oauth_cancelled");

      const stateDoc = await oauthStatesColl.findOneAndDelete({ _id: state });
      if (!stateDoc) return oauthError("oauth_state_invalid");

      // Trocar code por tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: `${APP_URL}/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) return oauthError("oauth_token_failed");

      const tokenData = (await tokenRes.json()) as { id_token?: string; error?: string };
      if (!tokenData.id_token) return oauthError("oauth_no_id_token");

      const jwtPayload = JSON.parse(
        Buffer.from(tokenData.id_token.split(".")[1]!, "base64url").toString("utf8"),
      ) as { sub: string; email?: string; name?: string };

      // Modo vinculação: associa Google a conta existente
      const linkToken = (stateDoc as OAuthStateDoc & { linkToken?: string }).linkToken;
      if (linkToken) {
        const sess = await getSession(linkToken);
        if (!sess) return oauthPopupResult("error", "Sessão expirada.");
        const already = await users.findOne({ googleId: jwtPayload.sub }) as UserDoc | null;
        if (already && already._id.toString() !== sess.userId)
          return oauthPopupResult("error", "Este Google já está vinculado a outra conta.");
        await users.updateOne({ _id: new ObjectId(sess.userId) }, { $set: { googleId: jwtPayload.sub } });
        return oauthPopupResult("linked", "google");
      }

      const user = await upsertOAuthUser({
        provider: "google",
        providerId: jwtPayload.sub,
        email: jwtPayload.email ?? null,
        displayName: jwtPayload.name ?? jwtPayload.email ?? "Vaqueiro",
      });
      const { payload } = await loginUser(user);
      return Response.redirect(`${APP_URL}/?session=${payload.token}`, 302);
    },

    // ── OAuth — GitHub ────────────────────────────────────────────────────────

    "/auth/github": async (req: Request) => {
      if (!GITHUB_CLIENT_ID)
        return new Response("GitHub OAuth não configurado.", { status: 501 });
      const linkToken = new URL(req.url).searchParams.get("link") ?? "";
      const state = crypto.randomUUID();
      await oauthStatesColl.insertOne({
        _id: state,
        expiresAt: new Date(Date.now() + 10 * 60_000),
        ...(linkToken ? { linkToken } : {}),
      } as OAuthStateDoc);
      const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: `${APP_URL}/auth/github/callback`,
        scope: "read:user user:email",
        state,
      });
      return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
    },

    "/auth/github/callback": async (req: Request) => {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errParam = url.searchParams.get("error");
      if (errParam || !code || !state)
        return Response.redirect(`${APP_URL}/?error=oauth_cancelled`, 302);

      const stateDoc = await oauthStatesColl.findOneAndDelete({ _id: state });
      if (!stateDoc)
        return Response.redirect(`${APP_URL}/?error=oauth_state_invalid`, 302);

      // Trocar code por access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${APP_URL}/auth/github/callback`,
        }),
      });
      if (!tokenRes.ok)
        return Response.redirect(`${APP_URL}/?error=oauth_token_failed`, 302);

      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenData.access_token)
        return Response.redirect(`${APP_URL}/?error=oauth_no_access_token`, 302);

      const ghHeaders = { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json", "User-Agent": "CowboyGame/1.0" };

      // Buscar perfil
      const profileRes = await fetch("https://api.github.com/user", { headers: ghHeaders });
      const profile = (await profileRes.json()) as { id: number; login: string; name?: string; email?: string };

      // Email pode ser nulo → buscar lista de emails
      let email = profile.email ?? null;
      if (!email) {
        const emailsRes = await fetch("https://api.github.com/user/emails", { headers: ghHeaders });
        const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
      }

      // Modo vinculação
      const linkToken = (stateDoc as OAuthStateDoc & { linkToken?: string }).linkToken;
      if (linkToken) {
        const sess = await getSession(linkToken);
        if (!sess) return oauthPopupResult("error", "Sessão expirada.");
        const already = await users.findOne({ githubId: String(profile.id) }) as UserDoc | null;
        if (already && already._id.toString() !== sess.userId)
          return oauthPopupResult("error", "Este GitHub já está vinculado a outra conta.");
        await users.updateOne({ _id: new ObjectId(sess.userId) }, { $set: { githubId: String(profile.id) } });
        return oauthPopupResult("linked", "github");
      }

      const user = await upsertOAuthUser({
        provider: "github",
        providerId: String(profile.id),
        email,
        displayName: profile.name ?? profile.login,
      });
      const { payload } = await loginUser(user);
      return Response.redirect(`${APP_URL}/?session=${payload.token}`, 302);
    },

    // ── Magic Link / Recuperação de senha ─────────────────────────────────────

    "/auth/forgot-password": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ email?: string }>(req, 8 * 1024);
      if (body instanceof Response) return body;
      const { email } = body;
      if (!email || !email.includes("@"))
        return Response.json({ error: "Email inválido." }, { status: 400 });

      const user = await users.findOne({ email: email.toLowerCase() }) as UserDoc | null;
      // Responde 200 mesmo se não encontrado (não revelar existência)
      if (!user) return Response.json({ ok: true });

      const rawToken = crypto.randomUUID();
      const hash = await sha256hex(rawToken);
      await users.updateOne({ _id: user._id }, {
        $set: { magicTokenHash: hash, magicTokenExpires: new Date(Date.now() + 15 * 60_000) },
      });

      await sendMagicLink(email, rawToken, "login");
      return Response.json({ ok: true });
    },

    "/auth/magic/:token": async (req: Request) => {
      const rawToken = new URL(req.url).pathname.split("/").pop() ?? "";
      if (!rawToken) return Response.redirect(`${APP_URL}/?error=link_invalido`, 302);

      const hash = await sha256hex(rawToken);
      const user = await users.findOne({
        magicTokenHash: hash,
        magicTokenExpires: { $gt: new Date() },
      }) as UserDoc | null;

      if (!user) return Response.redirect(`${APP_URL}/?error=link_expirado`, 302);

      // Limpa o token de uso único
      await users.updateOne({ _id: user._id }, {
        $unset: { magicTokenHash: "", magicTokenExpires: "" },
      });

      const { payload } = await loginUser(user);
      return Response.redirect(`${APP_URL}/?session=${payload.token}`, 302);
    },

    // ── Vincular email a conta existente ─────────────────────────────────────

    "/auth/link-email": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ token?: string; email?: string }>(req, 16 * 1024);
      if (body instanceof Response) return body;
      const { token, email } = body;
      const sess = await getSession(token ?? "");
      if (!sess) return Response.json({ error: "Não autenticado." }, { status: 401 });
      if (!email || !email.includes("@"))
        return Response.json({ error: "Email inválido." }, { status: 400 });

      const normalized = email.toLowerCase();
      const existing = await users.findOne({ email: normalized }) as UserDoc | null;
      if (existing && existing._id.toString() !== sess.userId)
        return Response.json({ error: "Email já vinculado a outra conta." }, { status: 409 });

      // Gerar magic link de confirmação
      const rawToken = crypto.randomUUID();
      const hash = await sha256hex(rawToken);
      await users.updateOne({ _id: new ObjectId(sess.userId) }, {
        $set: {
          email: normalized,
          emailVerified: false,
          magicTokenHash: hash,
          magicTokenExpires: new Date(Date.now() + 15 * 60_000),
        },
      });

      await sendMagicLink(normalized, rawToken, "verify");
      return Response.json({ ok: true });
    },

    // ── Perfil (provedores vinculados) ────────────────────────────────────────

    "/auth/profile": async (req: Request) => {
      if (req.method !== "GET")
        return new Response("Method Not Allowed", { status: 405 });
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const sess = await getSession(token);
      if (!sess) return Response.json({ error: "Não autenticado." }, { status: 401 });
      const user = await users.findOne({ _id: new ObjectId(sess.userId) }) as UserDoc | null;
      if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
      return Response.json({
        email: user.email ?? null,
        hasPassword: !!user.password,
        googleLinked: !!user.googleId,
        githubLinked: !!user.githubId,
        avatarUrl: user.avatarUrl ?? null,
      });
    },

    // ── Avatar upload ─────────────────────────────────────────────────────────

    "/auth/avatar": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ token?: string; dataUrl?: string }>(req, MAX_AVATAR_BODY_BYTES);
      if (body instanceof Response) return body;
      const { token, dataUrl } = body;
      const sess = await getSession(token ?? "");
      if (!sess) return Response.json({ error: "Não autenticado." }, { status: 401 });
      if (!dataUrl || !dataUrl.startsWith("data:image/"))
        return Response.json({ error: "Formato inválido." }, { status: 400 });
      if (dataUrl.length > 200_000)
        return Response.json({ error: "Imagem muito grande (máx ~150kb)." }, { status: 400 });
      await users.updateOne(
        { _id: new ObjectId(sess.userId) },
        { $set: { avatarUrl: dataUrl } },
      );
      return Response.json({ ok: true });
    },

    // ── Alterar senha ─────────────────────────────────────────────────────────

    "/auth/change-password": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{
        token?: string; currentPassword?: string; newPassword?: string;
      }>(req, 16 * 1024);
      if (body instanceof Response) return body;
      const { token, currentPassword, newPassword } = body;
      const sess = await getSession(token ?? "");
      if (!sess) return Response.json({ error: "Não autenticado." }, { status: 401 });
      if (!newPassword || newPassword.length < 4)
        return Response.json({ error: "Nova senha muito curta (mín. 4 caracteres)." }, { status: 400 });

      const user = await users.findOne({ _id: new ObjectId(sess.userId) }) as UserDoc | null;
      if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

      // Se tem senha local, exige senha atual
      if (user.password) {
        if (!currentPassword)
          return Response.json({ error: "Informe a senha atual." }, { status: 400 });
        if (!(await Bun.password.verify(currentPassword, user.password)))
          return Response.json({ error: "Senha atual incorreta." }, { status: 401 });
      }

      const hash = await Bun.password.hash(newPassword);
      await users.updateOne({ _id: user._id }, { $set: { password: hash } });
      return Response.json({ ok: true });
    },

    // ── Desvincular provedor OAuth ────────────────────────────────────────────

    "/auth/unlink-provider": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ token?: string; provider?: string }>(req, 8 * 1024);
      if (body instanceof Response) return body;
      const { token, provider } = body;
      const sess = await getSession(token ?? "");
      if (!sess) return Response.json({ error: "Não autenticado." }, { status: 401 });
      if (provider !== "google" && provider !== "github")
        return Response.json({ error: "Provedor inválido." }, { status: 400 });

      const user = await users.findOne({ _id: new ObjectId(sess.userId) }) as UserDoc | null;
      if (!user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

      // Garante que não vai ficar sem forma de login
      const otherProvider = provider === "google" ? "githubId" : "googleId";
      if (!user.password && !user[otherProvider])
        return Response.json({ error: "Vincule outro método de login antes de desvincular." }, { status: 400 });

      const field = provider === "google" ? "googleId" : "githubId";
      await users.updateOne({ _id: user._id }, { $unset: { [field]: "" } });
      return Response.json({ ok: true });
    },

    // ── Admin Commands ────────────────────────────────────────────────────────

    "/admin/cmd": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{
        token?: string;
        command?: string;
        username?: string;
        amount?: number;
        text?: string;
      }>(req, 16 * 1024);
      if (body instanceof Response) return body;
      const sess = await getSession(body.token ?? "");
      if (!sess || !sess.isAdmin)
        return Response.json({ error: "Forbidden" }, { status: 403 });

      const { command } = body;

      if (command === "give_coins") {
        const { username, amount } = body;
        if (!username || typeof amount !== "number")
          return Response.json({ error: "username e amount obrigatórios" }, { status: 400 });
        const result = await users.updateOne(
          { username },
          { $inc: { coins: Math.floor(amount) } },
          { collation: { locale: "en", strength: 2 } },
        );
        if (result.matchedCount === 0)
          return Response.json({ error: "Usuário não encontrado" }, { status: 404 });
        return Response.json({ ok: true });
      }

      if (command === "kick") {
        const { username } = body;
        if (!username)
          return Response.json({ error: "username obrigatório" }, { status: 400 });
        let kicked = false;
        for (const [, p] of players) {
          if (p.name.toLowerCase() === username.toLowerCase()) {
            for (const [, ws] of activeWsByUserId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if ((ws as any).data?.id === p.id) {
                try { ws.send(JSON.stringify({ type: "kicked" })); } catch { /**/ }
                try { ws.close(); } catch { /**/ }
                kicked = true;
                break;
              }
            }
            break;
          }
        }
        return kicked
          ? Response.json({ ok: true })
          : Response.json({ error: "Jogador não encontrado online" }, { status: 404 });
      }

      if (command === "broadcast") {
        const text = body.text;
        if (!text)
          return Response.json({ error: "text obrigatório" }, { status: 400 });
        server.publish(
          "game",
          JSON.stringify({
            type: "chat",
            id: "system",
            name: "⚙ Sistema",
            color: "#FF4444",
            text: String(text).slice(0, 200),
          }),
        );
        return Response.json({ ok: true });
      }

      if (command === "set_admin") {
        const { username, amount } = body;
        if (!username)
          return Response.json({ error: "username obrigatório" }, { status: 400 });
        const grant = amount !== 0; // amount=1 → conceder, amount=0 → revogar
        const result = await users.updateOne(
          { username },
          { $set: { isAdmin: grant } },
          { collation: { locale: "en", strength: 2 } },
        );
        if (result.matchedCount === 0)
          return Response.json({ error: "Usuário não encontrado" }, { status: 404 });
        // Atualiza sessões ativas desse usuário no DB
        await sessionsColl.updateMany({ username }, { $set: { isAdmin: grant } });
        return Response.json({ ok: true, isAdmin: grant });
      }

      return Response.json({ error: "Comando desconhecido" }, { status: 400 });
    },

    // ── Placed Objects ────────────────────────────────────────────────────────

    "/objects": async (req: Request) => {
      if (req.method !== "GET")
        return new Response("Method Not Allowed", { status: 405 });
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const sess = await getSession(token);
      if (!sess) return new Response("Unauthorized", { status: 401 });

      const objs = await placedObjects
        .find({
          $or: [
            { type: "bancada_comunitaria" },
            { type: "bancada_individual", owner: sess.username },
          ],
        })
        .limit(MAX_PLACED_OBJECTS_PER_RESPONSE)
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
      const body = await parseJsonBody<{
        token?: string;
        type?: string;
        col?: number;
        row?: number;
      }>(req, 16 * 1024);
      if (body instanceof Response) return body;
      const sess = await getSession(body.token ?? "");
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
      const sess = await getSession(token);
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

    // ── MercadoPago ───────────────────────────────────────────────────────────

    "/mp/checkout": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{ token?: string }>(req, 8 * 1024);
      if (body instanceof Response) return body;
      const { token } = body;
      const sess = await getSession(token ?? "");
      if (!sess) return Response.json({ error: "Não autenticado." }, { status: 401 });

      const origin = req.headers.get("origin") ?? "http://localhost:9400";
      try {
        const preference = await new Preference(mp).create({
          body: {
            external_reference: sess.userId,
            items: [
              {
                id: "coins_500",
                title: "500 moedas — Cowboy Game",
                description: "Pacote de 500 moedas para usar na loja do Cowboy Game",
                category_id: "entertainment",
                quantity: 1,
                unit_price: 10,
                currency_id: "BRL",
              },
            ],
            metadata: { userId: sess.userId, username: sess.username },
            back_urls: {
              success: `${origin}/?payment=success`,
              failure: `${origin}/?payment=cancelled`,
              pending: `${origin}/?payment=pending`,
            },
            ...(APP_URL ? { notification_url: `${APP_URL}/mp/webhook` } : {}),
          },
        });
        return Response.json({ url: preference.init_point });
      } catch (err) {
        console.error("[MP] checkout error:", err);
        const msg = err instanceof Error ? err.message : "Erro ao criar preferência de pagamento.";
        return Response.json({ error: msg }, { status: 502 });
      }
    },

    "/mp/webhook": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });

      const rawBody = await readLimitedText(req, 64 * 1024);
      if (rawBody instanceof Response) return rawBody;
      let body: { type?: string; action?: string; data?: { id?: string } };
      try {
        body = JSON.parse(rawBody) as typeof body;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      // Valida assinatura HMAC se configurada (apenas loga se inválida — não rejeita)
      if (MP_WEBHOOK_SECRET) {
        const xSig = req.headers.get("x-signature") ?? "";
        const xReqId = req.headers.get("x-request-id") ?? "";
        const ts = xSig.split(",").find(p => p.startsWith("ts="))?.slice(3) ?? "";
        const dataId = body.data?.id ?? "";
        const manifest = `id:${dataId};request-id:${xReqId};ts:${ts}`;
        const hmac = new Bun.CryptoHasher("sha256", MP_WEBHOOK_SECRET);
        hmac.update(manifest);
        const expected = hmac.digest("hex");
        const received = xSig.split(",").find(p => p.startsWith("v1="))?.slice(3) ?? "";
        if (expected !== received) {
          console.warn("[MP] webhook signature mismatch (processando mesmo assim)");
        }
      }

      // Suporta tanto type="payment" quanto action="payment.updated"
      const isPaymentEvent =
        (body.type === "payment" || body.action === "payment.updated") &&
        body.data?.id;

      if (isPaymentEvent) {
        try {
          const payment = await new Payment(mp).get({ id: body.data!.id! });
          console.log("[MP] webhook payment:", JSON.stringify({
            status: payment.status,
            external_reference: payment.external_reference,
            metadata: payment.metadata,
          }));
          if (payment.status === "approved") {
            const meta = payment.metadata as Record<string, string> | undefined;
            const userId = meta?.user_id ?? meta?.userId ?? payment.external_reference ?? "";
            if (userId) {
              await users.updateOne(
                { _id: new ObjectId(userId) },
                { $inc: { coins: 500 } },
              );
              const ws = activeWsByUserId.get(userId);
              if (ws) {
                try {
                  ws.send(JSON.stringify({ type: "payment_success", coins: 500 }));
                } catch { /**/ }
              }
            }
          }
        } catch (err) {
          console.error("[MP] webhook payment fetch error:", err);
        }
      } else {
        console.log("[MP] webhook ignorado:", JSON.stringify({ type: body.type, action: body.action }));
      }

      return new Response("OK");
    },

    "/auth/save": async (req: Request) => {
      if (req.method !== "POST")
        return new Response("Method Not Allowed", { status: 405 });
      const body = await parseJsonBody<{
        token?: string;
        basedCount?: number;
        discovered?: string[];
        discoveredNPCs?: string[];
        capturedByType?: Record<string, number>;
        basedCowTypes?: string[];
        coins?: number;
        inventory?: Record<string, number>;
      }>(req, 32 * 1024);
      if (body instanceof Response) return body;
      const sess = await getSession(body.token ?? "");
      if (!sess) return new Response("Unauthorized", { status: 401 });

      await users.updateOne(
        { _id: new ObjectId(sess.userId) },
        {
          $set: {
            basedCount: clampNonNegativeInt(body.basedCount, MAX_BASED_COWS),
            discoveredTypes: clampStringArray(body.discovered, MAX_PROFILE_LIST_ITEMS),
            discoveredNPCs: clampStringArray(body.discoveredNPCs, MAX_PROFILE_LIST_ITEMS),
            capturedByType: clampNumberRecord(body.capturedByType, MAX_PROFILE_LIST_ITEMS),
            basedCows: clampStringArray(body.basedCowTypes, MAX_BASED_COWS),
            coins: clampNonNegativeInt(body.coins),
            inventory: clampNumberRecord(body.inventory, MAX_INVENTORY_ITEMS),
          },
        },
      );
      return new Response("OK");
    },

    // ── Assets ───────────────────────────────────────────────────────────────

    "/sprites/*": async (req: Request) => {
      const url = new URL(req.url);
      const response = await assetResponse(url.pathname);
      if (response) return response;
      return new Response("Not Found", { status: 404 });
    },

    "/sounds/*": async (req: Request) => {
      const url = new URL(req.url);
      const response = await assetResponse(url.pathname);
      if (response) return response;
      return new Response("Not Found", { status: 404 });
    },

    // ── WebSocket ─────────────────────────────────────────────────────────────

    "/ws": async (req: Request) => {
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const sess = await getSession(token);
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
    idleTimeout: 120,
    maxPayloadLength: MAX_WS_MESSAGE_BYTES,
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

      const savedTypeIds = clampStringArray(row?.basedCows, MAX_BASED_COWS);
      const savedBasedPositions = savedTypeIds.map((_, i) => userSlotToPos(i));

      // Carrega bancadas comunitárias existentes para enviar ao novo jogador
      const communityBenches = await placedObjects
        .find({ type: "bancada_comunitaria" })
        .limit(MAX_PLACED_OBJECTS_PER_RESPONSE)
        .toArray();

      // Verificar novamente após segundo await
      if (activeWsByUserId.get(userId) !== ws) return;

      const choppedTreeDocs = await choppedTreesColl
        .find({})
        .project({ col: 1, row: 1, choppedAt: 1 })
        .limit(MAX_CHOPPED_TREES_PER_RESPONSE)
        .toArray();

      // Check again after await
      if (activeWsByUserId.get(userId) !== ws) return;

      const recentChat = await chatMessages
        .find({})
        .sort({ sentAt: 1 })
        .limit(50)
        .toArray();

      // Check again after await
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
          choppedTrees: choppedTreeDocs.map((t) => ({ col: t.col, row: t.row })),
          birthdayParabensCount,
          chatHistory: recentChat.map((m) => ({
            id: m.playerId,
            name: m.name,
            color: m.color,
            text: m.text,
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
      if (typeof msg !== "string" || msg.length > MAX_WS_MESSAGE_BYTES) return;
      try {
        const u = JSON.parse(msg);

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
          const freeSlots = Math.max(0, MAX_BASED_COWS - player.basedCows.length);
          if (freeSlots === 0) return;
          const typeIds = (u.typeIds as unknown[])
            .filter((t): t is string => typeof t === "string")
            .slice(0, freeSlots);
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
                basedCount: clampNonNegativeInt(u.basedCount, MAX_BASED_COWS),
                discoveredTypes: clampStringArray(u.discovered, MAX_PROFILE_LIST_ITEMS),
                discoveredNPCs: clampStringArray(u.discoveredNPCs, MAX_PROFILE_LIST_ITEMS),
                capturedByType: clampNumberRecord(u.capturedByType, MAX_PROFILE_LIST_ITEMS),
                basedCows: clampStringArray(u.basedCowTypes, MAX_BASED_COWS),
                coins: clampNonNegativeInt(u.coins),
                inventory: clampNumberRecord(u.inventory, MAX_INVENTORY_ITEMS),
              },
            },
          );
        } else if (
          u.type === "tree_chop" &&
          typeof u.col === "number" &&
          typeof u.row === "number"
        ) {
          const col = Math.floor(u.col);
          const row = Math.floor(u.row);
          if (col < 0 || row < 0 || col >= 80 || row >= 80) return;
          try {
            await choppedTreesColl.insertOne({
              col,
              row,
              choppedAt: new Date(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          } catch {
            // duplicate key — already chopped, ignore
            return;
          }
          server.publish(
            "game",
            JSON.stringify({ type: "tree_chop", col, row }),
          );
        } else if (
          u.type === "tree_regrow" // clients don't send this, but ignore
        ) {
          // server-only
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
        } else if (u.type === "birthday_parabens") {
          birthdayParabensCount++;
          server.publish("game", JSON.stringify({ type: "birthday_count", count: birthdayParabensCount }));
          ws.send(JSON.stringify({ type: "birthday_count", count: birthdayParabensCount }));
          gameState.updateOne(
            { _id: "birthdayParabensCount" },
            { $set: { value: birthdayParabensCount } },
            { upsert: true },
          ).catch(() => { /* silencioso */ });
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

// Regrow trees every minute: remove chopped trees older than 1 hour
setInterval(async () => {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
  const expired = await choppedTreesColl
    .find({ choppedAt: { $lt: cutoff } })
    .project({ col: 1, row: 1 })
    .limit(TREE_REGROW_BATCH_SIZE)
    .toArray();
  if (expired.length === 0) return;
  await choppedTreesColl.deleteMany({ _id: { $in: expired.map((tree) => tree._id) } });
  for (const tree of expired) {
    server.publish(
      "game",
      JSON.stringify({ type: "tree_regrow", col: tree.col, row: tree.row }),
    );
  }
}, 60_000);

console.log(`🤠 Cowboy Game rodando em ${server.url}`);
