import {
  TILE_W,
  TILE_H,
  MAP_COLS,
  MAP_ROWS,
  BASE_COL,
  BASE_ROW,
  BASE_SIZE,
  BASE_SLOT_COLS,
  BASE_SLOT_GAP,
  COW_COUNT,
  PLAYER_SPEED,
  COW_WANDER_SPEED,
  COW_FLEE_SPEED,
  HERD_FOLLOW_SPEED,
  HERD_SPACING,
  CAPTURE_DIST,
  LASSO_TIME_LIMIT,
  LASSO_THROW_DURATION,
  RARITY_COLORS,
  RARITY_LABELS,
  STAKE_RANGE,
  STAKE_FLY_SPEED,
  STAKE_PULL_SPEED,
  VENDOR_COL,
  VENDOR_ROW,
  VENDOR_INTERACT_DIST,
  COW_SELL_PRICES,
  TREE_CHOP_DIST,
  WOOD_DROP_MIN,
  WOOD_DROP_MAX,
  WOOD_MAX_STACK,
  TREE_REGROW_TIME,
  STONE_HARVEST_DIST,
  STONE_DROP_MIN,
  STONE_DROP_MAX,
  STONE_MAX_STACK,
  CHOP_CLICKS_NEEDED,
  CHOP_TIME_LIMIT,
  MAX_INVENTORY_SLOTS,
} from "./constants";

function basedSlotPos(slot: number) {
  return {
    col: BASE_COL + 0.5 + (slot % BASE_SLOT_COLS) * BASE_SLOT_GAP,
    row: BASE_ROW + 0.5 + Math.floor(slot / BASE_SLOT_COLS) * BASE_SLOT_GAP,
  };
}

import { type Tile, type TileType, generateMap, isObstacle } from "./mapGen";
import { type CowType, COW_TYPES, randomCowType } from "./cowTypes";
import { sprites } from "./sprites";
import { toggleMusic, isMusicEnabled, setNightMode } from "./music";
import {
  Network,
  type RemotePlayer,
  type ChatMessage,
  type PlacedObject,
} from "./network";
import { type UserData, saveGameState, logout, buyPremium } from "./auth";
import { type GameItem, SHOP_ITEMS, itemNextPrice } from "./items";

interface NPCEntry {
  id: string;
  name: string;
  role: string;
  description: string;
  spriteKey: string;
}

const NPC_ENTRIES: NPCEntry[] = [
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

interface Player {
  col: number;
  row: number;
  dirCol: number;
  dirRow: number;
  moving: boolean;
}

type CowState =
  | "wandering"
  | "fleeing"
  | "lassoed"
  | "captured"
  | "based"
  | "stolen";

interface Cow {
  id: number;
  col: number;
  row: number;
  state: CowState;
  type: CowType;
  wanderTimer: number;
  wanderDirCol: number;
  wanderDirRow: number;
  herdIndex: number;
  sparkTimer: number; // for legendary fx
}

interface Lasso {
  active: boolean;
  cow: Cow | null;
  phase: "throwing" | "pulling" | "fail";
  throwT: number;
  clickCount: number;
  timeLeft: number;
  flashTimer: number;
}

interface Joystick {
  active: boolean;
  touchId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

interface TouchScroll {
  active: boolean;
  touchId: number;
  startY: number;
  lastY: number;
  target: "shop" | "inventory" | "chat" | "book" | null;
}

type StakePhase = "idle" | "aiming" | "flying" | "anchored" | "pulling";
interface StakeData {
  phase: StakePhase;
  targetCol: number;
  targetRow: number;
  flyCol: number;
  flyRow: number;
  pullStartCol: number;
  pullStartRow: number;
  pullT: number;
  pullDist: number;
}

// ── Bandit constants ──────────────────────────────────────────────────────────
const BANDIT_APPROACH_SPEED = 1.6;
const BANDIT_FLEE_SPEED = 2.4;
const BANDIT_SCARED_SPEED = 3.8;
const BANDIT_TUG_DECAY = 1.1; // units/sec pulled back by bandit automatically

interface Bandit {
  id: number;
  col: number;
  row: number;
  fleeCol: number;
  fleeRow: number;
  state: "approaching" | "fleeing" | "scared";
  targetCow: Cow | null;
}

function dist(
  a: { col: number; row: number },
  b: { col: number; row: number },
) {
  return Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2);
}

function spawnCow(id: number, map: Tile[][], nightMode = false): Cow {
  const minC = BASE_COL + BASE_SIZE + 4;
  let col: number, row: number;
  let tries = 0;
  do {
    col = minC + Math.random() * (MAP_COLS - minC - 4);
    row = minC + Math.random() * (MAP_ROWS - minC - 4);
    tries++;
  } while (tries < 30 && isObstacle(map[Math.floor(row)]![Math.floor(col)]!));
  return {
    id,
    col,
    row,
    state: "wandering",
    type: randomCowType(nightMode),
    wanderTimer: Math.random() * 3,
    wanderDirCol: 0,
    wanderDirRow: 0,
    herdIndex: -1,
    sparkTimer: 0,
  };
}

// ── Evento: Aniversário do Criador ───────────────────────────────────────────
const CAKE_COL = 12;
const CAKE_ROW = 7;
const CAKE_INTERACT_DIST = 2.5;
const BIRTHDAY_MONTH = 3; // Março
const BIRTHDAY_DAY_START = 10;
const BIRTHDAY_DAY_END = 31;
const PARABENS_MESSAGES = [
  "Que seus laços sejam eternamente certeiros e seu rebanho sempre lendário! 🐄🤠",
  "Que a vida te dê sempre mais do que o melhor bolo do sertão pode prometer! 🌵🎉",
  "Que cada dia seja uma nova vaca rara pra adicionar na sua coleção! 🌟🎂",
  "Que seus pastos sejam verdes, seu rebanho imenso e seus boletos inexistentes! 🤣🎊",
  "Que o horizonte seja sempre o começo de uma nova aventura, vaqueiro! 🌅🐂",
];

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: Tile[][];
  private player: Player;
  private cows: Cow[];
  private basedCount = 0;
  private lasso: Lasso;
  private camX = 0;
  private camY = 0;
  private icons;
  private keys = new Set<string>();
  private joystick: Joystick = {
    active: false,
    touchId: -1,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
  };
  private touchScroll: TouchScroll = {
    active: false,
    touchId: -1,
    startY: 0,
    lastY: 0,
    target: null,
  };
  private lastTime = 0;
  private time = 0;
  private prevIsNight = false;
  private readonly DEBUG_FORCE_PERIOD: "manha" | "tarde" | "noite" | null =
    null;
  private isPreview = false;
  private rafId = 0;
  private network?: Network;
  private remotePlayers = new Map<string, RemotePlayer>();
  private remoteCowsInBase = new Map<
    string,
    { color: string; cows: Array<{ col: number; row: number }> }
  >();
  private myId = "";
  private myColor = "#3a5a9f";
  private myName = "Cowboy";
  private myToken = "";
  private netSendTimer = 0;
  private saveTimer = 60;
  private cowSpawnTimer = 45; // tempo até o próximo spawn de vaca
  private nextCowId = COW_COUNT;
  private placedObjects: PlacedObject[] = [];
  private placementMode: string | null = null; // itemId da bancada sendo posicionada
  private mouseTileCol = 0;
  private mouseTileRow = 0;
  private benchHubOpen = false;
  private activeBench: PlacedObject | null = null;
  private benchHubCloseBtn = { x: 0, y: 0, r: 0 };
  private benchPickupBtn = { x: 0, y: 0, w: 0, h: 0 };
  private benchInteractBtn = { x: 0, y: 0, w: 0, h: 0 };
  private benchCollectBtn = { x: 0, y: 0, w: 0, h: 0 };
  private inventoryPlaceBtns: Array<{
    item: GameItem;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private inventoryUseBtns: Array<{
    item: GameItem;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private leiteTimer = 0; // segundos restantes do leite fluorescente
  private chatMessages: Array<ChatMessage & { time: number }> = [];
  private chatOpen = false;
  private chatInput?: HTMLInputElement;
  private myLastMessage = "";
  private myLastMessageTime = 0;
  private bookOpen = false;
  private bandits: Bandit[] = [];
  private nextBanditId = 0;
  private banditSpawnTimer = 60;
  private banditAnimFrame = 0;
  private banditAnimTimer = 0;
  // 'manha' incluído para teste — remover após validação
  private readonly BANDIT_ACTIVE_PERIODS: ReadonlyArray<
    "manha" | "tarde" | "noite"
  > = ["noite"];
  private bookPage = 0; // page index currently displayed
  private bookPageTarget = 0; // page we are flipping towards
  private bookPageAnimT = 1; // 0 = flip in progress, 1 = settled
  private bookTab: "vacas" | "itens" | "personagens" = "vacas";
  private discoveredNPCs = new Set<string>();
  private chatHistoryScroll = 0; // msgs scrolled up from bottom (0 = at bottom)
  private statsMinimized = false;
  private discovered = new Set<string>();
  private capturedByType = new Map<string, number>();
  private coins = 0;
  private inventory = new Map<string, number>(); // itemId → level
  private choppedTrees = new Map<string, number>(); // "col,row" → regrowth timer (secs)
  private chopFlash = 0; // flash timer ao cortar
  private chop = {
    active: false,
    col: 0,
    row: 0,
    clickCount: 0,
    timeLeft: 0,
    flashTimer: 0,
  };
  private benchCraftBtns: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
  private itemIcons = new Map<string, HTMLImageElement>(); // cache de imagens de itens
  private shopOpen = false;
  private vendorDialog: {
    active: boolean;
    text: string;
    displayed: number;
    timer: number;
    done: boolean;
  } = { active: false, text: "", displayed: 0, timer: 0, done: false };
  private vendorMet = false;
  private shopTab: "sell" | "buy" = "sell";
  private shopSellButtons: Array<{
    cow: Cow;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private shopSellBasedButtons: Array<{
    cow: Cow;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private shopSellAllHerdBtn = { x: 0, y: 0, w: 0, h: 0 };
  private shopSellAllBasedBtn = { x: 0, y: 0, w: 0, h: 0 };
  private shopBuyButtons: Array<{
    item: GameItem;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private shopTabBtns: Array<{
    tab: "sell" | "buy";
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private shopCloseBtn = { x: 0, y: 0, r: 0 };
  private shopBuyScroll = 0;
  private shopBuyContentArea = { x: 0, y: 0, w: 0, h: 0 };

  // Inventário
  private inventoryOpen = false;
  private inventoryCloseBtn = { x: 0, y: 0, r: 0 };
  private inventoryScroll = 0;
  private inventoryContentArea = { x: 0, y: 0, w: 0, h: 0 };
  private inventoryDropBtns: Array<{
    item: GameItem;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private inventoryTradeBtns: Array<{
    item: GameItem;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];

  // Sistema de troca
  private tradeState: "idle" | "selecting" | "waiting" | "incoming" | "result" =
    "idle";
  private tradeItem: GameItem | null = null;
  private tradeItemLevel = 0;
  private tradeIncoming: {
    fromId: string;
    fromName: string;
    fromColor: string;
    item: GameItem;
    level: number;
  } | null = null;
  private tradePlayerBtns: Array<{
    playerId: string;
    name: string;
    color: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  private tradeAcceptBtn = { x: 0, y: 0, w: 0, h: 0 };
  private tradeDeclineBtn = { x: 0, y: 0, w: 0, h: 0 };
  private tradeCancelBtn = { x: 0, y: 0, w: 0, h: 0 };
  private tradeResultMsg = "";
  private tradeResultTimer = 0;

  // Events
  private birthdayForceState: "on" | "off" | null = null;
  private birthdaySentParabens = false;
  private birthdayParabensCount = 0;
  private birthdayDialogOpen = false;
  private birthdayConfirmBtn = { x: 0, y: 0, w: 0, h: 0 };
  private birthdayCloseBtn = { x: 0, y: 0, w: 0, h: 0 };
  private cakeBobbingTimer = 0;
  private birthdayParticles: Array<{
    x: number; y: number; vx: number; vy: number;
    color: string; life: number; maxLife: number; size: number;
  }> = [];
  private eventPopupDismissed = !!sessionStorage.getItem("cowboy_bday_popup_seen");
  private eventPopupTimer = 10;
  private eventPopupCloseBtn = { x: 0, y: 0, w: 0, h: 0 };

  // Admin
  private isAdmin = false;
  private adminCmdOpen = false;
  private adminCmdInput?: HTMLInputElement;
  private adminCmdResult = "";
  private adminCmdResultTimer = 0;
  private adminGodMode = false;
  private adminForcePeriod: "manha" | "tarde" | "noite" | null = null;

  // Stake (grappling hook)
  private stake: StakeData = {
    phase: "idle",
    targetCol: 0,
    targetRow: 0,
    flyCol: 0,
    flyRow: 0,
    pullStartCol: 0,
    pullStartRow: 0,
    pullT: 0,
    pullDist: 1,
  };
  bookPageAnimDir!: number;

  constructor(canvas: HTMLCanvasElement, userData: UserData | null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.map = generateMap();
    this.player = { col: 12, row: 12, dirCol: 1, dirRow: 0, moving: false };

    if (!userData) {
      // Modo preview: apenas renderiza o mundo sem rede nem UI de jogo
      this.isPreview = true;
    } else {
      // Carrega dados persistidos do usuário
      this.myToken = userData.token;
      this.myColor = userData.color;
      this.myName = userData.username;
      this.isAdmin = userData.isAdmin ?? false;
      this.birthdaySentParabens = !!localStorage.getItem("cowboy_parabens_2025");
      // basedCows é a fonte de verdade — não usa basedCount da DB (pode estar desatualizado)
      this.basedCount = userData.basedCows?.length ?? userData.basedCount;
      this.discovered = new Set(userData.discovered);
      this.discoveredNPCs = new Set(userData.discoveredNPCs ?? []);
      this.vendorMet = this.discoveredNPCs.has("vendedor");
      this.capturedByType = new Map(Object.entries(userData.capturedByType));
      // Coins: server é a fonte de verdade; localStorage é fallback se o server retornar 0
      const serverCoins = userData.coins ?? 0;
      const localCoins = Number(
        localStorage.getItem(`cowboy_coins_${userData.username}`) ?? "0",
      );
      this.coins = serverCoins > 0 ? serverCoins : localCoins;
      this.inventory = new Map(Object.entries(userData.inventory ?? {}));
    }
    this.cows = Array.from({ length: COW_COUNT }, (_, i) =>
      spawnCow(i, this.map),
    );
    // Restaura vacas que estavam na base ao deslogar
    if (userData?.basedCows && userData.basedCows.length > 0) {
      userData.basedCows.forEach((typeId, i) => {
        const cowType = COW_TYPES.find((t) => t.id === typeId) ?? COW_TYPES[0]!;
        const pos = basedSlotPos(i);
        this.cows.push({
          id: COW_COUNT + i,
          col: pos.col,
          row: pos.row,
          state: "based",
          type: cowType,
          wanderTimer: 0,
          wanderDirCol: 0,
          wanderDirRow: 0,
          herdIndex: i,
          sparkTimer: 0,
        });
      });
      this.nextCowId = COW_COUNT + userData.basedCows.length;
    }
    this.lasso = {
      active: false,
      cow: null,
      phase: "throwing",
      throwT: 0,
      clickCount: 0,
      timeLeft: 0,
      flashTimer: 0,
    };
    this.icons = {
      pull: new Image(),
      base: new Image(),
      cowboy: new Image(),
      bookIcon: new Image(),
      stakeIcon: new Image(),
      eyeIcon: new Image(),
      spaceKey: new Image(),
      trunkIcon: new Image(),
      moneyIcon: new Image(),
      benchIcon: new Image(),
      axeIcon: new Image(),
    };

    this.icons.bookIcon.src = "/sprites/hud/icons/book_icon.png";
    this.icons.stakeIcon.src = "/sprites/hud/icons/stake_icon.png";
    this.icons.eyeIcon.src = "/sprites/hud/icons/eye_icon.png";
    this.icons.trunkIcon.src = "/sprites/hud/icons/backpack_icon.png";
    this.icons.pull.src = "/sprites/hud/icons/lasso_icon.png";
    this.icons.base.src = "/sprites/hud/icons/key_icon.png";
    this.icons.cowboy.src = "/sprites/hud/icons/lasso_icon.png";
    this.icons.spaceKey.src = "/sprites/hud/icons/space_key_icon.png";
    this.icons.moneyIcon.src = "/sprites/hud/icons/money_icon.png";
    this.icons.benchIcon.src = "/sprites/itens/individual_workbanch.png";
    this.icons.axeIcon.src = "/sprites/hud/icons/axe_icon.png";

    // Pre-load item icons that are image paths
    for (const item of SHOP_ITEMS) {
      if (item.icon.includes("/") || item.icon.endsWith(".png")) {
        const img = new Image();
        // Normaliza o path: remove "public/" do início se existir
        let iconPath = item.icon.replace(/^public\//, "");
        // Garante que começa com /
        if (!iconPath.startsWith("/")) iconPath = "/" + iconPath;
        img.src = iconPath;
        this.itemIcons.set(item.id, img);
      }
    }

    this.statsMinimized = window.innerWidth < 500;
    if (!this.isPreview) this.setupChatInput();
    if (!this.isPreview && this.isAdmin) this.setupAdminInput();
    this.setupInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.preloadPlayerSprites();

    if (!this.isPreview) {
      // Rede multiplayer
      this.network = new Network();
      this.network.connect(userData!.token, {
        onInit: (id, _color, _name, existing, birthdayCount) => {
          this.myId = id;
          this.birthdayParabensCount = birthdayCount;
          // color e name já foram carregados do login — não sobrescreve
          for (const p of existing) this.remotePlayers.set(p.id, p);
        },
        onJoin: (p) => {
          this.remotePlayers.set(p.id, p);
        },
        onMove: (u) => {
          const p = this.remotePlayers.get(u.id);
          if (p) Object.assign(p, u);
        },
        onLeave: (id) => {
          this.remotePlayers.delete(id);
          // Vacas no curral permanecem visíveis mesmo após desconexão
        },
        onCowBased: (batch) => {
          if (batch.id === this.myId) {
            // Aplica posições canônicas do servidor nas vacas locais no curral
            const localBased = this.cows
              .filter((c) => c.state === "based")
              .sort((a, b) => a.herdIndex - b.herdIndex);
            batch.cows.forEach((pos, i) => {
              if (localBased[i]) {
                localBased[i]!.col = pos.col;
                localBased[i]!.row = pos.row;
              }
            });
          } else {
            // Vacas de outro jogador — armazena para renderização
            this.remoteCowsInBase.set(batch.id, {
              color: batch.color,
              cows: batch.cows,
            });
          }
        },
        onChat: (msg) => {
          this.chatMessages.push({ ...msg, time: Date.now() });
          if (this.chatMessages.length > 50) this.chatMessages.shift();
          // Atualiza a última mensagem do jogador para exibir acima da cabeça
          const player = this.remotePlayers.get(msg.id);
          if (player) {
            player.lastMessage = msg.text;
            player.lastMessageTime = Date.now();
          }
        },
        onKicked: () => {
          localStorage.removeItem("cowboy_token");
          alert(
            "Sua conta foi acessada em outro dispositivo. Você foi desconectado.",
          );
          location.reload();
        },
        onTradeOffer: (offer) => {
          const item = SHOP_ITEMS.find((it) => it.id === offer.itemId);
          if (!item) return;
          this.tradeIncoming = { ...offer, item };
          this.tradeState = "incoming";
          this.inventoryOpen = true; // abre inventário para mostrar a oferta
        },
        onTradeAccepted: (_fromId) => {
          // Transferir item para o outro jogador
          if (this.tradeItem) {
            const cur = this.inventory.get(this.tradeItem.id) ?? 0;
            if (cur <= 1) this.inventory.delete(this.tradeItem.id);
            else this.inventory.set(this.tradeItem.id, cur - 1);
          }
          this.tradeResultMsg = "✅ Troca realizada!";
          this.tradeState = "result";
          this.tradeResultTimer = 2.5;
          this.tradeItem = null;
          this.triggerSave();
        },
        onTradeDeclined: (_fromId) => {
          this.tradeResultMsg = "❌ Troca recusada.";
          this.tradeState = "result";
          this.tradeResultTimer = 2.0;
          this.tradeItem = null;
        },
        onObjectPlaced: (obj) => {
          // Evita duplicatas (ex: se o próprio jogador já adicionou localmente)
          if (!this.placedObjects.find((o) => o.id === obj.id)) {
            this.placedObjects.push(obj);
          }
        },
        onObjectRemoved: (id) => {
          this.placedObjects = this.placedObjects.filter((o) => o.id !== id);
        },
        onChoppedTreesInit: (trees) => {
          for (const { col, row } of trees) {
            const key = `${col},${row}`;
            this.choppedTrees.set(key, 0);
            if (this.map[row]?.[col]) this.map[row]![col]!.decoration = "none";
          }
        },
        onTreeChopped: ({ col, row }) => {
          const key = `${col},${row}`;
          this.choppedTrees.set(key, 0);
          if (this.map[row]?.[col]) this.map[row]![col]!.decoration = "none";
        },
        onTreeRegrown: ({ col, row }) => {
          const key = `${col},${row}`;
          this.choppedTrees.delete(key);
          if (this.map[row]?.[col]) this.map[row]![col]!.decoration = "tree";
        },
        onPaymentSuccess: (coins) => {
          this.coins += coins;
          this.chatMessages.push({
            id: "system",
            name: "⚙ Sistema",
            color: "#FFD700",
            text: `🎉 Pagamento recebido! +${coins} moedas`,
            time: Date.now(),
          });
        },
        onBirthdayCount: (count) => {
          this.birthdayParabensCount = count;
        },
      });

      this.loadPlacedObjects();

      window.addEventListener("beforeunload", () => {
        // sendBeacon garante entrega mesmo ao fechar a aba (fetch seria cancelado)
        const payload = JSON.stringify({
          token: this.myToken,
          basedCount: this.basedCount,
          discovered: [...this.discovered],
          discoveredNPCs: [...this.discoveredNPCs],
          capturedByType: Object.fromEntries(this.capturedByType),
          basedCowTypes: this.cows
            .filter((c) => c.state === "based")
            .sort((a, b) => a.herdIndex - b.herdIndex)
            .map((c) => c.type.id),
          coins: this.coins,
          inventory: Object.fromEntries(this.inventory),
        });
        navigator.sendBeacon(
          "/auth/save",
          new Blob([payload], { type: "application/json" }),
        );
      });
    } // end if (!this.isPreview)
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.chatInput?.remove();
    this.adminCmdInput?.remove();
  }

  addSystemMessage(text: string) {
    this.chatMessages.push({
      id: "system",
      name: "⚙ Sistema",
      color: "#FFD700",
      text,
      time: Date.now(),
    });
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private setupChatInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Mensagem... (Enter=enviar, Esc=fechar)";
    input.maxLength = 200;
    Object.assign(input.style, {
      position: "fixed",
      bottom: "130px",
      left: "10px",
      width: "260px",
      padding: "6px 10px",
      background: "rgba(30,15,4,0.92)",
      border: "2px solid #9b7e57",
      borderRadius: "3px",
      color: "#FFE0A0",
      font: "13px sans-serif",
      outline: "none",
      display: "none",
      zIndex: "10",
      boxSizing: "border-box",
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = input.value.trim();
        if (text) {
          this.network?.sendChat(text);
          this.myLastMessage = text;
          this.myLastMessageTime = Date.now();
        }
        input.value = "";
      } else if (e.key === "Escape") {
        this.closeChatInput();
      }
    });
    // Sem blur automático — fechamento controlado pelo canvas
    document.body.appendChild(input);
    this.chatInput = input;
  }

  private openChatInput() {
    if (!this.chatInput) return;
    this.chatOpen = true;
    this.chatInput.style.bottom = "155px";
    this.chatInput.style.left = "10px";
    this.chatInput.style.width = "300px";
    this.chatInput.style.display = "block";
    this.chatInput.value = "";
    this.chatInput.focus();
  }

  private closeChatInput() {
    if (!this.chatInput) return;
    this.chatOpen = false;
    this.chatInput.style.display = "none";
  }

  // ─── Admin command bar ────────────────────────────────────────────────────

  private setupAdminInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Comando admin... (Enter=executar, Esc=fechar, /help)";
    input.maxLength = 300;
    Object.assign(input.style, {
      position: "fixed",
      bottom: "10px",
      left: "10px",
      width: "calc(100% - 20px)",
      padding: "8px 12px",
      background: "rgba(40,3,3,0.96)",
      border: "2px solid #cc2222",
      borderRadius: "4px",
      color: "#FF9980",
      font: "bold 13px monospace",
      outline: "none",
      display: "none",
      zIndex: "20",
      boxSizing: "border-box",
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = input.value.trim();
        if (text) this.executeAdminCmd(text);
        input.value = "";
        this.closeAdminCmd();
      } else if (e.key === "Escape" || e.key === "`") {
        this.closeAdminCmd();
        e.preventDefault();
      }
    });
    document.body.appendChild(input);
    this.adminCmdInput = input;
  }

  private openAdminCmd() {
    if (!this.adminCmdInput) return;
    this.adminCmdOpen = true;
    this.adminCmdInput.style.display = "block";
    this.adminCmdInput.value = "";
    this.adminCmdInput.focus();
  }

  private closeAdminCmd() {
    if (!this.adminCmdInput) return;
    this.adminCmdOpen = false;
    this.adminCmdInput.style.display = "none";
  }

  private executeAdminCmd(raw: string) {
    const parts = raw.trim().split(/\s+/);
    const cmd = (parts[0] ?? "").toLowerCase().replace(/^\//, "");

    const ok = (msg: string) => {
      this.adminCmdResult = `✅ ${msg}`;
      this.adminCmdResultTimer = 3;
    };
    const err = (msg: string) => {
      this.adminCmdResult = `❌ ${msg}`;
      this.adminCmdResultTimer = 3;
    };

    if (cmd === "tp" || cmd === "teleport") {
      const col = parseFloat(parts[1] ?? "");
      const row = parseFloat(parts[2] ?? "");
      if (isNaN(col) || isNaN(row)) { err("Uso: /tp <col> <row>"); return; }
      this.player.col = Math.max(0, Math.min(MAP_COLS - 1, col));
      this.player.row = Math.max(0, Math.min(MAP_ROWS - 1, row));
      ok(`Teletransportado para (${col}, ${row})`);

    } else if (cmd === "spawn") {
      const cow = spawnCow(this.nextCowId++, this.map, this.isNight);
      cow.col = this.player.col + 2;
      cow.row = this.player.row + 2;
      this.cows.push(cow);
      ok(`Vaca spawned: ${cow.type.id} em (${cow.col.toFixed(1)}, ${cow.row.toFixed(1)})`);

    } else if (cmd === "godmode" || cmd === "god") {
      this.adminGodMode = !this.adminGodMode;
      ok(`God mode: ${this.adminGodMode ? "ON" : "OFF"}`);

    } else if (cmd === "time") {
      const period = (parts[1] ?? "").toLowerCase();
      if (period === "day" || period === "dia" || period === "manha") {
        this.adminForcePeriod = "manha";
        ok("Hora forçada: manhã");
      } else if (period === "afternoon" || period === "tarde") {
        this.adminForcePeriod = "tarde";
        ok("Hora forçada: tarde");
      } else if (period === "night" || period === "noite") {
        this.adminForcePeriod = "noite";
        ok("Hora forçada: noite");
      } else if (period === "real" || period === "auto" || period === "reset") {
        this.adminForcePeriod = null;
        ok("Hora: automático");
      } else {
        err("Uso: /time <manha|tarde|noite|real>");
      }

    } else if (cmd === "setcoins") {
      const amount = parseInt(parts[1] ?? "");
      if (isNaN(amount) || amount < 0) { err("Uso: /setcoins <amount>"); return; }
      this.coins = amount;
      ok(`Coins definido: ${amount}`);

    } else if (cmd === "give") {
      const maybeNum = parseInt(parts[1] ?? "");
      if (!isNaN(maybeNum)) {
        this.coins += maybeNum;
        ok(`+${maybeNum} coins (total: ${this.coins})`);
      } else {
        const username = parts[1] ?? "";
        const amount = parseInt(parts[2] ?? "");
        if (!username || isNaN(amount)) { err("Uso: /give <amount> ou /give <username> <amount>"); return; }
        fetch("/admin/cmd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: this.myToken, command: "give_coins", username, amount }),
        }).then((r) => r.json()).then((d: { ok?: boolean; error?: string }) => {
          if (d.ok) { this.adminCmdResult = `✅ +${amount} coins → ${username}`; this.adminCmdResultTimer = 3; }
          else { this.adminCmdResult = `❌ ${d.error ?? "Erro"}`; this.adminCmdResultTimer = 3; }
        }).catch(() => { this.adminCmdResult = "❌ Erro de conexão"; this.adminCmdResultTimer = 3; });
        ok(`Enviando ${amount} coins para ${username}...`);
      }

    } else if (cmd === "kick") {
      const username = parts.slice(1).join(" ");
      if (!username) { err("Uso: /kick <username>"); return; }
      fetch("/admin/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: this.myToken, command: "kick", username }),
      }).then((r) => r.json()).then((d: { ok?: boolean; error?: string }) => {
        if (d.ok) { this.adminCmdResult = `✅ ${username} kickado`; this.adminCmdResultTimer = 3; }
        else { this.adminCmdResult = `❌ ${d.error ?? "Erro"}`; this.adminCmdResultTimer = 3; }
      }).catch(() => { this.adminCmdResult = "❌ Erro de conexão"; this.adminCmdResultTimer = 3; });
      ok(`Kickando ${username}...`);

    } else if (cmd === "broadcast" || cmd === "bc") {
      const text = parts.slice(1).join(" ");
      if (!text) { err("Uso: /broadcast <mensagem>"); return; }
      fetch("/admin/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: this.myToken, command: "broadcast", text }),
      }).then((r) => r.json()).then((d: { ok?: boolean; error?: string }) => {
        if (d.ok) { this.adminCmdResult = "✅ Broadcast enviado"; this.adminCmdResultTimer = 3; }
        else { this.adminCmdResult = `❌ ${d.error ?? "Erro"}`; this.adminCmdResultTimer = 3; }
      }).catch(() => { this.adminCmdResult = "❌ Erro de conexão"; this.adminCmdResultTimer = 3; });
      ok("Enviando broadcast...");

    } else if (cmd === "players") {
      const names = [...this.remotePlayers.values()].map((p) => p.name).join(", ");
      ok(`Online: ${names || "nenhum outro jogador"}`);

    } else if (cmd === "clearbase") {
      const based = this.cows.filter((c) => c.state === "based");
      for (const c of based) this.cows.splice(this.cows.indexOf(c), 1);
      this.basedCount = 0;
      ok(`Base limpa: ${based.length} vacas removidas`);

    } else if (cmd === "pos") {
      ok(`Posição: col=${this.player.col.toFixed(2)}, row=${this.player.row.toFixed(2)}`);

    } else if (cmd === "help") {
      ok("/tp /spawn /godmode /time /setcoins /give /kick /broadcast /players /clearbase /pos /event");

    } else if (cmd === "event") {
      const sub = (parts[1] ?? "").toLowerCase();
      if (sub === "list") {
        ok(`Eventos ativos: ${this.isBirthdayActive ? "birthday" : "nenhum"}`);
      } else if (sub === "birthday") {
        const state = (parts[2] ?? "").toLowerCase();
        if (state === "on") { this.birthdayForceState = "on"; ok("Evento birthday: ON"); }
        else if (state === "off") { this.birthdayForceState = "off"; ok("Evento birthday: OFF"); }
        else { err("Uso: /event birthday on|off"); }
      } else {
        err("Uso: /event list | /event birthday on|off");
      }

    } else {
      err(`Desconhecido: /${cmd} — use /help`);
    }
  }

  // ── Evento: Aniversário ─────────────────────────────────────────────────────

  private sendParabens() {
    if (this.birthdaySentParabens) return;
    this.birthdaySentParabens = true;
    localStorage.setItem("cowboy_parabens_2025", "1");
    const randomMsg = PARABENS_MESSAGES[Math.floor(Math.random() * PARABENS_MESSAGES.length)]!;
    const fullMsg = `🎂 ${this.myName} deseja: Feliz Aniversário ao criador! ${randomMsg}`;
    this.network?.sendChat(fullMsg);
    this.network?.sendBirthdayParabens();
    this.birthdayDialogOpen = false;
    this.spawnBirthdayConfetti();
  }

  private spawnBirthdayConfetti() {
    const W = this.canvas.width, H = this.canvas.height;
    const colors = ["#FF6B6B","#FFD700","#6BCB77","#4D96FF","#FF6BD6","#FFA07A","#C77DFF","#00F5D4"];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      this.birthdayParticles.push({
        x: W / 2 + (Math.random() - 0.5) * 60,
        y: H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        life: 1,
        maxLife: 0.8 + Math.random() * 1.5,
        size: 3 + Math.random() * 4,
      });
    }
  }

  private drawBirthdayCake() {
    const { ctx } = this;
    const t = this.cakeBobbingTimer;
    const bob = Math.sin(t * 2.2) * 2.5;
    const glow = 0.55 + Math.sin(t * 3.5) * 0.45;
    const atCake = this.isAtCake();

    const sx = (CAKE_COL - CAKE_ROW) * (TILE_W / 2) + this.camX;
    const sy = (CAKE_COL + CAKE_ROW) * (TILE_H / 2) + this.camY + bob - 22;

    ctx.save();
    ctx.shadowColor = atCake ? "#FFD700" : "#FFB6C1";
    ctx.shadowBlur = atCake ? 22 * glow : 10 * glow;

    // Plate
    ctx.fillStyle = "#c8902a";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 30, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bottom tier (chocolate)
    ctx.fillStyle = "#5C2A0A";
    ctx.fillRect(sx - 18, sy + 10, 36, 20);
    ctx.fillStyle = "#FFB6C1";
    ctx.beginPath();
    for (let i = -15; i < 18; i += 7) ctx.arc(sx + i, sy + 12, 4, Math.PI, 0);
    ctx.fill();

    // Middle tier
    ctx.fillStyle = "#8B1A1A";
    ctx.fillRect(sx - 13, sy - 2, 26, 14);
    ctx.fillStyle = "#FFFACD";
    ctx.beginPath();
    for (let i = -10; i < 13; i += 7) ctx.arc(sx + i, sy, 3.5, Math.PI, 0);
    ctx.fill();

    // Top tier
    ctx.fillStyle = "#D2B48C";
    ctx.fillRect(sx - 8, sy - 14, 16, 14);
    ctx.fillStyle = "#FFA07A";
    ctx.beginPath();
    for (let i = -5; i < 8; i += 6) ctx.arc(sx + i, sy - 12, 3, Math.PI, 0);
    ctx.fill();

    // Contador de parabéns
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFD700";
    ctx.font = `bold ${this.birthdayParabensCount >= 100 ? "7" : "9"}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(this.birthdayParabensCount), sx, sy + 20);

    // Candles (3)
    const candleXs = [-6, 0, 6];
    const candleColors = ["#FF6B6B", "#6BCB77", "#4D96FF"];
    for (let ci = 0; ci < 3; ci++) {
      const cx = sx + candleXs[ci]!;
      ctx.fillStyle = candleColors[ci]!;
      ctx.fillRect(cx - 2, sy - 26, 4, 12);
      const flicker = Math.sin(t * 12 + ci * 2.3) * 1.2;
      ctx.shadowColor = "#FF8800";
      ctx.shadowBlur = 7;
      ctx.fillStyle = "#FF8800";
      ctx.beginPath();
      ctx.ellipse(cx + flicker * 0.3, sy - 30, 2.5, 4, flicker * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFEE44";
      ctx.beginPath();
      ctx.ellipse(cx + flicker * 0.2, sy - 31, 1.3, 2.5, flicker * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (atCake) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.roundRect(sx - 62, sy - 56, 124, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎂 Pressione E", sx, sy - 46);
    }
    ctx.restore();
  }

  private renderBirthdayParticles() {
    if (this.birthdayParticles.length === 0) return;
    const { ctx } = this;
    ctx.save();
    for (const p of this.birthdayParticles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderEventPopup(W: number, H: number) {
    if (this.isPreview || this.eventPopupDismissed || !this.isBirthdayActive) return;
    const { ctx } = this;
    const PW = Math.min(440, W - 40);
    const PH = 215;
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2 - 20;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, W, H);
    this.drawPanel(PX, PY, PW, PH, 2);

    // Stars row
    ctx.fillStyle = "#FFD700";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 7; i++) ctx.fillText("★", PX + 20 + i * ((PW - 40) / 6), PY + 18);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("🎂 EVENTO ESPECIAL: ANIVERSÁRIO DO CRIADOR!", W / 2, PY + 50);
    ctx.fillStyle = "#FF9999";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("17 de Março — Feliz Aniversário, Joao! 🎉", W / 2, PY + 72);
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "12px sans-serif";
    ctx.fillText("Um bolo especial apareceu no mapa! 🌵 Encontre e envie", W / 2, PY + 96);
    ctx.fillText("seus parabéns — todos online vão ver a mensagem! 🤠🐄", W / 2, PY + 114);

    const ratio = Math.max(0, this.eventPopupTimer / 10);
    ctx.fillStyle = "rgba(30,10,2,0.7)";
    ctx.fillRect(PX + 20, PY + PH - 34, PW - 40, 10);
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(PX + 20, PY + PH - 34, (PW - 40) * ratio, 10);
    ctx.fillStyle = "#9b7e57";
    ctx.font = "10px sans-serif";
    ctx.fillText("Clique em qualquer lugar para fechar", W / 2, PY + PH - 10);
    ctx.restore();
  }

  private renderBirthdayDialog(W: number, H: number) {
    if (!this.birthdayDialogOpen) return;
    const { ctx } = this;
    const PW = Math.min(400, W - 40);
    const PH = 248;
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    this.drawPanel(PX, PY, PW, PH, 2);

    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎂", W / 2, PY + 30);

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("Bolo de Aniversário do Criador", W / 2, PY + 60);
    ctx.fillStyle = "#FF9999";
    ctx.font = "12px sans-serif";
    ctx.fillText("17 de Março 🎉", W / 2, PY + 78);

    if (this.birthdaySentParabens) {
      ctx.fillStyle = "#6BCB77";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("🎊 Você já enviou seus parabéns!", W / 2, PY + 112);
      ctx.fillStyle = "#FFE0A0";
      ctx.font = "12px sans-serif";
      ctx.fillText("O criador agradece de coração! 🤠🐄", W / 2, PY + 130);

      const bw = 130, bh = 36;
      const bx = W / 2 - bw / 2, by = PY + PH - 56;
      this.birthdayCloseBtn = { x: bx, y: by, w: bw, h: bh };
      this.birthdayConfirmBtn = { x: 0, y: 0, w: 0, h: 0 };
      this.drawPixelBtn(bx, by, bw, bh, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("Fechar", W / 2, by + bh / 2 + 5);
    } else {
      ctx.fillStyle = "#FFE0A0";
      ctx.font = "12px sans-serif";
      ctx.fillText("Envie seus parabéns! Todos online vão ver a mensagem.", W / 2, PY + 106);

      const bw = 210, bh = 40;
      const bx = W / 2 - bw / 2, by = PY + PH - 100;
      this.birthdayConfirmBtn = { x: bx, y: by, w: bw, h: bh };
      this.drawPixelBtn(bx, by, bw, bh, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("🎂 Enviar Parabéns!", W / 2, by + bh / 2 + 5);

      const cw = 120, ch = 32;
      const cxb = W / 2 - cw / 2, cyb = PY + PH - 48;
      this.birthdayCloseBtn = { x: cxb, y: cyb, w: cw, h: ch };
      this.drawPixelBtn(cxb, cyb, cw, ch, "normal");
      ctx.fillStyle = "#C8A870";
      ctx.font = "13px sans-serif";
      ctx.fillText("Talvez depois", W / 2, cyb + ch / 2 + 4);
    }
    ctx.restore();
  }

private preloadPlayerSprites() {
    const dirs = [
      "north",
      "north-east",
      "east",
      "south-east",
      "south",
      "south-west",
      "west",
      "north-west",
    ];
    for (const dir of dirs) {
      sprites.get(`player/idle/${dir}.png`);
      for (let f = 0; f < 4; f++) {
        sprites.get(`player/run/${dir}/frame_00${f}.png`);
      }
    }
    // Tree sprites
    sprites.get("decorations/Curved_tree1.png");
    sprites.get("decorations/White_tree1.png");
    sprites.get("decorations/Blue-green_balls_tree3.png");
    // Bandit sprite sheets
    sprites.get("npcs/bandit/Unarmed_Walk_without_shadow.png");
    sprites.get("npcs/bandit/Unarmed_Run_without_shadow.png");
    sprites.get("npcs/bandit/Unarmed_Idle_without_shadow.png");
  }

  private setupInput() {
    window.addEventListener("keydown", (e) => {
      // Backtick toggles admin command bar (before other guards)
      if (this.isAdmin && (e.key === "`" || e.key === "~")) {
        if (this.adminCmdOpen) this.closeAdminCmd();
        else this.openAdminCmd();
        e.preventDefault();
        return;
      }
      if (this.isPreview || this.chatOpen || this.adminCmdOpen) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === " " || e.key.toLowerCase() === "e") this.handleAction();
      if (e.key.toLowerCase() === "b") this.toggleBook();
      if (e.key.toLowerCase() === "m") this.toggleMusic();
      if (e.key === "F5") {
        e.preventDefault();
        this.debugSpawnBandit();
      }
      if (e.key.toLowerCase() === "q") this.toggleStakeAim();
      if (this.bookOpen) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          this.bookFlipPage(1);
          e.preventDefault();
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          this.bookFlipPage(-1);
          e.preventDefault();
          return;
        }
      }
      if (e.key.toLowerCase() === "t") {
        this.openChatInput();
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        if (this.placementMode) {
          this.placementMode = null;
          return;
        }
        if (this.benchHubOpen) {
          this.benchHubOpen = false;
          this.activeBench = null;
          return;
        }
        if (this.tradeState !== "idle") {
          this.tradeState = "idle";
          this.tradeItem = null;
          this.tradeIncoming = null;
          return;
        }
        if (this.inventoryOpen) {
          this.inventoryOpen = false;
          return;
        }
        if (this.shopOpen) {
          this.shopOpen = false;
          return;
        }
        if (this.stake.phase === "aiming") this.stake.phase = "idle";
        else this.toggleBook();
      }
      if (e.key.toLowerCase() === "i") {
        this.inventoryOpen = !this.inventoryOpen;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    this.canvas.addEventListener("pointerdown", (e) => {
      if (!this.isPreview) this.onPointerDown(e);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.isPreview) this.onPointerMove(e);
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!this.isPreview) this.onPointerUp(e);
    });
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.bookOpen) {
          if (e.deltaY > 0) this.bookFlipPage(1);
          else if (e.deltaY < 0) this.bookFlipPage(-1);
          e.preventDefault();
        } else if (this.shopOpen && this.shopTab === "buy") {
          // Scroll na aba de comprar
          const area = this.shopBuyContentArea;
          if (
            e.clientX >= area.x &&
            e.clientX <= area.x + area.w &&
            e.clientY >= area.y &&
            e.clientY <= area.y + area.h
          ) {
            this.shopBuyScroll = Math.max(0, this.shopBuyScroll + e.deltaY);
            e.preventDefault();
          }
        } else if (this.inventoryOpen && this.tradeState === "idle") {
          // Scroll no inventário
          const area = this.inventoryContentArea;
          if (
            e.clientX >= area.x &&
            e.clientX <= area.x + area.w &&
            e.clientY >= area.y &&
            e.clientY <= area.y + area.h
          ) {
            this.inventoryScroll = Math.max(0, this.inventoryScroll + e.deltaY);
            e.preventDefault();
          }
        } else if (this.chatOpen) {
          this.chatHistoryScroll = Math.max(
            0,
            this.chatHistoryScroll - Math.sign(e.deltaY),
          );
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }

  private onPointerDown(e: PointerEvent) {
    const W = this.canvas.width,
      H = this.canvas.height;
    const x = e.clientX,
      y = e.clientY;

    // Chat button — toggle (processado primeiro, antes de tudo)
    const chatBtnX = W - 80,
      chatBtnY = H - 260;
    if (Math.hypot(x - chatBtnX, y - chatBtnY) < 36) {
      if (this.chatOpen) this.closeChatInput();
      else this.openChatInput();
      return;
    }

    // Clicar em qualquer outro lugar do canvas fecha o chat
    if (this.chatOpen) {
      // Verifica se o toque está na área do painel de chat para touch scroll
      const PW = Math.min(W - 20, 320);
      const lineH = 18;
      const padV = 8;
      const MAX_VISIBLE = 8;
      const totalMsgs = this.chatMessages.length;
      const slice = this.chatMessages.slice(
        Math.max(0, totalMsgs - MAX_VISIBLE - this.chatHistoryScroll),
        Math.max(0, totalMsgs - MAX_VISIBLE - this.chatHistoryScroll) +
          MAX_VISIBLE,
      );
      const panelH = Math.max(
        lineH + padV * 2,
        slice.length * lineH + padV * 2,
      );
      const panelY = H - 195 - panelH;

      if (x >= 6 && x <= 6 + PW && y >= panelY && y <= panelY + panelH) {
        this.touchScroll = {
          active: true,
          touchId: e.pointerId,
          startY: y,
          lastY: y,
          target: "chat",
        };
        return;
      }
      this.closeChatInput();
      return;
    }


    // Event popup: any click dismisses it
    if (!this.eventPopupDismissed && this.isBirthdayActive) {
      this.eventPopupDismissed = true;
      sessionStorage.setItem("cowboy_bday_popup_seen", "1");
      return;
    }

    // Birthday dialog buttons
    if (this.birthdayDialogOpen) {
      const cb = this.birthdayCloseBtn;
      if (cb.w > 0 && x >= cb.x && x <= cb.x + cb.w && y >= cb.y && y <= cb.y + cb.h) {
        this.birthdayDialogOpen = false;
        return;
      }
      const conf = this.birthdayConfirmBtn;
      if (conf.w > 0 && x >= conf.x && x <= conf.x + conf.w && y >= conf.y && y <= conf.y + conf.h) {
        this.sendParabens();
        return;
      }
      return;
    }

    // Shop interaction
    if (this.shopOpen) {
      // Close button
      if (
        Math.hypot(x - this.shopCloseBtn.x, y - this.shopCloseBtn.y) <
        this.shopCloseBtn.r + 6
      ) {
        this.shopOpen = false;
        return;
      }
      // Tab buttons
      for (const btn of this.shopTabBtns) {
        if (
          x >= btn.x &&
          x <= btn.x + btn.w &&
          y >= btn.y &&
          y <= btn.y + btn.h
        ) {
          this.shopTab = btn.tab;
          this.shopBuyScroll = 0; // Reset scroll ao trocar de aba
          return;
        }
      }
      if (this.shopTab === "sell") {
        for (const btn of this.shopSellButtons) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.sellCow(btn.cow);
            return;
          }
        }
        const sa = this.shopSellAllHerdBtn;
        if (
          sa.w > 0 &&
          x >= sa.x &&
          x <= sa.x + sa.w &&
          y >= sa.y &&
          y <= sa.y + sa.h
        ) {
          this.sellAllCows();
          return;
        }
        for (const btn of this.shopSellBasedButtons) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.sellBasedCow(btn.cow);
            return;
          }
        }
        const sb = this.shopSellAllBasedBtn;
        if (
          sb.w > 0 &&
          x >= sb.x &&
          x <= sb.x + sb.w &&
          y >= sb.y &&
          y <= sb.y + sb.h
        ) {
          this.sellAllBasedCows();
          return;
        }
      } else {
        for (const btn of this.shopBuyButtons) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.buyItem(btn.item);
            return;
          }
        }
        // Touch scroll na aba de comprar
        const area = this.shopBuyContentArea;
        if (
          x >= area.x &&
          x <= area.x + area.w &&
          y >= area.y &&
          y <= area.y + area.h
        ) {
          this.touchScroll = {
            active: true,
            touchId: e.pointerId,
            startY: y,
            lastY: y,
            target: "shop",
          };
          return;
        }
      }
      return; // swallow input while shop is open
    }

    if (this.bookOpen) {
      const BW = Math.min(W - 32, 500),
        BH = Math.min(H - 32, 620);
      const BX = (W - BW) / 2,
        BY = (H - BH) / 2;
      const closeCX = BX + BW - 30,
        closeCY = BY + 28;
      if (Math.hypot(x - closeCX, y - closeCY) < 28) {
        this.bookOpen = false;
        return;
      }
      // Tab clicks
      const parchX = BX + 26,
        parchY = BY + 37;
      const parchW = BW - 50;
      const tabs: Array<"vacas" | "itens" | "personagens"> = [
        "vacas",
        "itens",
        "personagens",
      ];
      const tabW = (parchW - 20) / 3;
      const tabY = parchY + 38;
      const tabH = 24;
      for (let i = 0; i < tabs.length; i++) {
        const tx = parchX + 10 + i * tabW;
        if (x >= tx && x <= tx + tabW && y >= tabY && y <= tabY + tabH) {
          this.bookTab = tabs[i]!;
          this.bookPage = 0;
          this.bookPageTarget = 0;
          this.bookPageAnimT = 1;
          return;
        }
      }
      // Prev / Next nav buttons (bottom centre of parchment)
      const parchH = BH - 74;
      const navY = parchY + parchH - 28;
      const prevCX = BX + BW / 2 - 70;
      const nextCX = BX + BW / 2 + 70;
      if (this.bookTab === "vacas" || this.bookTab === "personagens") {
        if (Math.hypot(x - prevCX, y - navY) < 28) {
          this.bookFlipPage(-1);
          return;
        }
        if (Math.hypot(x - nextCX, y - navY) < 28) {
          this.bookFlipPage(1);
          return;
        }
      }
      // Click outside panel closes book
      if (x < BX || x > BX + BW || y < BY || y > BY + BH) {
        this.bookOpen = false;
        return;
      }
      return; // swallow input while book is open
    }

    // Stats panel toggle
    if (this.statsMinimized) {
      // Tap anywhere on compact badge to expand
      if (x >= 6 && x <= 136 && y >= 6 && y <= 50) {
        this.statsMinimized = false;
        return;
      }
    } else {
      // Collapse button: PW=210, drawPixelBtn(PW-20, 9, 22, 22)
      if (x >= 190 && x <= 216 && y >= 6 && y <= 34) {
        this.statsMinimized = true;
        return;
      }
      // Logout button: drawPixelBtn(PW-46, 9, 22, 22) → x=164..186
      if (x >= 164 && x <= 190 && y >= 6 && y <= 34) {
        void this.saveAndLogout();
        return;
      }
      // Botão "Comprar Moedas": x=14..204, y=154..176 (ry=148 fixo)
      if (x >= 14 && x <= 204 && y >= 154 && y <= 176) {
        void buyPremium(this.myToken);
        return;
      }
    }

    // Bench collect button (só dono)
    const cb = this.benchCollectBtn;
    if (
      cb.w > 0 &&
      x >= cb.x &&
      x <= cb.x + cb.w &&
      y >= cb.y &&
      y <= cb.y + cb.h
    ) {
      const bench = this.nearestBench();
      if (bench) void this.pickupBench(bench);
      return;
    }

    // Bench hub interaction
    if (this.benchHubOpen) {
      if (
        Math.hypot(x - this.benchHubCloseBtn.x, y - this.benchHubCloseBtn.y) <
        this.benchHubCloseBtn.r + 6
      ) {
        this.benchHubOpen = false;
        this.activeBench = null;
        return;
      }
      const pb = this.benchPickupBtn;
      if (
        pb.w > 0 &&
        x >= pb.x &&
        x <= pb.x + pb.w &&
        y >= pb.y &&
        y <= pb.y + pb.h
      ) {
        void this.pickupBench(this.activeBench!);
        return;
      }
      // Craft buttons
      for (const btn of this.benchCraftBtns) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          if (btn.id === "machado") this.craftMachado();
          return;
        }
      }
      return; // swallow input while hub open
    }

    // Inventory panel interaction
    if (this.inventoryOpen) {
      // Close button
      if (
        Math.hypot(x - this.inventoryCloseBtn.x, y - this.inventoryCloseBtn.y) <
        this.inventoryCloseBtn.r + 6
      ) {
        if (this.tradeState !== "idle") {
          this.tradeState = "idle";
          this.tradeItem = null;
          this.tradeIncoming = null;
        } else this.inventoryOpen = false;
        return;
      }
      if (this.tradeState === "incoming") {
        const ab = this.tradeAcceptBtn,
          db = this.tradeDeclineBtn;
        if (
          ab.w > 0 &&
          x >= ab.x &&
          x <= ab.x + ab.w &&
          y >= ab.y &&
          y <= ab.y + ab.h
        ) {
          this.acceptIncomingTrade();
          return;
        }
        if (
          db.w > 0 &&
          x >= db.x &&
          x <= db.x + db.w &&
          y >= db.y &&
          y <= db.y + db.h
        ) {
          this.declineIncomingTrade();
          return;
        }
      } else if (this.tradeState === "selecting") {
        for (const btn of this.tradePlayerBtns) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.confirmTradeOffer(btn.playerId);
            return;
          }
        }
        const cb = this.tradeCancelBtn;
        if (
          cb.w > 0 &&
          x >= cb.x &&
          x <= cb.x + cb.w &&
          y >= cb.y &&
          y <= cb.y + cb.h
        ) {
          this.tradeState = "idle";
          this.tradeItem = null;
          return;
        }
      } else if (this.tradeState === "waiting") {
        const cb = this.tradeCancelBtn;
        if (
          cb.w > 0 &&
          x >= cb.x &&
          x <= cb.x + cb.w &&
          y >= cb.y &&
          y <= cb.y + cb.h
        ) {
          this.tradeState = "idle";
          this.tradeItem = null;
          return;
        }
      } else {
        // Normal inventory — drop and trade buttons
        for (const btn of this.inventoryDropBtns) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.dropItem(btn.item);
            return;
          }
        }
        for (const btn of this.inventoryTradeBtns) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.startTradeOffer(btn.item);
            return;
          }
        }
        for (const btn of this.inventoryPlaceBtns) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.startPlacement(btn.item);
            return;
          }
        }
        for (const btn of this.inventoryUseBtns) {
          if (
            x >= btn.x &&
            x <= btn.x + btn.w &&
            y >= btn.y &&
            y <= btn.y + btn.h
          ) {
            this.useConsumable(btn.item);
            return;
          }
        }
        // Touch scroll no inventário
        const area = this.inventoryContentArea;
        if (
          x >= area.x &&
          x <= area.x + area.w &&
          y >= area.y &&
          y <= area.y + area.h
        ) {
          this.touchScroll = {
            active: true,
            touchId: e.pointerId,
            startY: y,
            lastY: y,
            target: "inventory",
          };
          return;
        }
      }
      return; // swallow all input while inventory open
    }

    // Inventory button (top-right, below book button)
    const invBtnX = W - 80,
      invBtnY = H - 330;
    if (
      x >= invBtnX - 30 &&
      x <= invBtnX + 30 &&
      y >= invBtnY - 30 &&
      y <= invBtnY + 30
    ) {
      this.inventoryOpen = !this.inventoryOpen;
      return;
    }

    // Book button (top-right HUD area)
    const musicBtnX = W - 120,
      musicBtnY = 50;
    if (Math.hypot(x - musicBtnX, y - musicBtnY) < 26) {
      this.toggleMusic();
      return;
    }
    const bookBtnX = W - 50,
      bookBtnY = 50;
    if (Math.hypot(x - bookBtnX, y - bookBtnY) < 26) {
      this.toggleBook();
      return;
    }

    // Action button (bottom-right)
    const ax = W - 80,
      ay = H - 80;
    if (Math.hypot(x - ax, y - ay) < 56) {
      this.handleAction();
      return;
    }

    // Joystick zone: bottom-left
    if (x < W / 2 && y > H * 0.55) {
      this.joystick = {
        active: true,
        touchId: e.pointerId,
        startX: x,
        startY: y,
        dx: 0,
        dy: 0,
      };
      e.preventDefault();
      return;
    }

    // Stake aiming — click on map to throw
    // Modo de posicionamento — clique no mapa para colocar bancada
    if (this.placementMode) {
      const iso = this.screenToIso(x, y);
      const tileCol = Math.floor(iso.col);
      const tileRow = Math.floor(iso.row);
      if (this.isPlacementValid(tileCol, tileRow)) {
        void this.placeObject(tileCol + 0.5, tileRow + 0.5);
      }
      return;
    }

    if (this.stake.phase === "aiming") {
      this.throwStakeTo(x, y);
      return;
    }

    // Stake button (bottom-right of action button)
    const stakeX = W - 80,
      stakeY = H - 170;
    if (Math.hypot(x - stakeX, y - stakeY) < 36) {
      this.toggleStakeAim();
      return;
    }

    // Click on a cow
    for (const cow of this.cows) {
      if (cow.state !== "wandering") continue;
      const s = this.isoToScreen(cow.col, cow.row);
      if (
        Math.hypot(x - s.x, y - (s.y - 12)) < 34 &&
        dist(this.player, cow) <= this.effectiveCaptureRange
      ) {
        if (this.herdCows().length >= this.effectiveHerdCapacity) return;
        this.startLasso(cow);
        return;
      }
    }
  }

  private onPointerMove(e: PointerEvent) {
    // Rastreia tile sob o cursor para preview de posicionamento
    const iso = this.screenToIso(e.clientX, e.clientY);
    this.mouseTileCol = Math.floor(iso.col);
    this.mouseTileRow = Math.floor(iso.row);

    // Touch scroll
    if (this.touchScroll.active && e.pointerId === this.touchScroll.touchId) {
      const deltaY = this.touchScroll.lastY - e.clientY;
      this.touchScroll.lastY = e.clientY;

      if (this.touchScroll.target === "shop") {
        this.shopBuyScroll = Math.max(0, this.shopBuyScroll + deltaY);
      } else if (this.touchScroll.target === "inventory") {
        this.inventoryScroll = Math.max(0, this.inventoryScroll + deltaY);
      } else if (this.touchScroll.target === "chat") {
        this.chatHistoryScroll = Math.max(
          0,
          this.chatHistoryScroll + Math.sign(deltaY),
        );
      }
      e.preventDefault();
      return;
    }

    if (!this.joystick.active || e.pointerId !== this.joystick.touchId) return;
    const maxR = 50;
    const dx = e.clientX - this.joystick.startX;
    const dy = e.clientY - this.joystick.startY;
    const d = Math.hypot(dx, dy);
    const f = Math.min(d, maxR) / maxR;
    this.joystick.dx = (d > 0 ? dx / d : 0) * f;
    this.joystick.dy = (d > 0 ? dy / d : 0) * f;
    e.preventDefault();
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerId === this.touchScroll.touchId) {
      this.touchScroll.active = false;
      this.touchScroll.target = null;
    }
    if (e.pointerId === this.joystick.touchId) {
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    }
  }

  private handleAction() {
    // Advance/dismiss vendor dialog
    if (this.vendorDialog.active) {
      if (!this.vendorDialog.done) {
        // Skip to end on click
        this.vendorDialog.displayed = this.vendorDialog.text.length;
        this.vendorDialog.done = true;
      } else {
        // Dismiss and open shop
        this.vendorDialog.active = false;
        this.shopOpen = true;
        this.shopBuyScroll = 0;
      }
      return;
    }
    if (this.benchHubOpen) {
      this.benchHubOpen = false;
      this.activeBench = null;
      return;
    }
    // Birthday dialog dismiss via E
    if (this.birthdayDialogOpen) {
      this.birthdayDialogOpen = false;
      return;
    }
    // Birthday cake interaction
    if (this.isBirthdayActive && this.isAtCake()) {
      this.birthdayDialogOpen = true;
      return;
    }
    if (this.shopOpen) {
      this.shopOpen = false;
      return;
    }
    if (this.bookOpen) return;
    if (this.lasso.active && this.lasso.phase === "pulling") {
      this.lasso.clickCount++;
      this.lasso.flashTimer = 0.12;
      return;
    }
    if (this.lasso.active) return;
    // Scare bandit if close — drops cow and flees
    const nearBandit = this.bandits.find(
      (b) => b.state === "fleeing" && dist(this.player, b) <= 3.5,
    );
    if (nearBandit) {
      if (nearBandit.targetCow) {
        nearBandit.targetCow.state = "wandering";
        nearBandit.targetCow = null;
      }
      nearBandit.state = "scared";
      return;
    }
    const nearBench = this.nearestBench();
    if (nearBench) {
      // E = Interagir (abrir hub de criação)
      this.activeBench = nearBench;
      this.benchHubOpen = true;
      return;
    }
    if (this.isAtVendor()) {
      if (!this.vendorMet) {
        // First meeting — show intro dialog
        this.vendorDialog = {
          active: true,
          text: "Ei, parceiro! Nome meu não importa — pode me chamar de Vendedor.\nTrago o que o sertão esqueceu de te dar.\nTem dinheiro? Tem negócio.",
          displayed: 0,
          timer: 0,
          done: false,
        };
        this.vendorMet = true;
        this.discoveredNPCs.add("vendedor");
        return;
      }
      this.shopOpen = true;
      this.shopBuyScroll = 0;
      this.discoveredNPCs.add("vendedor");
      return;
    }
    if (this.isAtBase() && this.herdCows().length > 0) {
      this.depositCows();
      return;
    }
    // Cortar árvore próxima (requer machado)
    if (this.chop.active && this.chop.clickCount < CHOP_CLICKS_NEEDED) {
      this.chop.clickCount++;
      this.chop.flashTimer = 0.1;
      return;
    }
    const nearBoulder = this.nearestBoulder();
    if (nearBoulder) {
      this.harvestStone(nearBoulder.col, nearBoulder.row);
      return;
    }
    const nearTree = this.nearestChoppableTree();
    if (nearTree && this.hasMachado()) {
      this.startChop(nearTree.col, nearTree.row);
      return;
    }
    const cow = this.nearestWanderingCow();
    if (
      cow &&
      dist(this.player, cow) <= this.effectiveCaptureRange &&
      this.herdCows().length < this.effectiveHerdCapacity
    )
      this.startLasso(cow);
  }

  private toggleBook() {
    this.bookOpen = !this.bookOpen;
    if (this.bookOpen) {
      this.shopOpen = false;
      this.bookPage = 0;
      this.bookPageTarget = 0;
      this.bookPageAnimT = 1;
      this.bookTab = "vacas";
    }
  }

  private bookFlipPage(dir: 1 | -1) {
    if (this.bookTab === "personagens") {
      const next = Math.max(
        0,
        Math.min(NPC_ENTRIES.length - 1, this.bookPage + dir),
      );
      if (next === this.bookPage) return;
      this.bookPage = next;
      return;
    }
    if (this.bookPageAnimT < 1) return; // already animating
    const next = Math.max(
      0,
      Math.min(COW_TYPES.length - 1, this.bookPage + dir),
    );
    if (next === this.bookPage) return;
    this.bookPageTarget = next;
    this.bookPageAnimDir = dir;
    this.bookPageAnimT = 0;
  }

  private toggleStakeAim() {
    if (this.stake.phase === "flying" || this.stake.phase === "pulling") return;
    if (this.stake.phase === "anchored") return; // waiting for auto-pull
    this.stake.phase = this.stake.phase === "aiming" ? "idle" : "aiming";
  }

  private throwStakeTo(screenX: number, screenY: number) {
    // Convert screen click to iso grid
    const wx = screenX - this.camX;
    const wy = screenY - this.camY;
    const targetCol = wx / TILE_W + wy / TILE_H;
    const targetRow = -wx / TILE_W + wy / TILE_H;

    const d = dist(this.player, { col: targetCol, row: targetRow });
    if (d > STAKE_RANGE) return; // out of range

    const tc = Math.floor(targetCol),
      tr = Math.floor(targetRow);
    if (tc < 0 || tc >= MAP_COLS || tr < 0 || tr >= MAP_ROWS) return;
    const tile = this.map[tr]?.[tc];
    if (!tile || tile.type === "water") return; // must land on solid ground
    if (isObstacle(tile)) return;

    this.stake.phase = "flying";
    this.stake.targetCol = targetCol;
    this.stake.targetRow = targetRow;
    this.stake.flyCol = this.player.col;
    this.stake.flyRow = this.player.row;
  }

  private screenToIso(sx: number, sy: number) {
    const wx = sx - this.camX,
      wy = sy - this.camY;
    return { col: wx / TILE_W + wy / TILE_H, row: -wx / TILE_W + wy / TILE_H };
  }

  // ─── Logic ────────────────────────────────────────────────────────────────

  private loop(t: number) {
    requestAnimationFrame((t2) => this.loop(t2));
    const elapsed = t - this.lastTime;
    if (elapsed < 16.67) return; // cap at 60 fps
    const dt = Math.min(elapsed / 1000, 0.1);
    this.lastTime = t - (elapsed % 16.67); // carry over excess
    this.time += dt;
    // Advance book page-flip animation
    if (this.bookPageAnimT < 1) {
      this.bookPageAnimT = Math.min(1, this.bookPageAnimT + dt * 6);
      if (this.bookPageAnimT >= 0.5 && this.bookPage !== this.bookPageTarget) {
        this.bookPage = this.bookPageTarget;
      }
    }
    if (!this.bookOpen) {
      this.update(dt);
    }
    this.render();
  }

  private update(dt: number) {
    this.updateCamera();
    this.updateStake(dt); // always runs (independent of lasso)
    const beingPulled = this.stake.phase === "pulling";
    if (!this.lasso.active) {
      if (!beingPulled && !this.chop.active) this.updatePlayer(dt);
      else if (beingPulled) this.updateStakePull(dt);
      this.updateCows(dt);
    } else {
      this.updateLasso(dt);
    }

    // Bandits
    this.updateBandits(dt);

    // Vendor dialog typewriter
    if (this.vendorDialog.active && !this.vendorDialog.done) {
      this.vendorDialog.timer += dt;
      if (this.vendorDialog.timer >= 0.03) {
        this.vendorDialog.timer = 0;
        this.vendorDialog.displayed = Math.min(
          this.vendorDialog.text.length,
          this.vendorDialog.displayed + 1,
        );
        if (this.vendorDialog.displayed >= this.vendorDialog.text.length) {
          this.vendorDialog.done = true;
        }
      }
    }

    // Trade result timer
    if (this.tradeState === "result" && this.tradeResultTimer > 0) {
      this.tradeResultTimer -= dt;
      if (this.tradeResultTimer <= 0) this.tradeState = "idle";
    }
    if (this.adminCmdResultTimer > 0) this.adminCmdResultTimer -= dt;

    // Birthday event timers
    this.cakeBobbingTimer += dt;
    if (!this.eventPopupDismissed && this.isBirthdayActive) {
      this.eventPopupTimer -= dt;
      if (this.eventPopupTimer <= 0) {
        this.eventPopupDismissed = true;
        sessionStorage.setItem("cowboy_bday_popup_seen", "1");
      }
    }
    for (let i = this.birthdayParticles.length - 1; i >= 0; i--) {
      const p = this.birthdayParticles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) this.birthdayParticles.splice(i, 1);
    }

    // Envio de posição para outros jogadores (20 vezes/seg)
    this.netSendTimer -= dt;
    if (this.netSendTimer <= 0) {
      this.netSendTimer = 0.05;
      this.network?.sendMove(
        this.player.col,
        this.player.row,
        this.player.dirCol,
        this.player.dirRow,
        this.player.moving,
        this.herdCows().length,
      );
    }

    // Day/night transition events
    const nowNight = this.isNight;
    if (this.prevIsNight && !nowNight) {
      // Dawn: despawn wandering/fleeing nightOnly cows
      this.cows = this.cows.filter(
        (cow) =>
          !cow.type.nightOnly ||
          (cow.state !== "wandering" && cow.state !== "fleeing"),
      );
    }
    if (!this.prevIsNight && nowNight) {
      // Dusk: spawn a burst of 3 night cows immediately
      for (let i = 0; i < 3; i++) {
        this.cows.push(spawnCow(this.nextCowId++, this.map, true));
      }
    }
    if (nowNight !== this.prevIsNight) this.onPeriodChange();
    this.prevIsNight = nowNight;

    // Respawn de vacas a cada 45-75s, sem ultrapassar COW_COUNT ativas
    this.cowSpawnTimer -= dt;
    if (this.cowSpawnTimer <= 0) {
      const active = this.cows.filter(
        (c) =>
          c.state === "wandering" ||
          c.state === "fleeing" ||
          c.state === "lassoed" ||
          c.state === "captured",
      ).length;
      if (active < COW_COUNT) {
        this.cows.push(spawnCow(this.nextCowId++, this.map, this.isNight));
      }
      this.cowSpawnTimer = 45 + Math.random() * 30;
    }

    // Regrowth de árvores cortadas (gerenciado pelo servidor)
    if (this.chopFlash > 0) this.chopFlash = Math.max(0, this.chopFlash - dt);

    this.updateChop(dt);

    // Autosave a cada 60 segundos
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 60;
      this.triggerSave();
    }
    if (this.leiteTimer > 0) {
      this.leiteTimer = Math.max(0, this.leiteTimer - dt);
    }
  }

  private triggerSave() {
    const discovered = [...this.discovered];
    const discoveredNPCs = [...this.discoveredNPCs];
    const capturedByType = Object.fromEntries(this.capturedByType);
    const basedCowTypes = this.cows
      .filter((c) => c.state === "based")
      .sort((a, b) => a.herdIndex - b.herdIndex)
      .map((c) => c.type.id);
    const inventory = Object.fromEntries(this.inventory);
    // Via WebSocket (mais eficiente — já conectado)
    this.network?.sendSave(
      this.basedCount,
      discovered,
      discoveredNPCs,
      capturedByType,
      basedCowTypes,
      this.coins,
      inventory,
    );
    // Via HTTP com keepalive — garante entrega mesmo ao fechar a aba
    saveGameState(
      this.myToken,
      this.basedCount,
      discovered,
      discoveredNPCs,
      capturedByType,
      basedCowTypes,
      this.coins,
      inventory,
    );
  }

  private async saveAndLogout() {
    const discovered = [...this.discovered];
    const discoveredNPCs = [...this.discoveredNPCs];
    const capturedByType = Object.fromEntries(this.capturedByType);
    const basedCowTypes = this.cows
      .filter((c) => c.state === "based")
      .map((c) => c.type.id);
    const inventory = Object.fromEntries(this.inventory);
    await saveGameState(
      this.myToken,
      this.basedCount,
      discovered,
      discoveredNPCs,
      capturedByType,
      basedCowTypes,
      this.coins,
      inventory,
    );
    logout();
  }

  private updateStake(dt: number) {
    const s = this.stake;

    if (s.phase === "flying") {
      // Move stake toward target at STAKE_FLY_SPEED
      const dc = s.targetCol - s.flyCol,
        dr = s.targetRow - s.flyRow;
      const d = Math.hypot(dc, dr);
      const step = STAKE_FLY_SPEED * dt;
      if (d <= step) {
        // Landed!
        s.flyCol = s.targetCol;
        s.flyRow = s.targetRow;
        s.phase = "anchored";
        // Begin pull immediately
        s.pullStartCol = this.player.col;
        s.pullStartRow = this.player.row;
        s.pullDist = Math.max(
          0.1,
          dist(this.player, { col: s.targetCol, row: s.targetRow }),
        );
        s.pullT = 0;
        s.phase = "pulling";
      } else {
        s.flyCol += (dc / d) * step;
        s.flyRow += (dr / d) * step;
      }
    }
  }

  private updateStakePull(dt: number) {
    const s = this.stake;
    const speed = STAKE_PULL_SPEED / s.pullDist; // progress units per second
    s.pullT = Math.min(1, s.pullT + speed * dt);

    // Ease-in-out for smooth feel
    const ease =
      s.pullT < 0.5
        ? 2 * s.pullT * s.pullT
        : 1 - Math.pow(-2 * s.pullT + 2, 2) / 2;

    this.player.col = s.pullStartCol + (s.targetCol - s.pullStartCol) * ease;
    this.player.row = s.pullStartRow + (s.targetRow - s.pullStartRow) * ease;

    if (s.pullT >= 1) {
      // Arrived — recover stake
      this.player.col = s.targetCol;
      this.player.row = s.targetRow;
      s.phase = "idle";
    }
  }

  private updateCamera() {
    const sx = (this.player.col - this.player.row) * (TILE_W / 2);
    const sy = (this.player.col + this.player.row) * (TILE_H / 2);
    this.camX = this.canvas.width / 2 - sx;
    this.camY = this.canvas.height / 2 - sy - 40;
  }

  private updatePlayer(dt: number) {
    let dc = 0,
      dr = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) {
      dc--;
      dr--;
    }
    if (this.keys.has("s") || this.keys.has("arrowdown")) {
      dc++;
      dr++;
    }
    if (this.keys.has("a") || this.keys.has("arrowleft")) {
      dc--;
      dr++;
    }
    if (this.keys.has("d") || this.keys.has("arrowright")) {
      dc++;
      dr--;
    }
    if (this.joystick.active) {
      dc += this.joystick.dx + this.joystick.dy;
      dr += -this.joystick.dx + this.joystick.dy;
    }
    const len = Math.hypot(dc, dr);
    if (len > 0) {
      dc /= len;
      dr /= len;
      const nc = Math.max(
        0.5,
        Math.min(
          MAP_COLS - 1.5,
          this.player.col + dc * this.effectiveSpeed * dt,
        ),
      );
      const nr = Math.max(
        0.5,
        Math.min(
          MAP_ROWS - 1.5,
          this.player.row + dr * this.effectiveSpeed * dt,
        ),
      );
      const tc = this.map[Math.floor(nr)]![Math.floor(nc)]!;
      if (!isObstacle(tc)) {
        this.player.col = nc;
        this.player.row = nr;
      }
      if (dc !== 0) this.player.dirCol = dc > 0 ? 1 : -1;
      if (dr !== 0) this.player.dirRow = dr > 0 ? 1 : -1;
      this.player.moving = true;
    } else {
      this.player.moving = false;
    }
    this.updateHerd(dt);
  }

  private updateHerd(dt: number) {
    const herd = this.herdCows();
    let prevCol = this.player.col,
      prevRow = this.player.row;
    for (const cow of herd) {
      const dc = prevCol - cow.col,
        dr = prevRow - cow.row;
      const d = Math.hypot(dc, dr);
      if (d > HERD_SPACING) {
        const spd = Math.min(HERD_FOLLOW_SPEED, d * 6) * dt;
        cow.col += (dc / d) * spd;
        cow.row += (dr / d) * spd;
      }
      prevCol = cow.col;
      prevRow = cow.row;
    }
  }

  private updateCows(dt: number) {
    for (const cow of this.cows) {
      if (cow.sparkTimer > 0) cow.sparkTimer -= dt;
      if (cow.state !== "wandering" && cow.state !== "fleeing") continue;

      // ── Full flee (after failed lasso) ───────────────────────────────────
      if (cow.state === "fleeing") {
        const dc = cow.col - this.player.col,
          dr = cow.row - this.player.row;
        const d = Math.hypot(dc, dr);
        if (d < 10 && d > 0) {
          const nc = cow.col + (dc / d) * COW_FLEE_SPEED * dt;
          const nr = cow.row + (dr / d) * COW_FLEE_SPEED * dt;
          if (!isObstacle(this.map[Math.floor(nr)]![Math.floor(nc)]!)) {
            cow.col = Math.max(1, Math.min(MAP_COLS - 2, nc));
            cow.row = Math.max(1, Math.min(MAP_ROWS - 2, nr));
          }
        } else {
          cow.state = "wandering";
          cow.wanderTimer = 1;
        }
        continue;
      }

      // ── Wary: slowly back away when player is too close ──────────────────
      if (cow.type.fearDistance > 0) {
        const pd = dist(this.player, cow);
        if (pd < cow.type.fearDistance && pd > 0.5) {
          const dc = cow.col - this.player.col,
            dr = cow.row - this.player.row;
          const len = Math.hypot(dc, dr);
          // Speed scales with proximity: faster the closer the player
          const intensity = 1 - pd / cow.type.fearDistance;
          const speed = cow.type.fearSpeed * intensity;
          const nc = cow.col + (dc / len) * speed * dt;
          const nr = cow.row + (dr / len) * speed * dt;
          const tc = this.map[Math.floor(nr)]?.[Math.floor(nc)];
          if (tc && !isObstacle(tc)) {
            cow.col = Math.max(1, Math.min(MAP_COLS - 2, nc));
            cow.row = Math.max(1, Math.min(MAP_ROWS - 2, nr));
          } else {
            // Blocked by obstacle — try sliding along it
            const ncX = cow.col + (dc / len) * speed * dt;
            const tcX = this.map[Math.floor(cow.row)]?.[Math.floor(ncX)];
            if (tcX && !isObstacle(tcX))
              cow.col = Math.max(1, Math.min(MAP_COLS - 2, ncX));
            const nrY = cow.row + (dr / len) * speed * dt;
            const tcY = this.map[Math.floor(nrY)]?.[Math.floor(cow.col)];
            if (tcY && !isObstacle(tcY))
              cow.row = Math.max(1, Math.min(MAP_ROWS - 2, nrY));
          }
          continue;
        }
      }

      // ── Normal wander ────────────────────────────────────────────────────
      cow.wanderTimer -= dt;
      if (cow.wanderTimer <= 0) {
        const a = Math.random() * Math.PI * 2;
        cow.wanderDirCol = Math.cos(a);
        cow.wanderDirRow = Math.sin(a);
        cow.wanderTimer = 2 + Math.random() * 3;
      }
      const nc = cow.col + cow.wanderDirCol * COW_WANDER_SPEED * dt;
      const nr = cow.row + cow.wanderDirRow * COW_WANDER_SPEED * dt;
      const tc = this.map[Math.floor(nr)]?.[Math.floor(nc)];
      if (tc && !isObstacle(tc)) {
        cow.col = Math.max(1, Math.min(MAP_COLS - 2, nc));
        cow.row = Math.max(1, Math.min(MAP_ROWS - 2, nr));
      } else {
        cow.wanderTimer = 0;
      }
    }
  }

  private updateLasso(dt: number) {
    const l = this.lasso;
    if (!l.cow) {
      l.active = false;
      return;
    }
    if (l.flashTimer > 0) l.flashTimer -= dt;

    if (l.phase === "throwing") {
      l.throwT += dt / LASSO_THROW_DURATION;
      if (l.throwT >= 1) {
        l.throwT = 1;
        l.phase = "pulling";
        l.timeLeft = LASSO_TIME_LIMIT;
        l.clickCount = 0;
      }
      return;
    }
    if (l.phase === "pulling") {
      l.timeLeft -= dt;
      if (l.clickCount >= this.effectiveLassoClicks(l.cow.type.clicksNeeded)) {
        this.captureCow(l.cow);
        l.active = false;
        return;
      }
      if (l.timeLeft <= 0) {
        if (this.adminGodMode) {
          this.captureCow(l.cow);
          l.active = false;
        } else {
          l.phase = "fail";
          l.cow.state = "fleeing";
          setTimeout(() => {
            this.lasso.active = false;
          }, 700);
        }
      }
    }
  }

  private captureCow(cow: Cow) {
    const herdLen = this.herdCows().length;
    cow.state = "captured";
    cow.herdIndex = herdLen;
    cow.col = this.player.col;
    cow.row = this.player.row;
    cow.sparkTimer = 1.5;
    this.discovered.add(cow.type.id);
    this.capturedByType.set(
      cow.type.id,
      (this.capturedByType.get(cow.type.id) ?? 0) + 1,
    );
  }

  private depositCows() {
    const herd = this.herdCows();
    const startIdx = this.basedCount; // índice cumulativo antes deste lote
    this.basedCount += herd.length;
    for (let i = 0; i < herd.length; i++) {
      const cow = herd[i]!;
      cow.state = "based";
      cow.herdIndex = startIdx + i;
      // Posição determinística pelo índice — não precisa esperar o servidor
      const pos = basedSlotPos(startIdx + i);
      cow.col = pos.col;
      cow.row = pos.row;
      // Respawn gerenciado pelo cowSpawnTimer no update loop
    }
    // Notifica outros jogadores (multiplayer visual)
    this.network?.sendCowBased(herd.map((c) => c.type.id));
    // Salva imediatamente — não espera o timer de 60s
    this.triggerSave();
  }

  private startLasso(cow: Cow) {
    cow.state = "lassoed";
    this.discovered.add(cow.type.id);
    this.lasso = {
      active: true,
      cow,
      phase: "throwing",
      throwT: 0,
      clickCount: 0,
      timeLeft: 0,
      flashTimer: 0,
    };
  }

  private isAtBase() {
    const c = Math.floor(this.player.col),
      r = Math.floor(this.player.row);
    return (
      c >= BASE_COL &&
      c < BASE_COL + BASE_SIZE &&
      r >= BASE_ROW &&
      r < BASE_ROW + BASE_SIZE
    );
  }

  // ─── Efeitos de itens ─────────────────────────────────────────────────────

  private get effectiveSpeed() {
    return PLAYER_SPEED * (1 + (this.inventory.get("esporas") ?? 0) * 0.05);
  }

  private get effectiveCaptureRange() {
    return CAPTURE_DIST + (this.inventory.get("lasso_longo") ?? 0) * 0.5;
  }

  private effectiveLassoClicks(base: number) {
    return Math.max(1, base - (this.inventory.get("lasso_forte") ?? 0) * 3);
  }

  /** Hora atual no fuso de Brasília (UTC-3), com decimais de minutos */
  private get realHourBRT(): number {
    const now = new Date();
    return ((now.getUTCHours() - 3 + 24) % 24) + now.getUTCMinutes() / 60;
  }

  /** 'manha' 6-12h | 'tarde' 12-18h | 'noite' 18-6h (horário de Brasília) */
  private get timePeriod(): "manha" | "tarde" | "noite" {
    if (this.adminForcePeriod !== null) return this.adminForcePeriod;
    if (this.DEBUG_FORCE_PERIOD !== null) return this.DEBUG_FORCE_PERIOD;
    const h = this.realHourBRT;
    if (h >= 18 || h < 6) return "noite";
    if (h < 12) return "manha";
    return "tarde";
  }

  /** 0 = dia pleno, 1 = noite plena — transição suave de 30 min */
  private get nightFade(): number {
    if (this.adminForcePeriod === "noite") return 1;
    if (this.adminForcePeriod !== null) return 0;
    if (this.DEBUG_FORCE_PERIOD === "noite") return 1;
    if (this.DEBUG_FORCE_PERIOD === "tarde") return 0;
    if (this.DEBUG_FORCE_PERIOD === "manha") return 0;
    const h = this.realHourBRT;
    // Dawn: 5:30–6:30 → fade 1→0
    if (h >= 5.5 && h < 6.5) return 1 - (h - 5.5);
    // Full day: 6:30–17:30
    if (h >= 6.5 && h < 17.5) return 0;
    // Dusk: 17:30–18:30 → fade 0→1
    if (h >= 17.5 && h < 18.5) return h - 17.5;
    // Full night: 18:30–5:30
    return 1;
  }

  private get isNight(): boolean {
    return this.timePeriod === "noite";
  }

  private get isBirthdayActive(): boolean {
    if (this.birthdayForceState === "off") return false;
    if (this.birthdayForceState === "on") return true;
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    return m === BIRTHDAY_MONTH && d >= BIRTHDAY_DAY_START && d <= BIRTHDAY_DAY_END;
  }

  private isAtCake(): boolean {
    return dist(this.player, { col: CAKE_COL, row: CAKE_ROW }) <= CAKE_INTERACT_DIST;
  }

  private get effectiveHerdCapacity() {
    if ((this.inventory.get("corda_aco") ?? 0) >= 1) return 5;
    return 1 + (this.inventory.get("lasso_extra") ?? 0);
  }

  private isAtVendor() {
    return (
      dist(this.player, { col: VENDOR_COL, row: VENDOR_ROW }) <=
      VENDOR_INTERACT_DIST
    );
  }

  private nearestBench(): PlacedObject | null {
    const BENCH_INTERACT_DIST = 2;
    let best: PlacedObject | null = null;
    let bd = Infinity;
    for (const obj of this.placedObjects) {
      const d = dist(this.player, obj);
      if (d < BENCH_INTERACT_DIST && d < bd) {
        bd = d;
        best = obj;
      }
    }
    return best;
  }

  private saveCoinsLocally() {
    localStorage.setItem(`cowboy_coins_${this.myName}`, String(this.coins));
  }

  private sellCow(cow: Cow) {
    const price = COW_SELL_PRICES[cow.type.rarity] ?? 10;
    this.coins += price;
    this.saveCoinsLocally();
    const idx = this.cows.indexOf(cow);
    if (idx !== -1) this.cows.splice(idx, 1);
    // Reindexar o rebanho restante
    this.herdCows().forEach((c, i) => {
      c.herdIndex = i;
    });
    this.triggerSave();
  }

  private sellAllCows() {
    const herd = this.herdCows();
    if (herd.length === 0) return;
    for (const cow of herd) {
      this.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
      const idx = this.cows.indexOf(cow);
      if (idx !== -1) this.cows.splice(idx, 1);
    }
    this.saveCoinsLocally();
    this.triggerSave();
  }

  private sellBasedCow(cow: Cow) {
    this.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
    this.saveCoinsLocally();
    const idx = this.cows.indexOf(cow);
    if (idx !== -1) this.cows.splice(idx, 1);
    this.basedCount = Math.max(0, this.basedCount - 1);
    // Reindexar e reposicionar vacas restantes no curral
    this.basedCows()
      .sort((a, b) => a.herdIndex - b.herdIndex)
      .forEach((c, i) => {
        c.herdIndex = i;
        const pos = basedSlotPos(i);
        c.col = pos.col;
        c.row = pos.row;
      });
    this.triggerSave();
  }

  private sellAllBasedCows() {
    const based = this.basedCows();
    if (based.length === 0) return;
    for (const cow of based) {
      this.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
      const idx = this.cows.indexOf(cow);
      if (idx !== -1) this.cows.splice(idx, 1);
    }
    this.basedCount = 0;
    this.saveCoinsLocally();
    this.triggerSave();
  }

  private buyItem(item: GameItem) {
    const level = this.inventory.get(item.id) ?? 0;
    if (level >= item.maxLevel) return;
    const price = itemNextPrice(item, level);
    if (this.coins < price) return;
    this.coins -= price;
    this.inventory.set(item.id, level + 1);
    this.saveCoinsLocally();
    this.triggerSave();
  }

  private herdCows() {
    return this.cows
      .filter((c) => c.state === "captured")
      .sort((a, b) => a.herdIndex - b.herdIndex);
  }

  private basedCows() {
    return this.cows.filter((c) => c.state === "based");
  }

  private dropItem(item: GameItem) {
    const cur = this.inventory.get(item.id) ?? 0;
    if (cur <= 0) return;
    if (cur <= 1) this.inventory.delete(item.id);
    else this.inventory.set(item.id, cur - 1);
    this.triggerSave();
  }

  private isPlacementValid(tileCol: number, tileRow: number): boolean {
    const tile = this.map[tileRow]?.[tileCol];
    if (!tile) return false;
    if (tile.type === "water" || tile.type === "base") return false;
    if (tile.decoration !== "none") return false;
    // Verificar sobreposição com bancada existente (distância < 1 tile)
    const col = tileCol + 0.5;
    const row = tileRow + 0.5;
    if (
      this.placedObjects.some(
        (o) => Math.abs(o.col - col) < 1 && Math.abs(o.row - row) < 1,
      )
    )
      return false;
    // Bancada comunitária: máximo 1 por jogador
    if (
      this.placementMode === "bancada_comunitaria" &&
      this.placedObjects.some(
        (o) => o.type === "bancada_comunitaria" && o.owner === this.myName,
      )
    )
      return false;
    return true;
  }

  private startPlacement(item: GameItem) {
    this.placementMode = item.id;
    this.inventoryOpen = false;
  }

  private useConsumable(item: GameItem) {
    const qty = this.inventory.get(item.id) ?? 0;
    if (qty <= 0 || this.leiteTimer > 0) return;
    if (item.id === "leite_fluorescente") {
      this.leiteTimer = 5 * 60; // 5 minutos
      const newQty = qty - 1;
      if (newQty <= 0) this.inventory.delete(item.id);
      else this.inventory.set(item.id, newQty);
    }
  }

  private async placeObject(col: number, row: number) {
    const type = this.placementMode;
    if (!type || !this.myToken) return;
    this.placementMode = null;

    const res = await fetch("/objects/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.myToken, type, col, row }),
    });
    if (!res.ok) return;

    const data = (await res.json()) as {
      id: string;
      inventory: Record<string, number>;
    };
    this.inventory = new Map(Object.entries(data.inventory));

    // Bancada individual não vem via WS — adiciona localmente
    if (type === "bancada_individual") {
      this.placedObjects.push({
        id: data.id,
        type,
        owner: this.myName,
        ownerColor: this.myColor,
        col,
        row,
      });
    }
    // Bancada comunitária chega via WS broadcast (onObjectPlaced)
  }

  private async pickupBench(obj: PlacedObject) {
    if (!this.myToken) return;
    const res = await fetch(
      `/objects/${obj.id}?token=${encodeURIComponent(this.myToken)}`,
      { method: "DELETE" },
    );
    if (!res.ok) return;

    // Devolve ao inventário
    const cur = this.inventory.get(obj.type) ?? 0;
    const item = SHOP_ITEMS.find((it) => it.id === obj.type);
    if (item) this.inventory.set(obj.type, Math.min(cur + 1, item.maxLevel));

    // Remove localmente
    this.placedObjects = this.placedObjects.filter((o) => o.id !== obj.id);
    this.benchHubOpen = false;
    this.activeBench = null;
    this.triggerSave();
  }

  private async loadPlacedObjects() {
    if (!this.myToken) return;
    try {
      const res = await fetch(
        `/objects?token=${encodeURIComponent(this.myToken)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as PlacedObject[];
      // Merge: não duplica objetos que já vieram via WS (communityBenches no init)
      for (const obj of data) {
        if (!this.placedObjects.find((o) => o.id === obj.id)) {
          this.placedObjects.push(obj);
        }
      }
    } catch {
      /* ignorar falha de rede */
    }
  }

  private startTradeOffer(item: GameItem) {
    this.tradeItem = item;
    this.tradeItemLevel = this.inventory.get(item.id) ?? 1;
    this.tradeState = "selecting";
  }

  private confirmTradeOffer(playerId: string) {
    if (!this.tradeItem) return;
    this.network?.sendTradeOffer(
      playerId,
      this.tradeItem.id,
      this.tradeItemLevel,
    );
    this.tradeState = "waiting";
  }

  private acceptIncomingTrade() {
    if (!this.tradeIncoming) return;
    const { fromId, item, level } = this.tradeIncoming;
    // Add item to own inventory
    const cur = this.inventory.get(item.id) ?? 0;
    this.inventory.set(item.id, Math.min(cur + level, item.maxLevel));
    this.network?.sendTradeAccept(fromId);
    this.tradeResultMsg = `✅ Recebeu ${item.name} Lv${level}!`;
    this.tradeState = "result";
    this.tradeResultTimer = 2.5;
    this.tradeIncoming = null;
    this.triggerSave();
  }

  private declineIncomingTrade() {
    if (!this.tradeIncoming) return;
    this.network?.sendTradeDecline(this.tradeIncoming.fromId);
    this.tradeIncoming = null;
    this.tradeState = "idle";
  }

  private nearestWanderingCow(): Cow | null {
    let best: Cow | null = null,
      bd = Infinity;
    for (const c of this.cows) {
      if (c.state !== "wandering") continue;
      const d = dist(this.player, c);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private nearestChoppableTree(): { col: number; row: number } | null {
    const pc = this.player.col,
      pr = this.player.row;
    const r = Math.ceil(TREE_CHOP_DIST) + 1;
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const c = Math.floor(pc) + dc;
        const ro = Math.floor(pr) + dr;
        if (c < 0 || ro < 0 || c >= MAP_COLS || ro >= MAP_ROWS) continue;
        if (this.map[ro]![c]!.decoration !== "tree") continue;
        const d = Math.hypot(pc - c, pr - ro);
        if (d <= TREE_CHOP_DIST && d < bestDist) {
          bestDist = d;
          best = { col: c, row: ro };
        }
      }
    }
    return best;
  }

  /** Conta quantos slots de mochila estão ocupados (itens únicos) */
  private inventorySlotCount(): number {
    // Conta itens do shop + recursos (wood, stone)
    let count = 0;
    for (const [_id, qty] of this.inventory) {
      if (qty > 0) count++;
    }
    return count;
  }

  /** Tenta adicionar um recurso ao inventário respeitando o limite de slots e stack */
  private addResource(id: string, amount: number, maxStack: number): number {
    const current = this.inventory.get(id) ?? 0;
    if (current === 0 && this.inventorySlotCount() >= MAX_INVENTORY_SLOTS) return 0; // sem slot livre
    const gained = Math.min(amount, maxStack - current);
    if (gained > 0) this.inventory.set(id, current + gained);
    return gained;
  }

  private nearestBoulder(): { col: number; row: number } | null {
    const pc = this.player.col, pr = this.player.row;
    const r = Math.ceil(STONE_HARVEST_DIST) + 1;
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const c = Math.floor(pc) + dc;
        const ro = Math.floor(pr) + dr;
        if (c < 0 || ro < 0 || c >= MAP_COLS || ro >= MAP_ROWS) continue;
        if (this.map[ro]![c]!.decoration !== "boulder") continue;
        const d = Math.hypot(pc - c, pr - ro);
        if (d <= STONE_HARVEST_DIST && d < bestDist) {
          bestDist = d;
          best = { col: c, row: ro };
        }
      }
    }
    return best;
  }

  private harvestStone(_col: number, _row: number) {
    const drop = STONE_DROP_MIN + Math.floor(Math.random() * (STONE_DROP_MAX - STONE_DROP_MIN + 1));
    this.addResource("stone", drop, STONE_MAX_STACK);
    this.chopFlash = 0.2;
  }

  private startChop(col: number, row: number) {
    this.chop = { active: true, col, row, clickCount: 0, timeLeft: CHOP_TIME_LIMIT, flashTimer: 0 };
  }

  private updateChop(dt: number) {
    if (!this.chop.active) return;
    this.chop.timeLeft -= dt;
    if (this.chop.flashTimer > 0) this.chop.flashTimer -= dt;
    if (this.chop.clickCount >= CHOP_CLICKS_NEEDED) {
      // Sucesso
      const drop = WOOD_DROP_MIN + Math.floor(Math.random() * (WOOD_DROP_MAX - WOOD_DROP_MIN + 1));
      this.addResource("wood", drop, WOOD_MAX_STACK);
      const { col, row } = this.chop;
      this.map[row]![col]!.decoration = "none";
      this.choppedTrees.set(`${col},${row}`, 0);
      this.chopFlash = 0.3;
      this.chop.active = false;
      this.network?.sendTreeChop(col, row);
    } else if (this.chop.timeLeft <= 0) {
      // Falha
      this.chop.active = false;
    }
  }

  private hasMachado(): boolean {
    return (this.inventory.get("machado") ?? 0) > 0;
  }

  private craftMachado() {
    const stone = this.inventory.get("stone") ?? 0;
    if (stone < 5 || this.coins < 50) return;
    if (!this.hasMachado() && this.inventorySlotCount() >= MAX_INVENTORY_SLOTS) return;
    this.inventory.set("stone", stone - 5);
    if ((this.inventory.get("stone") ?? 0) === 0) this.inventory.delete("stone");
    this.coins -= 50;
    this.inventory.set("machado", 1);
  }

  // ─── Coordinates ──────────────────────────────────────────────────────────

  private wrapTextLines(
    text: string,
    maxWidth: number,
    font: string,
  ): string[] {
    const { ctx } = this;
    ctx.font = font;
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private isoToScreen(col: number, row: number) {
    return {
      x: (col - row) * (TILE_W / 2) + this.camX,
      y: (col + row) * (TILE_H / 2) + this.camY,
    };
  }

  private visibleTileRange() {
    const { camX: cx, camY: cy } = this;
    const W = this.canvas.width,
      H = this.canvas.height;
    const hw = TILE_W / 2,
      hh = TILE_H / 2;
    const buf = 3;
    const sMin = Math.floor(-cy / hh) - buf;
    const sMax = Math.ceil((H - cy) / hh) + buf;
    const dMin = Math.floor(-cx / hw) - buf;
    const dMax = Math.ceil((W - cx) / hw) + buf;
    return {
      colMin: Math.max(0, Math.floor((sMin + dMin) / 2)),
      colMax: Math.min(MAP_COLS - 1, Math.ceil((sMax + dMax) / 2)),
      rowMin: Math.max(0, Math.floor((sMin - dMax) / 2)),
      rowMax: Math.min(MAP_ROWS - 1, Math.ceil((sMax - dMin) / 2)),
    };
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  private render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.55);
    g.addColorStop(0, "#3a7fbf");
    g.addColorStop(1, "#a8d8ea");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.renderMap();
    this.renderStakeAimRing(); // range ring drawn under entities
    this.renderEntities();
    this.renderLasso();
    this.renderStake();
    this.renderBandits();
    this.renderNightOverlay();
    // Flash verde ao cortar árvore
    if (this.chopFlash > 0) {
      const alpha = (this.chopFlash / 0.25) * 0.25;
      this.ctx.fillStyle = `rgba(80,200,80,${alpha})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // UI de corte (minigame)
    if (this.chop.active) {
      const { ctx, canvas: cv } = this;
      const W = cv.width, H = cv.height;
      const progress = this.chop.clickCount / CHOP_CLICKS_NEEDED;
      const barW = Math.min(W - 80, 280);
      const bx = W / 2 - barW / 2;
      const by = H / 2 + 60;
      // fundo
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx - 8, by - 28, barW + 16, 64);
      ctx.strokeStyle = "#7a5c32";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 8, by - 28, barW + 16, 64);
      // label
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.textAlign = "center";
      ctx.drawImage(this.icons.axeIcon, W / 2 - 80, by - 26, 18, 18);
      ctx.fillText(`Cortando... ${this.chop.clickCount}/${CHOP_CLICKS_NEEDED}`, W / 2 + 2, by - 8);
      // barra
      ctx.fillStyle = "#2a1a08";
      ctx.fillRect(bx, by, barW, 18);
      const fillColor = progress > 0.7 ? "#4caf50" : progress > 0.4 ? "#ff9800" : "#f44336";
      ctx.fillStyle = fillColor;
      ctx.fillRect(bx, by, barW * progress, 18);
      ctx.strokeStyle = "#7a5c32";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, 18);
      // timer
      const timerFrac = this.chop.timeLeft / CHOP_TIME_LIMIT;
      ctx.fillStyle = timerFrac < 0.3 ? "#ff4444" : "#FFD700";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`${this.chop.timeLeft.toFixed(1)}s`, W / 2, by + 34);
      // flash click
      if (this.chop.flashTimer > 0) {
        const a = (this.chop.flashTimer / 0.1) * 0.15;
        ctx.fillStyle = `rgba(255,200,80,${a})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    if (this.bookOpen) this.renderBook();
    else this.renderUI();
    if (this.shopOpen) this.renderShop();
    if (this.benchHubOpen && this.activeBench) this.renderBenchHub();
  }

  // ─── Tile drawing ─────────────────────────────────────────────────────────

  private static TILE_COLORS: Record<TileType, [string, string, string]> = {
    grass: ["#56a832", "#346018", "#446828"],
    dry_grass: ["#a0b040", "#707020", "#888030"],
    dirt: ["#c89060", "#9a6838", "#b07848"],
    sand: ["#e8d090", "#c8a850", "#d8bc70"],
    rock: ["#8a8a8a", "#585858", "#6a6a6a"],
    water: ["#4a90d9", "#2a6090", "#3a7ab0"],
    base: ["#d4b070", "#a07838", "#c09048"],
  };

  // Maps tile type → sprite path (inside /sprites/tiles/)
  private static TILE_SPRITES: Partial<Record<TileType, string>> = {
    grass: "tiles/tile_grass.png",
    dry_grass: "tiles/tile_dry_grass.png",
    dirt: "tiles/tile_dirt.png",
    sand: "tiles/tile_sand.png",
    rock: "tiles/tile_rock.png",
    base: "tiles/tile_base.png",
    // water uses animation sheet below — no static entry needed
  };

  // Checkerboard alternate for grass
  private static TILE_SPRITES_ALT: Partial<Record<TileType, string>> = {
    grass: "tiles/tile_grass_dark.png",
  };

  // Animated sprite sheets: { path, frames, fps }
  private static TILE_ANIM: Partial<
    Record<TileType, { path: string; frames: number; fps: number }>
  > = {
    water: { path: "tiles/tile_water_anim.png", frames: 4, fps: 4 },
  };

  // ─── Panel — draws a clean pixel-art wood frame (canvas-only, no sprites) ──
  // Style variants: 0=warm brown, 1=darker brown, 2=grey-green, 3=olive
  private drawPanel(x: number, y: number, w: number, h: number, style = 0) {
    const { ctx } = this;

    const fills = ["#3a2208", "#261505", "#2a2d1e", "#282c1c"] as const;
    const borders = ["#7a5c32", "#5e4020", "#5a6445", "#525e40"] as const;
    const lights = ["#b08848", "#886030", "#8a9868", "#7a8858"] as const;
    const darks = ["#4a3018", "#341c0a", "#3a4228", "#343c24"] as const;
    const accents = ["#c89040", "#a07028", "#98a060", "#8a9050"] as const;

    const fill = fills[style] ?? fills[0];
    const border = borders[style] ?? borders[0];
    const light = lights[style] ?? lights[0];
    const dark = darks[style] ?? darks[0];
    const accent = accents[style] ?? accents[0];

    ctx.save();

    // ── Drop shadow ──────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x + 3, y + 3, w, h);

    // ── Outer border fill ────────────────────────────────────────────────────
    ctx.fillStyle = border;
    ctx.fillRect(x, y, w, h);

    // ── Bevel: top + left highlight ──────────────────────────────────────────
    ctx.fillStyle = light;
    ctx.fillRect(x, y, w, 3); // top
    ctx.fillRect(x, y, 3, h); // left

    // ── Bevel: bottom + right shadow ─────────────────────────────────────────
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h - 3, w, 3); // bottom
    ctx.fillRect(x + w - 3, y, 3, h); // right

    // ── Inner fill ───────────────────────────────────────────────────────────
    ctx.fillStyle = fill;
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);

    // ── Inner bevel: top + left ───────────────────────────────────────────────
    ctx.fillStyle = "rgba(255,210,130,0.10)";
    ctx.fillRect(x + 4, y + 4, w - 8, 2);
    ctx.fillRect(x + 4, y + 4, 2, h - 8);

    // ── Inner bevel: bottom + right ──────────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x + 4, y + h - 6, w - 8, 2);
    ctx.fillRect(x + w - 6, y + 4, 2, h - 8);

    // ── Gold accent line ─────────────────────────────────────────────────────
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
    ctx.globalAlpha = 1;

    // ── Corner rivets ────────────────────────────────────────────────────────
    const drawRivet = (rx: number, ry: number) => {
      ctx.fillStyle = accent;
      ctx.fillRect(rx, ry, 5, 5);
      ctx.fillStyle = light; // highlight pixel (top-left)
      ctx.fillRect(rx, ry, 2, 2);
      ctx.fillStyle = "rgba(0,0,0,0.45)"; // shadow pixel (bottom-right)
      ctx.fillRect(rx + 3, ry + 3, 2, 2);
    };
    drawRivet(x + 2, y + 2);
    drawRivet(x + w - 7, y + 2);
    drawRivet(x + 2, y + h - 7);
    drawRivet(x + w - 7, y + h - 7);

    ctx.restore();
  }

  // ─── Button — craftpix-style wood pixel-art button ────────────────────────
  // Three states:  normal (raised dark wood) | active (amber lit) | pressed (sunken)
  private drawPixelBtn(
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    state: "normal" | "active" | "pressed" = "normal",
    _wide = false, // kept for API compatibility
  ) {
    const { ctx } = this;
    ctx.save();

    // Base colors from craftpix palette
    const bg =
      state === "active"
        ? "#9b6218"
        : state === "pressed"
          ? "#4a2808"
          : "#5c3a10";
    const rimTop =
      state === "active"
        ? "#e0a840"
        : state === "pressed"
          ? "#361808"
          : "#9b7e57";
    const rimBot =
      state === "active"
        ? "#7a4810"
        : state === "pressed"
          ? "#6a3c18"
          : "#3a2208";
    const inner =
      state === "active"
        ? "#c88430"
        : state === "pressed"
          ? "#382010"
          : "#75491c";

    // Outer rim
    ctx.fillStyle = rimBot;
    ctx.fillRect(dx, dy, dw, dh);
    // Top-highlight rim
    ctx.fillStyle = rimTop;
    ctx.fillRect(dx, dy, dw, 3);
    ctx.fillRect(dx, dy, 3, dh);
    // Inner face
    ctx.fillStyle = bg;
    ctx.fillRect(dx + 3, dy + 3, dw - 5, dh - 5);
    // Subtle inner bevel
    ctx.fillStyle = inner;
    ctx.fillRect(dx + 4, dy + 4, dw - 7, dh - 7);
    // 1-px gold border
    ctx.strokeStyle = state === "active" ? "#ffd060" : "#a07838";
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);

    ctx.restore();
  }

  // Reusable diamond clip path (top face only)
  private clipToDiamond(x: number, y: number, hw: number, hh: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.clip();
  }

  private drawTile(col: number, row: number, tile: Tile) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(col, row);
    const hw = TILE_W / 2,
      hh = TILE_H / 2,
      depth = 7;

    // ── Side faces (always canvas) ────────────────────────────────────────────
    const [, sideL, sideR] = Game.TILE_COLORS[tile.type];

    ctx.fillStyle = sideL;
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x, y + hh + depth);
    ctx.lineTo(x - hw, y + depth);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = sideR;
    ctx.beginPath();
    ctx.moveTo(x, y + hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x + hw, y + depth);
    ctx.lineTo(x, y + hh + depth);
    ctx.closePath();
    ctx.fill();

    // ── Top face: sprite (clipped to diamond) or canvas fallback ─────────────
    const isDark = (col + row) % 2 === 0;

    // Animated sprite sheet (e.g. water)
    const anim = Game.TILE_ANIM[tile.type];
    if (anim) {
      const img = sprites.get(anim.path);
      if (img) {
        const frame = Math.floor(this.time * anim.fps) % anim.frames;
        const frameW = img.width / anim.frames;
        ctx.save();
        this.clipToDiamond(x, y, hw, hh);
        ctx.drawImage(
          img,
          frame * frameW,
          0,
          frameW,
          img.height,
          x - hw,
          y - hh,
          TILE_W,
          TILE_H,
        );
        ctx.restore();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - hh);
        ctx.lineTo(x + hw, y);
        ctx.lineTo(x, y + hh);
        ctx.lineTo(x - hw, y);
        ctx.closePath();
        ctx.stroke();
        return;
      }
    }

    // Static sprite
    const altPath = isDark ? Game.TILE_SPRITES_ALT[tile.type] : undefined;
    const spritePath = altPath ?? Game.TILE_SPRITES[tile.type];
    if (spritePath) {
      const img = sprites.get(spritePath);
      if (img) {
        ctx.save();
        this.clipToDiamond(x, y, hw, hh);
        ctx.drawImage(img, x - hw, y - hh, TILE_W, TILE_H);
        ctx.restore();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - hh);
        ctx.lineTo(x + hw, y);
        ctx.lineTo(x, y + hh);
        ctx.lineTo(x - hw, y);
        ctx.closePath();
        ctx.stroke();
        return;
      }
    }

    // ── Canvas fallback top face ──────────────────────────────────────────────
    let [top] = Game.TILE_COLORS[tile.type];

    if (tile.type === "water") {
      const wave = Math.sin(this.time * 1.5 + (col + row) * 0.4) * 0.06;
      const b = Math.floor(0xd9 + wave * 0x30);
      top = `rgb(74,${b},${217 + Math.floor(wave * 20)})`;
    }
    if (tile.type === "grass" && isDark) top = "#4e9e2c"; // canvas fallback only

    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  /**
   * plants.png layout: 9 columns × 2 rows, each cell 48 × 56 px
   * Row 0 (large): col 0-3 = big trees/bushes, col 4-5 = shrubs, col 6-7 = flowering, col 8 = cactus
   * Row 1 (medium): col 0-3 = medium bushes, col 4-5 = shrubs, col 6-7 = flowers, col 8 = small plant
   */
  private drawPlantSprite(
    x: number,
    y: number,
    spriteCol: number,
    spriteRow: number,
    scale = 1,
  ) {
    const img = sprites.get("decorations/plants.png");
    if (!img) return false;
    const CW = 48,
      CH = 56;
    const dw = CW * scale,
      dh = CH * scale;
    this.ctx.drawImage(
      img,
      spriteCol * CW,
      spriteRow * CH,
      CW,
      CH,
      x - dw / 2,
      y - dh + 8,
      dw,
      dh,
    );
    return true;
  }

  private drawDecoration(col: number, row: number, deco: Tile["decoration"]) {
    if (deco === "none") return;
    const { ctx } = this;
    const { x, y } = this.isoToScreen(col, row);
    const hash = col * 3 + row * 7;

    if (deco === "tree") {
      // Pick tree sprite by tile hash: 0=Curved, 1=White, 2=BlueBalls
      const treeKeys = [
        "decorations/Curved_tree1.png",
        "decorations/White_tree1.png",
        "decorations/Blue-green_balls_tree3.png",
      ];
      const key = treeKeys[hash % 3]!;
      const img = sprites.get(key);
      if (img) {
        if (key.includes("Blue-green")) {
          // 32x32 sprite — scale up to fit isometric tile nicely
          ctx.drawImage(img, 0, 0, 32, 32, x - 32, y - 62, 64, 64);
        } else {
          // 128x128 sprite — anchor base at tile center
          ctx.drawImage(img, 0, 0, 128, 128, x - 64, y - 118, 128, 128);
        }
        return;
      }
      // canvas fallback while loading
      ctx.fillStyle = "#5a3010";
      ctx.fillRect(x - 3, y - 16, 6, 14);
      ctx.fillStyle = "#2d7a20";
      ctx.beginPath();
      ctx.ellipse(x, y - 22, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === "bush") {
      // Pick one of 4 medium bush variants (row 1, cols 0-3)
      const variant = hash % 4;
      if (this.drawPlantSprite(x, y, variant, 1, 0.9)) return;
      // canvas fallback
      ctx.fillStyle = "#2e7d32";
      ctx.beginPath();
      ctx.ellipse(x, y - 8, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#388e3c";
      ctx.beginPath();
      ctx.ellipse(x - 5, y - 6, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 5, y - 6, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === "flower") {
      // Use flowering sprites (row 0 or 1, cols 6-7)
      const variant = hash % 2;
      const sprRow = hash % 2;
      if (this.drawPlantSprite(x, y, 6 + variant, sprRow, 0.7)) return;
      // canvas fallback
      const colors = ["#f44336", "#e91e63", "#ffeb3b", "#ff9800"];
      ctx.fillStyle = colors[hash % colors.length]!;
      ctx.beginPath();
      ctx.arc(x, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffff00";
      ctx.beginPath();
      ctx.arc(x, y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco === "cactus") {
      // Use col 8 (cactus/spiky plant) from row 0 or 1
      const sprRow = hash % 2;
      if (this.drawPlantSprite(x, y, 8, sprRow, 1.0)) return;
      // canvas fallback
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(x - 3, y - 22, 6, 20);
      ctx.fillRect(x - 10, y - 16, 7, 4);
      ctx.fillRect(x + 3, y - 13, 7, 4);
    } else if (deco === "boulder") {
      const img = sprites.get("decorations/rocks.png");
      if (img) {
        // 4 columns × ~5 rows of rocks; pick variant from tile hash
        const variant = (col * 3 + row * 7) % 4;
        const cellW = 64,
          cellH = 64;
        const sx = variant * cellW;
        ctx.drawImage(img, sx, 0, cellW, cellH, x - 32, y - 56, 64, 64);
      } else {
        // canvas fallback
        ctx.fillStyle = "#757575";
        ctx.beginPath();
        ctx.ellipse(x, y - 5, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9e9e9e";
        ctx.beginPath();
        ctx.ellipse(x - 2, y - 7, 5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawStump(col: number, row: number) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(col, row);
    // Tronco cortado
    ctx.fillStyle = "#5a3010";
    ctx.fillRect(x - 5, y - 9, 10, 8);
    // Topo do toco (elipse mais clara com anéis)
    ctx.fillStyle = "#8b5e30";
    ctx.beginPath();
    ctx.ellipse(x, y - 9, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6b4220";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(x, y - 9, 2.5, 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderMap() {
    const { colMin, colMax, rowMin, rowMax } = this.visibleTileRange();

    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const tile = this.map[r]![c]!;
        this.drawTile(c, r, tile);
      }
    }

    // Fence around base
    this.renderFence();

    // Base label
    const { x, y } = this.isoToScreen(BASE_COL + BASE_SIZE / 2, BASE_ROW);
    this.ctx.fillStyle = "rgba(0,0,0,0.55)";
    this.ctx.font = "bold 12px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("🏠 BASE", x, y - 12);
  }

  private renderFence() {
    const { ctx } = this;
    const c1 = BASE_COL,
      r1 = BASE_ROW;
    const c2 = BASE_COL + BASE_SIZE,
      r2 = BASE_ROW + BASE_SIZE;
    ctx.strokeStyle = "#6B3410";
    ctx.lineWidth = 2;

    for (let i = 0; i <= BASE_SIZE; i++) {
      this.drawFencePost(c1 + i, r1);
      this.drawFencePost(c1 + i, r2);
      this.drawFencePost(c1, r1 + i);
      if (i < BASE_SIZE - 1) this.drawFencePost(c2, r1 + i);
    }
    for (let i = 0; i < BASE_SIZE; i++) {
      const a = this.isoToScreen(c1 + i, r1),
        b = this.isoToScreen(c1 + i + 1, r1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 4);
      ctx.lineTo(b.x, b.y - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const a2 = this.isoToScreen(c1, r1 + i),
        b2 = this.isoToScreen(c1, r1 + i + 1);
      ctx.beginPath();
      ctx.moveTo(a2.x, a2.y - 4);
      ctx.lineTo(b2.x, b2.y - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a2.x, a2.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.stroke();
    }
  }

  private drawFencePost(col: number, row: number) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(col, row);
    ctx.fillStyle = "#5c2e08";
    ctx.fillRect(x - 3, y - 16, 6, 20);
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(x - 4, y - 18, 8, 5);
  }

  // ─── Entity rendering ──────────────────────────────────────────────────────

  private renderEntities() {
    const { colMin, colMax, rowMin, rowMax } = this.visibleTileRange();

    // Pass 1: flat decorations (flowers) that never overlap entities
    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const tile = this.map[r]![c]!;
        const deco = tile.decoration;
        // Tall objects (tree, bush, cactus, boulder) go into depth-sorted pass
        if (
          deco !== "none" &&
          deco !== "tree" &&
          deco !== "bush" &&
          deco !== "cactus" &&
          deco !== "boulder"
        )
          this.drawDecoration(c, r, deco);
      }
    }

    // Pass 2: entities + tall decorations sorted by depth
    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];

    // Tall decorations
    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const tile = this.map[r]![c]!;
        const deco = tile.decoration;
        if (
          deco === "tree" ||
          deco === "bush" ||
          deco === "cactus" ||
          deco === "boulder"
        ) {
          const col = c,
            row = r;
          items.push({
            depth: col + row,
            draw: () => this.drawDecoration(col, row, deco),
          });
        }
      }
    }

    // Stumps for chopped trees
    for (const key of this.choppedTrees.keys()) {
      const parts = key.split(",");
      const c = Number(parts[0]),
        ro = Number(parts[1]);
      if (c < colMin || c > colMax || ro < rowMin || ro > rowMax) continue;
      const col = c,
        row = ro;
      items.push({
        depth: col + row,
        draw: () => this.drawStump(col, row),
      });
    }

    items.push({
      depth: this.player.col + this.player.row,
      draw: () => this.drawPlayer(),
    });

    // Vendedor NPC
    items.push({
      depth: VENDOR_COL + VENDOR_ROW - 0.5,
      draw: () => this.drawVendorNPC(),
    });

    // Bolo de aniversário (evento)
    if (this.isBirthdayActive) {
      items.push({
        depth: CAKE_COL + CAKE_ROW - 0.3,
        draw: () => this.drawBirthdayCake(),
      });
    }

    for (const cow of this.cows) {
      const c = cow;
      items.push({
        depth: c.col + c.row + (c.state === "based" ? -100 : 0),
        draw: () => this.drawCow(c),
      });
    }

    // Jogadores remotos + rebanho deles (depth sorted separadamente)
    for (const [, rp] of this.remotePlayers) {
      const r = rp;
      // Vacas seguindo o jogador remoto — cada uma entra no sort individualmente
      const hN = Math.min(r.herdCount ?? 0, 12);
      for (let i = 0; i < hN; i++) {
        const tCol = r.col - r.dirCol * (i + 1) * 1.1;
        const tRow = r.row - r.dirRow * (i + 1) * 1.1;
        const alpha = Math.max(0.45, 0.9 - i * 0.07);
        const herdbob = r.moving ? Math.sin(this.time * 9 + i * 1.4) * 1.5 : 0;
        items.push({
          depth: tCol + tRow,
          draw: () =>
            this.drawRemoteBasedCow(tCol, tRow, r.color, alpha, herdbob),
        });
      }
      items.push({
        depth: r.col + r.row,
        draw: () => this.drawRemotePlayer(r),
      });
    }

    // Vacas de outros jogadores no curral
    for (const [, batch] of this.remoteCowsInBase) {
      for (const pos of batch.cows) {
        const p = pos,
          color = batch.color;
        items.push({
          depth: p.col + p.row - 100,
          draw: () => this.drawRemoteBasedCow(p.col, p.row, color),
        });
      }
    }

    // Bancadas posicionadas
    for (const obj of this.placedObjects) {
      const o = obj;
      items.push({
        depth: o.col + o.row,
        draw: () => this.drawBench(o),
      });
    }

    // Preview de posicionamento (tile hover)
    if (this.placementMode) {
      const mc = this.mouseTileCol;
      const mr = this.mouseTileRow;
      const pm = this.placementMode;
      const valid = this.isPlacementValid(mc, mr);
      items.push({
        depth: mc + 0.5 + mr + 0.5 + 0.0001,
        draw: () => this.drawBenchPreview(mc + 0.5, mr + 0.5, pm, valid),
      });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();

    // HUD de modo posicionamento (por cima de tudo)
    if (this.placementMode) {
      this.drawPlacementHUD();
    }
  }

  // ─── Player drawing ───────────────────────────────────────────────────────

  /** Map dirCol/dirRow to the sprite direction name */
  private getSpriteDir(dc: number, dr: number): string {
    if (dc === 1 && dr === -1) return "north-east";
    if (dc === 1 && dr === 0) return "east";
    if (dc === 1 && dr === 1) return "south-east";
    if (dc === 0 && dr === 1) return "south";
    if (dc === -1 && dr === 1) return "south-west";
    if (dc === -1 && dr === 0) return "west";
    if (dc === -1 && dr === -1) return "north-west";
    return "north";
  }

  // ─── Bench drawing ────────────────────────────────────────────────────────

  private drawBench(obj: PlacedObject) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(obj.col, obj.row);
    const isComm = obj.type === "bancada_comunitaria";

    const spritePath = isComm
      ? "itens/workbanch_comunity.png"
      : "itens/individual_workbanch.png";
    const sprite = sprites.get(spritePath);
    if (sprite) {
      const sw = 64,
        sh = 64;
      ctx.drawImage(sprite, x - sw / 2, y - sh + 8, sw, sh);
    } else {
      // Fallback canvas
      const hw = 22,
        hh = 11,
        tableH = 16;
      ctx.save();
      ctx.translate(x, y - 18);
      ctx.fillStyle = isComm ? "#7a4e28" : "#5a3818";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-hw, hh);
      ctx.lineTo(-hw, hh + tableH);
      ctx.lineTo(0, tableH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = isComm ? "#5a3818" : "#3e2810";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(hw, hh);
      ctx.lineTo(hw, hh + tableH);
      ctx.lineTo(0, tableH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = isComm ? "#c4884f" : "#9a6a3a";
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(0, hh);
      ctx.lineTo(-hw, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw, hh + tableH);
      ctx.lineTo(0, hh + tableH);
      ctx.lineTo(-hw, hh + tableH);
      ctx.lineTo(-hw, hh);
      ctx.lineTo(0, -hh);
      ctx.stroke();
      ctx.restore();
    }

    // Label de dono
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (isComm) {
      ctx.font = "bold 10px sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.fillText("👥 " + obj.owner, x, y - 56);
    } else {
      ctx.font = "9px sans-serif";
      ctx.fillStyle = obj.ownerColor;
      ctx.fillText(obj.owner, x, y - 56);
    }
    ctx.restore();
  }

  private drawBenchPreview(
    col: number,
    row: number,
    type: string,
    valid: boolean,
  ) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(col, row);
    const isComm = type === "bancada_comunitaria";
    const hw = 22,
      hh = 11,
      tableH = 16;

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(x, y - 18);

    ctx.fillStyle = valid ? (isComm ? "#c4884f" : "#9a6a3a") : "#aa2222";
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(hw, hh + tableH);
    ctx.lineTo(-hw, hh + tableH);
    ctx.lineTo(-hw, hh);
    ctx.lineTo(0, -hh);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = valid ? "#98FF98" : "#FF4444";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  private drawPlacementHUD() {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H - 48, W, 48);
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label =
      this.placementMode === "bancada_comunitaria"
        ? "🏗️ Bancada Comunitária"
        : "🔨 Bancada Individual";
    ctx.fillText(
      `${label} — Clique no mapa para posicionar | ESC para cancelar`,
      W / 2,
      H - 24,
    );
    ctx.restore();
  }

  // ─── Remote player drawing ────────────────────────────────────────────────

  private drawRemotePlayer(rp: RemotePlayer) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(rp.col, rp.row);
    const bob = rp.moving
      ? Math.sin(this.time * 11 + rp.id.charCodeAt(0)) * 2
      : 0;
    const py = y + bob;

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tenta usar o sprite do player com tint colorido
    const dir = this.getSpriteDir(rp.dirCol, rp.dirRow);
    const frame = Math.floor(this.time * 8) % 4;
    const spritePath = rp.moving
      ? `player/run/${dir}/frame_00${frame}.png`
      : `player/idle/${dir}.png`;
    const img = sprites.get(spritePath);
    const SW = 64,
      SH = 64;

    if (img) {
      // Desenha sprite com tint usando offscreen canvas
      const off = document.createElement("canvas");
      off.width = SW;
      off.height = SH;
      const oCtx = off.getContext("2d")!;
      oCtx.drawImage(img, 0, 0, SW, SH);
      oCtx.globalCompositeOperation = "source-atop";
      oCtx.globalAlpha = 0.55;
      oCtx.fillStyle = rp.color;
      oCtx.fillRect(0, 0, SW, SH);
      ctx.drawImage(off, x - SW / 2, y - SH + 12, SW, SH);
    } else {
      // Fallback canvas colorido
      ctx.fillStyle = rp.color;
      ctx.fillRect(x - 9, py - 26, 18, 20);
      ctx.fillStyle = "#f4c28a";
      ctx.fillRect(x - 7, py - 38, 14, 14);
      ctx.fillStyle = "#5c3010";
      ctx.fillRect(x - 10, py - 54, 20, 18);
      ctx.fillStyle = "#3a1a00";
      ctx.fillRect(x - 12, py - 38, 24, 4); // aba do chapéu
    }

    // Tag com nome
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const tw = ctx.measureText(rp.name).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - tw / 2 - 4, py - 72, tw + 8, 15);
    ctx.fillStyle = rp.color;
    ctx.textBaseline = "top";
    ctx.fillText(rp.name, x, py - 71);
    ctx.textBaseline = "alphabetic";

    // Balão de fala (se mensagem recente - últimos 5 segundos)
    if (rp.lastMessage && rp.lastMessageTime) {
      const elapsed = Date.now() - rp.lastMessageTime;
      if (elapsed < 5000) {
        const alpha = elapsed < 4000 ? 1 : 1 - (elapsed - 4000) / 1000;
        ctx.globalAlpha = alpha;

        // Truncar mensagem se muito longa
        ctx.font = "10px sans-serif";
        let displayText = rp.lastMessage;
        const maxW = 120;
        if (ctx.measureText(displayText).width > maxW) {
          while (
            ctx.measureText(displayText + "...").width > maxW &&
            displayText.length > 0
          ) {
            displayText = displayText.slice(0, -1);
          }
          displayText += "...";
        }

        const msgW = ctx.measureText(displayText).width;
        const bubbleW = msgW + 12;
        const bubbleH = 18;
        const bubbleX = x - bubbleW / 2;
        const bubbleY = py - 94;

        // Fundo do balão
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.fill();

        // Pontinha do balão
        ctx.beginPath();
        ctx.moveTo(x - 5, bubbleY + bubbleH);
        ctx.lineTo(x, bubbleY + bubbleH + 6);
        ctx.lineTo(x + 5, bubbleY + bubbleH);
        ctx.closePath();
        ctx.fill();

        // Borda do balão
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.stroke();

        // Texto
        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, x, bubbleY + bubbleH / 2);
        ctx.textBaseline = "alphabetic";

        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── Remote based cow ─────────────────────────────────────────────────────
  // Vaca simples colorida representando a vaca de outro jogador no curral

  private drawRemoteBasedCow(
    col: number,
    row: number,
    color: string,
    baseAlpha = 0.88,
    bob = 0,
  ) {
    const { ctx } = this;
    const { x, y: yBase } = this.isoToScreen(col, row);
    const y = yBase + bob;

    ctx.save();

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Corpo colorido com borda mais escura
    ctx.globalAlpha = baseAlpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - 15, y - 19, 28, 15, 4);
    ctx.fill();

    // Mancha branca no corpo
    ctx.globalAlpha = baseAlpha * 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x - 3, y - 13, 5, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = baseAlpha;

    // Cabeça
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 8, y - 27, 11, 10, 3);
    ctx.fill();

    // Focinho
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(x + 15, y - 22, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patas
    ctx.fillStyle = color;
    ctx.fillRect(x - 12, y - 5, 4, 6);
    ctx.fillRect(x - 5, y - 5, 4, 6);
    ctx.fillRect(x + 3, y - 5, 4, 6);
    ctx.fillRect(x + 10, y - 5, 4, 6);

    // Pequeno ícone de cor do dono (bolinha no topo)
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - 14, y - 24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ─── Player drawing ───────────────────────────────────────────────────────

  private drawPlayer() {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(this.player.col, this.player.row);

    // ── Leite Fluorescente glow ───────────────────────────────────────────────
    if (this.leiteTimer > 0) {
      const pulse = 0.65 + 0.35 * Math.sin(this.time * 3.5);
      const alpha = Math.min(1, this.leiteTimer / 5) * pulse;
      const grad = ctx.createRadialGradient(x, y - 16, 8, x, y - 16, 72);
      grad.addColorStop(0, `rgba(180,255,120,${alpha * 0.8})`);
      grad.addColorStop(0.45, `rgba(100,220,60,${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(60,180,20,0)`);
      ctx.beginPath();
      ctx.ellipse(x, y - 16, 72, 72, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ── Shadow ────────────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Sprite ────────────────────────────────────────────────────────────────
    const SW = 64,
      SH = 64; // sprite dimensions
    const dir = this.getSpriteDir(this.player.dirCol, this.player.dirRow);

    let spritePath: string;
    if (this.player.moving) {
      const frame = Math.floor(this.time * 8) % 4;
      spritePath = `player/run/${dir}/frame_00${frame}.png`;
    } else {
      spritePath = `player/idle/${dir}.png`;
    }

    const img = sprites.get(spritePath);
    if (img) {
      ctx.drawImage(img, x - SW / 2, y - SH + 12, SW, SH);
    }

    // Capture range ring
    if (!this.lasso.active) {
      const nearest = this.nearestWanderingCow();
      if (nearest) {
        const d = dist(this.player, nearest);
        const inRange = d <= CAPTURE_DIST;
        if (d <= CAPTURE_DIST * 2) {
          const alpha = inRange
            ? 0.55
            : Math.max(0, 0.2 - (d - CAPTURE_DIST) * 0.08);
          ctx.strokeStyle = `rgba(255,215,0,${alpha})`;
          ctx.lineWidth = inRange ? 2 : 1;
          ctx.setLineDash([7, 4]);
          ctx.beginPath();
          const r = CAPTURE_DIST * (TILE_W / 2) * 0.8;
          ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Balão de fala do jogador local (se mensagem recente - últimos 5 segundos)
    if (this.myLastMessage && this.myLastMessageTime) {
      const elapsed = Date.now() - this.myLastMessageTime;
      if (elapsed < 5000) {
        const alpha = elapsed < 4000 ? 1 : 1 - (elapsed - 4000) / 1000;
        ctx.globalAlpha = alpha;

        // Truncar mensagem se muito longa
        ctx.font = "10px sans-serif";
        let displayText = this.myLastMessage;
        const maxW = 120;
        if (ctx.measureText(displayText).width > maxW) {
          while (
            ctx.measureText(displayText + "...").width > maxW &&
            displayText.length > 0
          ) {
            displayText = displayText.slice(0, -1);
          }
          displayText += "...";
        }

        const msgW = ctx.measureText(displayText).width;
        const bubbleW = msgW + 12;
        const bubbleH = 18;
        const bubbleX = x - bubbleW / 2;
        const bubbleY = y - 80;

        // Fundo do balão
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.fill();

        // Pontinha do balão
        ctx.beginPath();
        ctx.moveTo(x - 5, bubbleY + bubbleH);
        ctx.lineTo(x, bubbleY + bubbleH + 6);
        ctx.lineTo(x + 5, bubbleY + bubbleH);
        ctx.closePath();
        ctx.fill();

        // Borda do balão
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.stroke();

        // Texto
        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayText, x, bubbleY + bubbleH / 2);
        ctx.textBaseline = "alphabetic";

        ctx.globalAlpha = 1;
      }
    }
  }

  // ─── Cow drawing ──────────────────────────────────────────────────────────

  private drawCow(cow: Cow) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(cow.col, cow.row);
    const bob =
      cow.state === "wandering" ? Math.sin(this.time * 5 + cow.id) * 0.8 : 0;
    const cy = y + bob;
    const t = cow.type;

    const isTranslucent = t.renderStyle === "translucent";
    const prevAlpha = ctx.globalAlpha;
    if (isTranslucent) {
      // Vacas translúcidas noturnas ficam mais visíveis à noite
      const baseAlpha = t.nightOnly ? 0.7 + this.nightFade * 0.15 : 0.55;
      ctx.globalAlpha = baseAlpha + Math.sin(this.time * 2 + cow.id) * 0.1;
    }

    // Glow / cosmic halo
    if (t.renderStyle === "glowing" || t.renderStyle === "cosmic") {
      const nightBoost = t.nightOnly ? 1 + this.nightFade * 2.2 : 1;
      const pulse = 0.5 + Math.sin(this.time * 3 + cow.id) * 0.3;
      // Vacas noturnas: halo externo extra
      if (t.nightOnly && this.nightFade > 0) {
        ctx.fillStyle = t.glowColor ?? "rgba(255,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(
          x,
          cy - 10,
          (48 + pulse * 10) * nightBoost,
          (30 + pulse * 7) * nightBoost,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = t.glowColor ?? "rgba(255,215,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(
        x,
        cy - 10,
        (32 + pulse * 6) * (t.nightOnly ? 1 + this.nightFade * 0.8 : 1),
        (20 + pulse * 4) * (t.nightOnly ? 1 + this.nightFade * 0.8 : 1),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Shadow
    ctx.globalAlpha = isTranslucent ? 0.1 : ctx.globalAlpha * 0.7;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (isTranslucent)
      ctx.globalAlpha = 0.55 + Math.sin(this.time * 2 + cow.id) * 0.1;
    else ctx.globalAlpha = prevAlpha;

    // Sprite customizado substitui o canvas drawing do corpo
    const cowSprite = t.sprite ? sprites.get(t.sprite) : null;
    const useSprite = !!cowSprite;

    const body = t.bodyColor;
    const spot = t.spotColor;

    if (useSprite) {
      // Sprite customizado
      const sw = 52,
        sh = 52;
      ctx.drawImage(cowSprite!, x - sw / 2, cy - sh + 4, sw, sh);
    } else {
      // Canvas drawing padrão
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(x - 16, cy - 20, 30, 16, 4);
      ctx.fill();

      if (t.renderStyle === "striped") {
        ctx.fillStyle = spot;
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(x - 14 + i * 7, cy - 20, 3, 16);
        }
      } else if (t.renderStyle === "cosmic") {
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 8; i++) {
          const sx =
            x - 14 + Math.sin(i * 1.3 + this.time * 0.5 + cow.id) * 10 + 10;
          const sy = cy - 14 + Math.cos(i * 1.7 + this.time * 0.3 + cow.id) * 5;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = spot;
        ctx.beginPath();
        ctx.ellipse(x - 6, cy - 14, 5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 5, cy - 11, 4, 5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        if (t.secondaryColor) {
          ctx.fillStyle = t.secondaryColor;
          ctx.beginPath();
          ctx.ellipse(x - 2, cy - 18, 4, 3, 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Head
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(x + 12, cy - 22, 14, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.fillRect(x + 21, cy - 20, 2, 2);
      ctx.fillStyle = "#f4a0a0";
      ctx.beginPath();
      ctx.ellipse(x + 24, cy - 14, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4c0b0";
      ctx.beginPath();
      ctx.ellipse(x + 13, cy - 21, 3, 4, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.fillStyle = t.renderStyle === "cosmic" ? "#0a0820" : "#ddd";
      for (const lx of [x - 12, x - 4, x + 4, x + 10])
        ctx.fillRect(lx, cy - 4, 4, 8);

      // Tail
      ctx.strokeStyle = body;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 16, cy - 14);
      ctx.quadraticCurveTo(x - 24, cy - 10, x - 20, cy - 4);
      ctx.stroke();
    }

    ctx.globalAlpha = prevAlpha;

    // Sparkle on fresh capture
    if (cow.sparkTimer > 0) {
      const pct = cow.sparkTimer / 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.time * 3;
        const r = (1 - pct) * 28;
        const sx = x + Math.cos(a) * r;
        const sy = cy - 10 + Math.sin(a) * r * 0.5;
        ctx.fillStyle = `rgba(255,220,50,${pct * 0.9})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 3 * pct, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // State / wary badge
    ctx.textAlign = "center";
    if (cow.state === "lassoed") {
      ctx.fillStyle = "rgba(255,200,0,0.95)";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("!", x, cy - 28);
    } else if (cow.state === "captured") {
      ctx.fillStyle = "rgba(50,200,50,0.95)";
      ctx.font = "14px sans-serif";
      ctx.fillText("✓", x, cy - 28);
    } else if (cow.state === "based" || cow.state === "stolen") {
      ctx.font = "11px sans-serif";
      ctx.fillText("🏠", x, cy - 26);
    } else if (cow.state === "wandering" && cow.type.fearDistance > 0) {
      // Show 👀 when player is within fear range
      const pd = dist(this.player, cow);
      if (pd < cow.type.fearDistance) {
        const blink = Math.sin(this.time * 6) > 0; // blink faster when closer
        if (blink || pd > cow.type.fearDistance * 0.6) {
          ctx.font = "12px sans-serif";
          ctx.drawImage(this.icons.eyeIcon, x - 8, cy - 36, 16, 16);
        }
      }
    }
  }

  // ─── Lasso ────────────────────────────────────────────────────────────────

  private renderLasso() {
    if (!this.lasso.active || !this.lasso.cow) return;
    const { ctx, lasso: l } = this;
    const ps = this.isoToScreen(this.player.col, this.player.row);
    const cs = this.isoToScreen(l.cow!.col, l.cow!.row);
    const t = l.phase === "throwing" ? l.throwT : 1;
    const ex = ps.x + (cs.x - ps.x) * t;
    const ey = ps.y - 30 + (cs.y - 20 - (ps.y - 30)) * t;
    const swing = l.phase === "pulling" ? Math.sin(this.time * 22) * 9 : 0;

    ctx.beginPath();
    ctx.moveTo(ps.x, ps.y - 30);
    ctx.quadraticCurveTo(
      (ps.x + ex) / 2 + swing,
      Math.min(ps.y, ey) - 55,
      ex,
      ey,
    );
    ctx.strokeStyle = "#8B4513";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (t >= 1) {
      const ls =
        l.phase === "pulling" ? 1 + Math.sin(this.time * 22) * 0.12 : 1;
      ctx.strokeStyle = "#5c2e08";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cs.x, cs.y - 18, 12 * ls, 5 * ls, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ─── Stake rendering ──────────────────────────────────────────────────────

  /** Range ring + target preview shown while aiming */
  private renderStakeAimRing() {
    if (this.stake.phase !== "aiming") return;
    const { ctx } = this;
    const ps = this.isoToScreen(this.player.col, this.player.row);

    // Range ellipse (isometric circle ≈ ellipse with x:y = 2:1)
    const rx = STAKE_RANGE * (TILE_W / 2) * 0.88;
    const ry = rx * 0.45;
    ctx.strokeStyle = "rgb(247, 145, 13)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.ellipse(ps.x, ps.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = "rgb(255, 200, 80)";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Clique para arremessar a estaca", ps.x, ps.y - ry - 10);
  }

  /** Stake object + rope during fly / pull */
  private renderStake() {
    const s = this.stake;
    if (s.phase === "idle" || s.phase === "aiming") return;

    const { ctx } = this;
    const ps = this.isoToScreen(this.player.col, this.player.row);

    // Current stake screen position
    const stakePos =
      s.phase === "flying"
        ? this.isoToScreen(s.flyCol, s.flyRow)
        : this.isoToScreen(s.targetCol, s.targetRow);

    // Rope arc (bezier from player to stake, arc height based on distance)
    const midX = (ps.x + stakePos.x) / 2;
    const midY = (ps.y + stakePos.y) / 2;
    const arcH =
      s.phase === "flying"
        ? -40 - dist(this.player, { col: s.flyCol, row: s.flyRow }) * 3
        : -20 -
          (1 - s.pullT) *
            dist(
              { col: s.pullStartCol, row: s.pullStartRow },
              { col: s.targetCol, row: s.targetRow },
            ) *
            3;

    ctx.beginPath();
    ctx.moveTo(ps.x, ps.y - 28);
    ctx.quadraticCurveTo(midX, midY + arcH, stakePos.x, stakePos.y - 10);
    ctx.strokeStyle = "#8B5A00";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Stake icon (wooden post embedded in ground)
    const sx = stakePos.x,
      sy = stakePos.y;
    if (s.phase !== "flying") {
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Post
    const postH = s.phase === "flying" ? 16 : 20;
    ctx.fillStyle = "#6B3A0A";
    ctx.fillRect(sx - 3, sy - postH, 6, postH);
    // Top cap (pointy)
    ctx.fillStyle = "#8B4513";
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy - postH);
    ctx.lineTo(sx, sy - postH - 7);
    ctx.lineTo(sx + 4, sy - postH);
    ctx.closePath();
    ctx.fill();
    // Rope knot
    ctx.fillStyle = "#c8a050";
    ctx.beginPath();
    ctx.arc(sx, sy - postH + 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle when just landed (pullT near 0)
    if (s.phase === "pulling" && s.pullT < 0.15) {
      ctx.fillStyle = "rgba(255,180,0,0.8)";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★", sx, sy - postH - 14);
    }
  }

  // ─── HUD / UI ─────────────────────────────────────────────────────────────

  // ─── Time-of-day overlay ──────────────────────────────────────────────────

  private renderNightOverlay() {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const period = this.timePeriod;
    const nightFade = this.nightFade;

    // ── Tarde: tint quente alaranjado ────────────────────────────────────────
    if (period === "tarde") {
      ctx.fillStyle = "rgba(200,100,20,0.10)";
      ctx.fillRect(0, 0, W, H);

      // Sol (canto superior direito)
      const sunX = W * 0.87,
        sunY = H * 0.09;
      ctx.save();
      ctx.globalAlpha = 0.55;
      // Raios do sol
      ctx.strokeStyle = "rgba(255,200,40,0.35)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + this.time * 0.3;
        const r1 = 18,
          r2 = 28;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * r1, sunY + Math.sin(angle) * r1);
        ctx.lineTo(sunX + Math.cos(angle) * r2, sunY + Math.sin(angle) * r2);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffe060";
      ctx.beginPath();
      ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff4a0";
      ctx.beginPath();
      ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // ── Noite: overlay escuro, estrelas e lua ────────────────────────────────
    if (nightFade <= 0) return;

    // Tint azul-escuro
    ctx.fillStyle = `rgba(5,10,35,${nightFade * 0.46})`;
    ctx.fillRect(0, 0, W, H);

    // Névoa roxa nas bordas (atmosfera noturna)
    const grad = ctx.createRadialGradient(
      W / 2,
      H / 2,
      H * 0.3,
      W / 2,
      H / 2,
      H * 0.85,
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(20,0,40,${nightFade * 0.18})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Estrelas — clipa na faixa do céu (top 28%) para não aparecerem sobre personagens
    const skyH = H * 0.28;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, skyH);
    ctx.clip();
    for (let i = 0; i < 110; i++) {
      const sx = ((i * 137 + 19) % 97) / 97;
      const sy = ((i * 251 + 43) % 89) / 89;
      const twinkle =
        0.3 + Math.sin(this.time * (0.8 + (i % 7) * 0.25) + i) * 0.4;
      const sz = 0.5 + (i % 4) * 0.45;
      const hue =
        i % 3 === 0
          ? "220,230,255"
          : i % 3 === 1
            ? "255,255,220"
            : "255,240,200";
      ctx.fillStyle = `rgba(${hue},${nightFade * twinkle})`;
      ctx.beginPath();
      ctx.arc(sx * W, sy * skyH, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Lua crescente (canto superior direito)
    const moonX = W * 0.84,
      moonY = H * 0.09;
    const moonR = 20;
    ctx.save();
    ctx.globalAlpha = nightFade;
    // Brilho suave ao redor da lua
    const moonGlow = ctx.createRadialGradient(
      moonX,
      moonY,
      moonR,
      moonX,
      moonY,
      moonR * 3.5,
    );
    moonGlow.addColorStop(0, "rgba(240,230,180,0.18)");
    moonGlow.addColorStop(1, "rgba(240,230,180,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Corpo da lua
    ctx.fillStyle = "#f0e8c0";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // Sombra crescente
    ctx.fillStyle = "rgba(5,10,35,0.90)";
    ctx.beginPath();
    ctx.arc(moonX + 9, moonY - 3, moonR - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderUI() {
    const { canvas } = this;
    const W = canvas.width,
      H = canvas.height;

    this.renderStatsPanel();
    this.renderOnlinePanel(W, H);
    this.renderBookButton(W);
    this.renderMusicButton(W);
    this.renderInventoryButton(W, H);
    this.renderChat(W, H);
    if (this.inventoryOpen) this.renderInventory(W, H);

    // ── Vendor dialog ────────────────────────────────────────────────────────
    if (this.vendorDialog.active) this.renderVendorDialog();

    // ── Lasso minigame or fail overlay ───────────────────────────────────────
    if (this.lasso.active && this.lasso.phase === "pulling")
      this.renderMinigame();
    else if (this.lasso.active && this.lasso.phase === "fail") {
      this.drawPanel(W / 2 - 140, H / 2 - 38, 280, 80, 2);
      this.ctx.fillStyle = "#FF5533";
      this.ctx.font = "bold 26px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Escapou! 💨", W / 2, H / 2 + 8);
    }

    this.renderBenchActions(W, H);
    this.renderContextHint(W, H);
    this.renderMobileControls();

    // Dicas de teclado (desktop)
    if (W > 720) {
      this.drawPanel(W - 220, 90, 210, 80, 3);
      this.ctx.fillStyle = "#C8A870";
      this.ctx.font = "11px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("WASD / Setas = mover", W - 115, 115);
      this.ctx.fillText(
        "E / Espaço = ação   B = Livro   M = Música",
        W - 115,
        132,
      );
      this.ctx.fillText("Q = Estaca (cruzar rio)", W - 115, 149);
    }

    if (this.isAdmin) this.renderAdminOverlay(W, H);

    // Birthday event
    this.renderBirthdayParticles();
    if (this.birthdayDialogOpen) this.renderBirthdayDialog(W, H);
    if (!this.eventPopupDismissed) this.renderEventPopup(W, H);
  }

  // ── Admin overlay ─────────────────────────────────────────────────────────

  private renderAdminOverlay(W: number, H: number) {
    const { ctx } = this;

    // Badge "⚙ ADMIN" no canto superior direito (abaixo dos botões)
    ctx.save();
    ctx.font = "bold 11px monospace";
    const badge = "⚙ ADMIN";
    const bw = ctx.measureText(badge).width + 14;
    const bx = W - bw - 6;
    const by = 6;
    ctx.fillStyle = "rgba(80,5,5,0.88)";
    ctx.fillRect(bx, by, bw, 20);
    ctx.strokeStyle = "#cc2222";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, 20);
    ctx.fillStyle = "#FF6666";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge, bx + bw / 2, by + 10);
    ctx.textBaseline = "alphabetic";
    ctx.restore();

    // Indicador de god mode
    if (this.adminGodMode) {
      ctx.save();
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "rgba(80,5,5,0.88)";
      const gw = ctx.measureText("⚡ GOD MODE").width + 14;
      ctx.fillRect(W - gw - 6, 30, gw, 20);
      ctx.strokeStyle = "#cc2222";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - gw - 6, 30, gw, 20);
      ctx.fillStyle = "#FFAA44";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡ GOD MODE", W - gw / 2 - 6, 40);
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    }

    // Indicador de hora forçada
    if (this.adminForcePeriod !== null) {
      ctx.save();
      ctx.font = "bold 10px monospace";
      const label = `🕐 TIME:${this.adminForcePeriod.toUpperCase()}`;
      const tw = ctx.measureText(label).width + 14;
      const ty = this.adminGodMode ? 54 : 30;
      ctx.fillStyle = "rgba(5,5,80,0.88)";
      ctx.fillRect(W - tw - 6, ty, tw, 20);
      ctx.strokeStyle = "#2244cc";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - tw - 6, ty, tw, 20);
      ctx.fillStyle = "#88AAFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, W - tw / 2 - 6, ty + 10);
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    }

    // Resultado do último comando
    if (this.adminCmdResultTimer > 0 && this.adminCmdResult) {
      const alpha = Math.min(1, this.adminCmdResultTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 13px monospace";
      const msg = this.adminCmdResult;
      const tw = ctx.measureText(msg).width + 16;
      const px = 10;
      const py = H - 40;
      ctx.fillStyle = "rgba(40,3,3,0.94)";
      ctx.fillRect(px, py - 18, tw, 24);
      ctx.strokeStyle = "#cc2222";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py - 18, tw, 24);
      ctx.fillStyle = this.adminCmdResult.startsWith("✅") ? "#88FF88" : "#FF8888";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(msg, px + 8, py - 6);
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    }

    // Dica de atalho (quando nenhum painel está aberto)
    if (!this.adminCmdOpen && !this.shopOpen && !this.bookOpen && !this.inventoryOpen) {
      ctx.save();
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(255,100,100,0.5)";
      ctx.textAlign = "left";
      ctx.fillText("` = admin cmd", 10, H - 16);
      ctx.restore();
    }
  }

  // ── Painel de stats (top-left) ────────────────────────────────────────────

  private renderStatsPanel() {
    const { ctx } = this;

    if (this.statsMinimized) {
      // ── Versão compacta ──
      this.drawPanel(6, 6, 136, 38, 0);

      // Dot de cor do jogador local
      ctx.fillStyle = this.myColor;
      ctx.beginPath();
      ctx.arc(20, 25, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(
        `🐄 ${this.herdCows().length}  🏠 ${this.basedCount}`,
        32,
        29,
      );

      // Botão expandir
      this.drawPixelBtn(110, 9, 22, 22, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", 121, 20);
      ctx.textBaseline = "alphabetic";
    } else {
      // ── Versão expandida ──
      const ownedItems = SHOP_ITEMS.filter(
        (it) => (this.inventory.get(it.id) ?? 0) > 0,
      );
      const PW = 210;
      // Base: cabeçalho(30) + 3 stats(60) + período(20) + moedas(20) + botãoPremium(28) + padding(16) = 174
      const PH =
        174 + (ownedItems.length > 0 ? 34 : 0) + (this.leiteTimer > 0 ? 20 : 0);
      this.drawPanel(6, 6, PW, PH, 0);

      // Cabeçalho: cor + nome do jogador
      ctx.fillStyle = this.myColor;
      ctx.beginPath();
      ctx.roundRect(12, 12, 12, 12, 2);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.font = "16px Merriweather";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.myName, 30, 23);

      // Divisor
      ctx.strokeStyle = "rgba(200,160,80,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12, 30);
      ctx.lineTo(PW - 6, 30);
      ctx.stroke();

      // Stats
      const rows: [string, string][] = [
        ["🐄  Rebanho:", `${this.herdCows().length}`],
        ["🏠  Na base:", `${this.basedCount}`],
        [
          "🌾  Vagando:",
          `${this.cows.filter((c) => c.state === "wandering" || c.state === "fleeing").length}`,
        ],
      ];

      let ry = 48;
      for (const [label, value] of rows) {
        ctx.font = "16px Merriweather";
        ctx.fillStyle = "#C8A870";
        ctx.textAlign = "left";
        ctx.fillText(label, 14, ry);
        ctx.font = "16px Merriweather";
        ctx.fillStyle = "#FFE0A0";
        ctx.textAlign = "right";
        ctx.fillText(value, PW - 10, ry);
        ry += 20;
      }

      // Indicador período do dia
      {
        const period = this.timePeriod;
        const periodLabel =
          period === "noite"
            ? this.nightFade < 0.8
              ? "🌅 Anoitecendo..."
              : "🌙 Noite"
            : period === "manha"
              ? "🌄 Manhã"
              : "☀️ Tarde";
        const periodColor =
          period === "noite"
            ? `rgba(160,190,255,${0.5 + this.nightFade * 0.5})`
            : period === "manha"
              ? "rgba(255,210,120,0.9)"
              : "rgba(255,180,60,0.9)";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = periodColor;
        ctx.fillText(periodLabel, 14, ry);
        ry += 20;
      }

      // Moedas com ícone
      ctx.drawImage(this.icons.moneyIcon, 14, ry - 14, 16, 16);
      ctx.font = "16px Merriweather";
      ctx.fillStyle = "#FFD700";
      ctx.textAlign = "left";
      ctx.fillText("Moedas:", 34, ry);
      ctx.textAlign = "right";
      ctx.fillText(`${this.coins}`, PW - 10, ry);
      ry += 20;

      // Botão "Comprar Moedas" (Stripe)
      {
        const btnX = 14;
        const btnY = ry;
        const btnW = PW - 20;
        const btnH = 22;
        this.drawPixelBtn(btnX, btnY, btnW, btnH, "normal");
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💳  Comprar Moedas  R$10", btnX + btnW / 2, btnY + btnH / 2);
        ctx.textBaseline = "alphabetic";
        ry += 28;
      }

      // Leite Fluorescente timer
      if (this.leiteTimer > 0) {
        const totalSecs = Math.ceil(this.leiteTimer);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const pulse = 0.7 + 0.3 * Math.sin(this.time * 3.5);
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = `rgba(140,255,100,${pulse})`;
        ctx.fillText(
          `✨ Leite: ${mins}m${secs < 10 ? "0" : ""}${secs}s`,
          14,
          ry,
        );
      }

      // Botão logout
      this.drawPixelBtn(PW - 46, 9, 22, 22, "normal");
      ctx.fillStyle = "#FF7777";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⏻", PW - 35, 20);
      ctx.textBaseline = "alphabetic";

      // Botão recolher
      this.drawPixelBtn(PW - 20, 9, 22, 22, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("◀", PW - 9, 20);
      ctx.textBaseline = "alphabetic";
    }
  }

  // ── Painel de jogadores online (top-right, separado) ─────────────────────

  private renderOnlinePanel(W: number, _H: number) {
    const { ctx } = this;
    const total = this.remotePlayers.size + 1;

    // Só aparece quando há alguém conectado
    if (this.remotePlayers.size === 0) return;

    // // Em mobile ocupa espaço demais — esconde se tela muito pequena
    // if (W < 480) return;

    // Lista: eu primeiro, depois remotos
    type Entry = { color: string; name: string; isMe: boolean };
    const entries: Entry[] = [
      { color: this.myColor, name: this.myName + " (você)", isMe: true },
      ...Array.from(this.remotePlayers.values()).map((rp) => ({
        color: rp.color,
        name: rp.name,
        isMe: false,
      })),
    ];

    const PW = 170;
    const rowH = 22;
    // Limita a 6 entradas visíveis para não cobrir o chat
    const visibleEntries = entries.slice(0, 6);
    const PH = 28 + visibleEntries.length * rowH + 8;

    // Lado esquerdo, abaixo do painel de stats
    const PX = 6;
    const PY = this.statsMinimized ? 60 : 160;

    this.drawPanel(PX, PY, PW, PH, 1);

    // Cabeçalho
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#55FF99";
    ctx.fillText(
      `● Online  —  ${total} jogador${total > 1 ? "es" : ""}`,
      PX + 10,
      PY + 17,
    );

    // Divisor
    ctx.strokeStyle = "rgba(200,160,80,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 8, PY + 22);
    ctx.lineTo(PX + PW - 8, PY + 22);
    ctx.stroke();

    // Linhas de jogadores
    let ey = PY + 22 + rowH - 4;
    for (const e of visibleEntries) {
      // Dot de cor
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(PX + 16, ey - 5, 5, 0, Math.PI * 2);
      ctx.fill();

      // Nome
      ctx.font = e.isMe ? "bold 11px sans-serif" : "11px sans-serif";
      ctx.fillStyle = e.isMe ? "#FFE0A0" : "#C8A870";
      ctx.textAlign = "left";

      // Trunca nome se necessário
      let name = e.name;
      while (ctx.measureText(name).width > PW - 36 && name.length > 3) {
        name = name.slice(0, -1);
      }
      if (name !== e.name) name += "…";

      ctx.fillText(name, PX + 28, ey);
      ey += rowH;
    }
  }

  // ── Chat (bottom-left) ────────────────────────────────────────────────────

  private renderChat(W: number, H: number) {
    const { ctx } = this;
    const now = Date.now();

    if (this.chatOpen) {
      // ── Chat aberto: painel de histórico scrollável ─────────────────────────
      const PW = Math.min(W - 20, 320);
      const lineH = 18;
      const padV = 8;
      const MAX_VISIBLE = 8;
      const msgs = this.chatMessages;
      const totalMsgs = msgs.length;

      // chatHistoryScroll: quantas mensagens acima do bottom estamos
      this.chatHistoryScroll = Math.max(
        0,
        Math.min(this.chatHistoryScroll, Math.max(0, totalMsgs - MAX_VISIBLE)),
      );

      const firstIdx = Math.max(
        0,
        totalMsgs - MAX_VISIBLE - this.chatHistoryScroll,
      );
      const slice = msgs.slice(firstIdx, firstIdx + MAX_VISIBLE);

      const panelH = Math.max(
        lineH + padV * 2,
        slice.length * lineH + padV * 2,
      );
      const panelY = H - 195 - panelH;

      this.drawPanel(6, panelY, PW, panelH, 0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(8, panelY + 2, PW - 4, panelH - 4);
      ctx.clip();

      let ty = panelY + padV + 12;
      for (const msg of slice) {
        ctx.globalAlpha = 1;
        ctx.font = " 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = msg.color;
        const nameLabel = msg.name + ": ";
        const nameW = ctx.measureText(nameLabel).width;
        ctx.fillText(nameLabel, 14, ty);

        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#FFE0A0";
        const maxW = PW - nameW - 24;
        let text = msg.text;
        while (ctx.measureText(text).width > maxW && text.length > 3)
          text = text.slice(0, -1);
        if (text !== msg.text) text += "…";
        ctx.fillText(text, 14 + nameW, ty);
        ty += lineH;
      }
      ctx.restore();

      // Scroll hint
      if (this.chatHistoryScroll > 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#FFD700";
        ctx.textAlign = "left";
        ctx.fillText("▲ arraste ou use a roda para scroll", 14, panelY - 5);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.textAlign = "left";
      ctx.fillText("Enter = enviar  •  Esc = fechar", 14, H - 183);
      ctx.restore();
      return;
    }

    // ── Chat fechado: mensagens recentes flutuantes ─────────────────────────
    const recent = this.chatMessages
      .filter((m) => now - m.time < 12000)
      .slice(-5);

    if (recent.length === 0) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.textAlign = "left";
      ctx.fillText("T = Chat", 14, H - 200);
      ctx.restore();
      return;
    }

    const PW = Math.min(W - 20, 272);
    const lineH = 18;
    const padV = 8;
    const panelH = recent.length * lineH + padV * 2;
    const panelY = H - 155 - panelH;

    this.drawPanel(6, panelY, PW, panelH, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(8, panelY + 2, PW - 4, panelH - 4);
    ctx.clip();

    let ty = panelY + padV + 12;
    for (const msg of recent) {
      const age = (now - msg.time) / 12000;
      ctx.globalAlpha = Math.max(0.35, 1 - age * 0.7);
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = msg.color;
      const nameLabel = msg.name + ": ";
      const nameW = ctx.measureText(nameLabel).width;
      ctx.fillText(nameLabel, 14, ty);

      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      const maxW = PW - nameW - 24;
      let text = msg.text;
      while (ctx.measureText(text).width > maxW && text.length > 3)
        text = text.slice(0, -1);
      if (text !== msg.text) text += "…";
      ctx.fillText(text, 14 + nameW, ty);
      ty += lineH;
    }
    ctx.restore();
  }

  // ── Botão do livro (top-right) ────────────────────────────────────────────

  private onPeriodChange() {
    setNightMode(this.isNight);
  }

  private toggleMusic() {
    toggleMusic();
  }

  private renderMusicButton(W: number) {
    const { ctx } = this;
    const cx = W - 120,
      cy = 50;
    this.drawPixelBtn(
      cx - 24,
      cy - 24,
      48,
      48,
      isMusicEnabled() ? "normal" : "pressed",
    );
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isMusicEnabled() ? "🎵" : "🔇", cx, cy);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = isMusicEnabled() ? "#FFD700" : "#888";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("MÚSICA", cx, cy + 20);
  }

  private renderBookButton(W: number) {
    const { ctx } = this;
    const bookCX = W - 50,
      bookCY = 50;
    this.drawPixelBtn(bookCX - 34, bookCY - 34, 68, 68, "normal");
    ctx.drawImage(this.icons.bookIcon, bookCX - 16, bookCY - 16, 32, 32);
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText("LIVRO", bookCX, bookCY + 24);
  }

  private renderInventoryButton(W: number, H: number) {
    const { ctx } = this;
    const cx = W - 80,
      cy = H - 330;
    const active = this.inventoryOpen;
    this.drawPixelBtn(cx - 30, cy - 30, 60, 60, active ? "active" : "normal");
    ctx.drawImage(this.icons.trunkIcon, cx - 16, cy - 16, 32, 32);
    ctx.textAlign = "center";
    ctx.fillStyle = active ? "#FFD700" : "#C8A870";
    ctx.font = "bold 9px sans-serif";
  }

  private renderInventory(W: number, H: number) {
    const { ctx } = this;
    const ownedItems = SHOP_ITEMS.filter(
      (it) => (this.inventory.get(it.id) ?? 0) > 0,
    );
    const resources: Array<{ id: string; name: string; icon: string; qty: number; max: number }> = [];
    const woodQty = this.inventory.get("wood") ?? 0;
    const stoneQty = this.inventory.get("stone") ?? 0;
    const machadoQty = this.inventory.get("machado") ?? 0;
    if (woodQty > 0) resources.push({ id: "wood", name: "Madeira", icon: "🪵", qty: woodQty, max: WOOD_MAX_STACK });
    if (stoneQty > 0) resources.push({ id: "stone", name: "Pedra", icon: "🪨", qty: stoneQty, max: STONE_MAX_STACK });
    if (machadoQty > 0) resources.push({ id: "machado", name: "Machado de Pedra", icon: "", qty: machadoQty, max: 1 });
    const PW = Math.min(W - 32, 400);
    const HEADER_H = 56;
    const btnW = 74;
    const textMaxWidth = PW - 60 - (btnW + 6) * 2 - 16;

    // Calcular altura dinâmica do conteúdo
    let totalContentH = 16;
    // Resources section height
    if (resources.length > 0) totalContentH += 16 + resources.length * 36;
    if (ownedItems.length > 0) {
      for (const item of ownedItems) {
        const descLines = this.wrapTextLines(
          item.description,
          textMaxWidth,
          "10px sans-serif",
        );
        totalContentH += 72 + (descLines.length - 1) * 12;
      }
    } else {
      totalContentH = 60;
    }

    const MAX_VISIBLE_H = 420;
    const contentH = Math.min(MAX_VISIBLE_H, totalContentH);
    const PH = Math.min(H - 40, HEADER_H + contentH);
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    this.drawPanel(PX, PY, PW, PH, 0);
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.drawImage(this.icons.trunkIcon, PX + PW / 2 - 70, PY + 8, 20, 20);
    ctx.fillText("Inventário", PX + PW / 2 - 2, PY + 26);
    const closeCX = PX + PW - 18,
      closeCY = PY + 18;
    this.inventoryCloseBtn = { x: closeCX, y: closeCY, r: 12 };
    ctx.fillStyle = "#9b3a18";
    ctx.beginPath();
    ctx.arc(closeCX, closeCY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e05030";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("✕", closeCX, closeCY);
    ctx.textBaseline = "alphabetic";
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H);
    ctx.stroke();

    // Guardar área de conteúdo para detectar scroll
    this.inventoryContentArea = { x: PX, y: PY + HEADER_H, w: PW, h: contentH };

    if (this.tradeState === "incoming" && this.tradeIncoming) {
      this.renderTradeIncomingView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else if (this.tradeState === "selecting") {
      this.renderTradeSelectView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else if (this.tradeState === "waiting") {
      this.renderTradeWaitingView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else if (this.tradeState === "result") {
      this.renderTradeResultView(PX, PY + HEADER_H, PW, PH - HEADER_H);
    } else {
      // Recursos primeiro
      let resourcesY = PY + HEADER_H + 8 - this.inventoryScroll;
      if (resources.length > 0) {
        const ctx2 = this.ctx;
        ctx2.save();
        ctx2.beginPath();
        ctx2.rect(PX + 4, PY + HEADER_H, PW - 8, contentH);
        ctx2.clip();
        ctx2.font = "bold 11px sans-serif";
        ctx2.fillStyle = "#C8A870";
        ctx2.textAlign = "left";
        ctx2.fillText("RECURSOS", PX + 14, resourcesY + 12);
        resourcesY += 20;
        for (const res of resources) {
          ctx2.fillStyle = "rgba(255,255,255,0.05)";
          ctx2.fillRect(PX + 8, resourcesY, PW - 16, 30);
          ctx2.font = "14px sans-serif";
          ctx2.fillStyle = "#FFE0A0";
          ctx2.textAlign = "left";
          if (res.id === "machado") {
            ctx2.drawImage(this.icons.axeIcon, PX + 16, resourcesY + 6, 16, 16);
            ctx2.fillText(`  ${res.name}`, PX + 32, resourcesY + 20);
          } else {
            ctx2.fillText(`${res.icon}  ${res.name}`, PX + 16, resourcesY + 20);
          }
          ctx2.textAlign = "right";
          ctx2.fillStyle = "#FFD700";
          ctx2.font = "bold 13px sans-serif";
          const label = res.max === 1 ? "✓" : `${res.qty}/${res.max}`;
          ctx2.fillText(label, PX + PW - 16, resourcesY + 20);
          resourcesY += 36;
        }
        // slot count
        const slotUsed = this.inventorySlotCount();
        ctx2.font = "10px sans-serif";
        ctx2.fillStyle = slotUsed >= MAX_INVENTORY_SLOTS ? "#ff8888" : "#888";
        ctx2.textAlign = "right";
        ctx2.fillText(`Mochila: ${slotUsed}/${MAX_INVENTORY_SLOTS} slots`, PX + PW - 14, resourcesY + 4);
        resourcesY += 12;
        ctx2.restore();
      }
      this.renderInventoryItems(
        PX,
        PY + HEADER_H,
        PW,
        contentH,
        ownedItems,
        totalContentH,
        resources.length > 0 ? 16 + resources.length * 36 + 16 : 0,
      );
    }
  }

  private renderInventoryItems(
    PX: number,
    PY: number,
    PW: number,
    PH: number,
    ownedItems: GameItem[],
    totalContentH: number,
    resourceOffset = 0,
  ) {
    const { ctx } = this;
    this.inventoryDropBtns = [];
    this.inventoryTradeBtns = [];
    this.inventoryPlaceBtns = [];
    this.inventoryUseBtns = [];
    if (ownedItems.length === 0 && resourceOffset === 0) {
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#7a6040";
      ctx.textAlign = "center";
      ctx.fillText(
        "Nenhum item ainda — compre na loja!",
        PX + PW / 2,
        PY + PH / 2,
      );
      return;
    }
    if (ownedItems.length === 0) return;

    const btnW = 74;
    const textMaxWidth = PW - 60 - (btnW + 6) * 2 - 16; // espaço para descrição

    // Limitar o scroll ao máximo
    const maxScroll = Math.max(0, totalContentH - PH);
    this.inventoryScroll = Math.min(this.inventoryScroll, maxScroll);

    // Aplicar clipping na área de conteúdo
    ctx.save();
    ctx.beginPath();
    ctx.rect(PX + 4, PY, PW - 8, PH);
    ctx.clip();

    let cy = PY + 8 + resourceOffset - this.inventoryScroll;

    for (let i = 0; i < ownedItems.length; i++) {
      const item = ownedItems[i]!;
      const level = this.inventory.get(item.id) ?? 0;

      // Calcular linhas da descrição
      const descLines = this.wrapTextLines(
        item.description,
        textMaxWidth,
        "10px sans-serif",
      );
      const ROW_H = 72 + (descLines.length - 1) * 12;

      // Pular itens fora da área visível
      if (cy + ROW_H < PY || cy > PY + PH) {
        cy += ROW_H;
        continue;
      }

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(PX + 6, cy, PW - 12, ROW_H - 2);
      }

      // Icon background
      const invIconX = PX + 30;
      const invIconY = cy + 36;
      ctx.fillStyle = "rgba(200,160,80,0.25)";
      ctx.beginPath();
      ctx.arc(invIconX, invIconY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,130,40,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(invIconX, invIconY, 18, 0, Math.PI * 2);
      ctx.stroke();

      // Icon (image or emoji)
      const invItemImg = this.itemIcons.get(item.id);
      if (invItemImg && invItemImg.complete && invItemImg.naturalWidth > 0) {
        ctx.drawImage(invItemImg, invIconX - 12, invIconY - 12, 24, 24);
      } else {
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFE0A0";
        ctx.fillText(item.icon, invIconX, invIconY);
        ctx.textBaseline = "alphabetic";
      }

      ctx.textAlign = "left";
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(item.name, PX + 52, cy + 18);

      // Descrição (múltiplas linhas)
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#C8A870";
      let descY = cy + 32;
      for (const line of descLines) {
        ctx.fillText(line, PX + 52, descY);
        descY += 12;
      }

      // Level pips ou quantidade (após a descrição)
      const pipsY = cy + 32 + descLines.length * 12 + 4;
      if (item.placeable || item.consumable) {
        // Itens placeáveis/consumíveis: mostrar quantidade em vez de dots de nível
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = item.consumable ? "#A0FFCC" : "#98FF98";
        ctx.textAlign = "left";
        ctx.fillText(`x${level} no inventário`, PX + 54, pipsY);
        if (
          item.consumable &&
          this.leiteTimer > 0 &&
          item.id === "leite_fluorescente"
        ) {
          ctx.fillStyle = "#FFD080";
          const mins = Math.ceil(this.leiteTimer / 60);
          const secs = Math.ceil(this.leiteTimer % 60);
          ctx.fillText(
            `✨ ativo: ${mins}m${secs < 10 ? "0" : ""}${secs}s`,
            PX + 150,
            pipsY,
          );
        }
      } else {
        for (let p = 0; p < item.maxLevel; p++) {
          ctx.fillStyle = p < level ? "#FFD700" : "#3a2208";
          ctx.beginPath();
          ctx.arc(PX + 54 + p * 14, pipsY - 4, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#9b7e57";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#C8A870";
        ctx.textAlign = "left";
        ctx.fillText(
          `Lv ${level}/${item.maxLevel}`,
          PX + 54 + item.maxLevel * 14 + 4,
          pipsY,
        );
      }
      const bH = 26;
      const dropX = PX + PW - (btnW + 6) * 2 - 8,
        dropY = cy + (ROW_H - bH) / 2;
      const tradeX = PX + PW - btnW - 8,
        tradeY = dropY;
      this.drawPixelBtn(dropX, dropY, btnW, bH, "normal");
      ctx.fillStyle = "#FF9980";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🗑 Descartar", dropX + btnW / 2, dropY + bH / 2);
      if (item.placeable) {
        this.drawPixelBtn(tradeX, tradeY, btnW, bH, "normal");
        ctx.fillStyle = "#98FF98";
        ctx.fillText("📍 Posicionar", tradeX + btnW / 2, tradeY + bH / 2);
        if (dropY + bH > PY && dropY < PY + PH) {
          this.inventoryPlaceBtns.push({
            item,
            x: tradeX,
            y: tradeY,
            w: btnW,
            h: bH,
          });
        }
      } else if (item.consumable) {
        const canUse = level > 0 && this.leiteTimer <= 0;
        this.drawPixelBtn(
          tradeX,
          tradeY,
          btnW,
          bH,
          canUse ? "normal" : "pressed",
        );
        ctx.fillStyle = canUse ? "#A0FFCC" : "#668866";
        ctx.fillText(
          this.leiteTimer > 0 ? "✨ Ativo" : "✨ Usar",
          tradeX + btnW / 2,
          tradeY + bH / 2,
        );
        if (canUse && dropY + bH > PY && dropY < PY + PH) {
          this.inventoryUseBtns.push({
            item,
            x: tradeX,
            y: tradeY,
            w: btnW,
            h: bH,
          });
        }
      } else {
        this.drawPixelBtn(tradeX, tradeY, btnW, bH, "normal");
        ctx.fillStyle = "#FFD700";
        ctx.fillText("↔ Trocar", tradeX + btnW / 2, tradeY + bH / 2);
        if (dropY + bH > PY && dropY < PY + PH) {
          this.inventoryTradeBtns.push({
            item,
            x: tradeX,
            y: tradeY,
            w: btnW,
            h: bH,
          });
        }
      }
      ctx.textBaseline = "alphabetic";
      if (dropY + bH > PY && dropY < PY + PH) {
        this.inventoryDropBtns.push({
          item,
          x: dropX,
          y: dropY,
          w: btnW,
          h: bH,
        });
      }
      cy += ROW_H;
    }

    ctx.restore();

    // Desenhar scrollbar se necessário
    if (maxScroll > 0) {
      const scrollBarH = PH - 8;
      const thumbH = Math.max(30, (PH / totalContentH) * scrollBarH);
      const thumbY =
        PY + 4 + (this.inventoryScroll / maxScroll) * (scrollBarH - thumbH);

      // Track
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(PX + PW - 10, PY + 4, 6, scrollBarH);

      // Thumb
      ctx.fillStyle = "rgba(200,160,80,0.6)";
      ctx.beginPath();
      ctx.roundRect(PX + PW - 10, thumbY, 6, thumbH, 3);
      ctx.fill();
    }
  }

  private renderTradeIncomingView(
    PX: number,
    PY: number,
    PW: number,
    _PH: number,
  ) {
    const { ctx } = this;
    const offer = this.tradeIncoming!;
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFE0A0";
    ctx.fillText("Oferta de troca recebida!", PX + PW / 2, PY + 28);
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = offer.fromColor;
    ctx.fillText(`De: ${offer.fromName}`, PX + PW / 2, PY + 46);

    // Trade item icon with background
    const tradeIconX = PX + PW / 2;
    const tradeIconY = PY + 80;
    ctx.fillStyle = "rgba(200,160,80,0.3)";
    ctx.beginPath();
    ctx.arc(tradeIconX, tradeIconY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,130,40,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tradeIconX, tradeIconY, 24, 0, Math.PI * 2);
    ctx.stroke();

    const tradeItemImg = this.itemIcons.get(offer.item.id);
    if (
      tradeItemImg &&
      tradeItemImg.complete &&
      tradeItemImg.naturalWidth > 0
    ) {
      ctx.drawImage(tradeItemImg, tradeIconX - 16, tradeIconY - 16, 32, 32);
    } else {
      ctx.font = "28px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(offer.item.icon, tradeIconX, tradeIconY);
      ctx.textBaseline = "alphabetic";
    }

    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText(
      `${offer.item.name}  Lv ${offer.level}`,
      PX + PW / 2,
      PY + 112,
    );
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.fillText(offer.item.description, PX + PW / 2, PY + 128);
    const bW = 110,
      bH = 32;
    const aX = PX + PW / 2 - bW - 8,
      aY = PY + 146;
    const dX = PX + PW / 2 + 8,
      dY = PY + 146;
    this.drawPixelBtn(aX, aY, bW, bH, "active");
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("✅ Aceitar", aX + bW / 2, aY + bH / 2);
    this.drawPixelBtn(dX, dY, bW, bH, "normal");
    ctx.fillStyle = "#FF9980";
    ctx.fillText("❌ Recusar", dX + bW / 2, dY + bH / 2);
    ctx.textBaseline = "alphabetic";
    this.tradeAcceptBtn = { x: aX, y: aY, w: bW, h: bH };
    this.tradeDeclineBtn = { x: dX, y: dY, w: bW, h: bH };
  }

  private renderTradeSelectView(
    PX: number,
    PY: number,
    PW: number,
    _PH: number,
  ) {
    const { ctx } = this;
    this.tradePlayerBtns = [];
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFE0A0";
    ctx.fillText(
      `Enviar ${this.tradeItem?.icon ?? ""} ${this.tradeItem?.name ?? ""} para:`,
      PX + PW / 2,
      PY + 26,
    );
    const online = Array.from(this.remotePlayers.values());
    let cy = PY + 42;
    if (online.length === 0) {
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#7a6040";
      ctx.fillText("Nenhum jogador online.", PX + PW / 2, cy + 20);
    } else {
      for (const rp of online.slice(0, 5)) {
        const bW = PW - 40,
          bH = 32;
        const bX = PX + 20,
          bY = cy;
        this.drawPixelBtn(bX, bY, bW, bH, "normal");
        ctx.fillStyle = rp.color;
        ctx.beginPath();
        ctx.arc(bX + 18, bY + bH / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFE0A0";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(rp.name, bX + 32, bY + bH / 2 + 4);
        this.tradePlayerBtns.push({
          playerId: rp.id,
          name: rp.name,
          color: rp.color,
          x: bX,
          y: bY,
          w: bW,
          h: bH,
        });
        cy += bH + 8;
      }
    }
    const cW = 120,
      cH = 28;
    const cX = PX + (PW - cW) / 2,
      cY = cy + 8;
    this.drawPixelBtn(cX, cY, cW, cH, "pressed");
    ctx.fillStyle = "#C8A870";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Cancelar", cX + cW / 2, cY + cH / 2);
    ctx.textBaseline = "alphabetic";
    this.tradeCancelBtn = { x: cX, y: cY, w: cW, h: cH };
  }

  private renderTradeWaitingView(
    PX: number,
    PY: number,
    PW: number,
    PH: number,
  ) {
    const { ctx } = this;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 3);
    ctx.globalAlpha = pulse;
    ctx.textAlign = "center";
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText("⏳ Aguardando resposta...", PX + PW / 2, PY + PH / 2 - 12);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.fillText(
      `Oferecendo: ${this.tradeItem?.icon ?? ""} ${this.tradeItem?.name ?? ""}`,
      PX + PW / 2,
      PY + PH / 2 + 10,
    );
    ctx.globalAlpha = 1;
    const cW = 120,
      cH = 28;
    const cX = PX + (PW - cW) / 2,
      cY = PY + PH / 2 + 30;
    this.drawPixelBtn(cX, cY, cW, cH, "pressed");
    ctx.fillStyle = "#C8A870";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Cancelar", cX + cW / 2, cY + cH / 2);
    ctx.textBaseline = "alphabetic";
    this.tradeCancelBtn = { x: cX, y: cY, w: cW, h: cH };
  }

  private renderTradeResultView(
    PX: number,
    PY: number,
    PW: number,
    PH: number,
  ) {
    const { ctx } = this;
    ctx.textAlign = "center";
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText(this.tradeResultMsg, PX + PW / 2, PY + PH / 2);
  }

  // ── Bench actions HUD ─────────────────────────────────────────────────────

  private renderBenchActions(_W: number, _H: number) {
    this.benchInteractBtn = { x: 0, y: 0, w: 0, h: 0 };
    this.benchCollectBtn = { x: 0, y: 0, w: 0, h: 0 };
  }

  // ── Hint contextual ───────────────────────────────────────────────────────

  private renderContextHint(W: number, H: number) {
    const { ctx } = this;
    if (this.lasso.active) return;

    const nearest = this.nearestWanderingCow();
    const atBase = this.isAtBase(),
      hasHerd = this.herdCows().length > 0;
    const atVendor = this.isAtVendor();
    let hint = "";
    const isMobile = W < 600;
    if (atVendor && !this.shopOpen)
      hint = isMobile ? "Botão: Abrir Loja!" : "Pressione E / botão para abrir a LOJA!";
    else if (atBase && hasHerd)
      hint = isMobile ? "Botão: Depositar na base!" : "Pressione E / botão para DEPOSITAR na base!";
    else if (this.isBirthdayActive && this.isAtCake())
      hint = isMobile ? "🎂 Botão: Interagir com o bolo!" : "🎂 Pressione E para interagir com o BOLO DE ANIVERSÁRIO!";
    else if (nearest && dist(this.player, nearest) <= CAPTURE_DIST)
      hint = isMobile ? "Botão: Laçar vaca!" : "Pressione E / botão para LAÇAR a vaca!";

    if (!hint) return;

    ctx.font = `bold ${isMobile ? 14 : 13}px sans-serif`;
    ctx.textAlign = "center";
    const tw = ctx.measureText(hint).width;
    const hpw = Math.min(tw + 48, W - 20);
    this.drawPixelBtn(W / 2 - hpw / 2, H - 120, hpw, 40, "normal", true);
    ctx.fillStyle = "#FFD700";
    ctx.fillText(hint, W / 2, H - 94);
  }

  // ─── Bandido ──────────────────────────────────────────────────────────────

  private debugSpawnBandit() {
    const target =
      this.cows.find((c) => c.state === "based") ??
      this.cows.find((c) => c.state === "wandering");
    if (!target) {
      console.warn("[bandit] sem vaca alvo");
      return;
    }
    // Spawn close to target cow, just slightly away
    const spawnCol = target.col + 8;
    const spawnRow = target.row + 8;
    const fleeCol = MAP_COLS - 2;
    const fleeRow = MAP_ROWS - 2;
    this.bandits.push({
      id: this.nextBanditId++,
      col: spawnCol,
      row: spawnRow,
      fleeCol,
      fleeRow,
      state: "approaching",
      targetCow: target,
    });
  }

  private spawnBandit() {
    const based = this.cows.filter((c) => c.state === "based");
    const wandering =
      based.length > 0
        ? based
        : this.cows.filter(
            (c) => c.state === "wandering" || c.state === "fleeing",
          );
    if (wandering.length === 0) return;
    const target = wandering[Math.floor(Math.random() * wandering.length)]!;

    // Spawn at the map edge closest to the target cow
    // (so the bandit doesn't have to cross the whole map)
    const edgeCandidates: Array<{ col: number; row: number }> = [
      { col: target.col, row: 1 },
      { col: target.col, row: MAP_ROWS - 2 },
      { col: 1, row: target.row },
      { col: MAP_COLS - 2, row: target.row },
    ];
    edgeCandidates.sort((a, b) => dist(a, target) - dist(b, target));
    const spawn = edgeCandidates[0]!;

    // Flee destination: opposite edge from spawn (so he runs away from base)
    const fleeCol = spawn.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
    const fleeRow = spawn.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;

    this.bandits.push({
      id: this.nextBanditId++,
      col: spawn.col,
      row: spawn.row,
      fleeCol,
      fleeRow,
      state: "approaching",
      targetCow: target,
    });
  }

  private updateBandits(dt: number) {
    const period = this.timePeriod;

    // Advance bandit animation (always, not only during tug)
    this.banditAnimTimer += dt;
    if (this.banditAnimTimer >= 0.12) {
      this.banditAnimTimer = 0;
      this.banditAnimFrame++;
    }

    // If player is very close to a fleeing bandit, auto-scare (proximity mechanic)
    for (const b of this.bandits) {
      if (b.state === "fleeing" && dist(this.player, b) <= 2.5) {
        if (b.targetCow) {
          b.targetCow.state = "wandering";
          b.targetCow = null;
        }
        b.state = "scared";
      }
    }

    // Update each bandit
    for (let i = this.bandits.length - 1; i >= 0; i--) {
      const b = this.bandits[i]!;

      if (b.state === "approaching") {
        const target = b.targetCow;
        // If target became invalid, flee empty
        if (
          !target ||
          (target.state !== "wandering" &&
            target.state !== "fleeing" &&
            target.state !== "based")
        ) {
          b.state = "scared";
          b.targetCow = null;
        } else {
          const dx = target.col - b.col;
          const dy = target.row - b.row;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1.2) {
            // Steal cow — update flee destination to edge opposite from current pos
            target.state = "stolen";
            b.state = "fleeing";
            b.fleeCol = b.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
            b.fleeRow = b.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;
            this.discoveredNPCs.add("ladrao_culto");
          } else {
            b.col += (dx / d) * BANDIT_APPROACH_SPEED * dt;
            b.row += (dy / d) * BANDIT_APPROACH_SPEED * dt;
          }
        }
      } else if (b.state === "fleeing") {
        const dx = b.fleeCol - b.col;
        const dy = b.fleeRow - b.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) {
          // Escaped — remove bandit and stolen cow
          if (b.targetCow) {
            this.cows = this.cows.filter((c) => c !== b.targetCow);
          }
          this.bandits.splice(i, 1);
          continue;
        }
        const spd = BANDIT_FLEE_SPEED * dt;
        b.col += (dx / d) * spd;
        b.row += (dy / d) * spd;
        if (b.targetCow) {
          b.targetCow.col = b.col;
          b.targetCow.row = b.row;
        }
      } else if (b.state === "scared") {
        const dx = b.fleeCol - b.col;
        const dy = b.fleeRow - b.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) {
          this.bandits.splice(i, 1);
          continue;
        }
        const spd = BANDIT_SCARED_SPEED * dt;
        b.col += (dx / d) * spd;
        b.row += (dy / d) * spd;
      }
    }

    // Spawn timer — only in active periods and when below max bandits
    if (
      this.BANDIT_ACTIVE_PERIODS.includes(period) &&
      this.bandits.length < 3
    ) {
      this.banditSpawnTimer -= dt;
      if (this.banditSpawnTimer <= 0) {
        this.spawnBandit();
        this.banditSpawnTimer = 120 + Math.random() * 60;
      }
    }
  }

  private renderBandits() {
    for (const b of this.bandits) {
      this.drawBandit(b);
    }

    // Hint when close
    const near = this.bandits.find(
      (b) => b.state === "fleeing" && dist(this.player, b) <= 4.5,
    );
    if (near) {
      const { ctx } = this;
      const { x, y } = this.isoToScreen(near.col, near.row);
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("E / Espaço — Espantar!", x, y - 52);
    }
  }

  private drawBandit(b: Bandit) {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(b.col, b.row);

    const FRAME_W = 64,
      FRAME_H = 64;

    // Cow dragged BEHIND bandit (like herd cow) — draw before bandit so bandit renders on top
    if (b.targetCow && (b.state === "fleeing" || b.state === "scared")) {
      // Direction bandit is moving
      const mdx = b.fleeCol - b.col;
      const mdy = b.fleeRow - b.row;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      // Offset cow 1.8 tiles behind bandit (opposite direction of movement)
      const offCol = md > 0.1 ? -(mdx / md) * 1.8 : -1.8;
      const offRow = md > 0.1 ? -(mdy / md) * 1.8 : 0;
      const cp = this.isoToScreen(b.col + offCol, b.row + offRow);

      // Rope (lasso style — catenary-ish curve)
      ctx.save();
      ctx.strokeStyle = "rgba(180,120,40,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const midX = (x + cp.x) / 2;
      const midY = (y + cp.y) / 2 + 10; // slight sag
      ctx.moveTo(x + (cp.x - x) * 0.1, y - 8);
      ctx.quadraticCurveTo(midX, midY, cp.x, cp.y - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Cow shadow
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(cp.x, cp.y + 2, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cow (slightly smaller, behind bandit)
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.scale(0.72, 0.72);
      this.drawCowAt(0, 0, b.targetCow.type);
      ctx.restore();
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pick sprite sheet + frame count based on state
    let sheetKey: string;
    let totalCols: number;
    if (b.state === "fleeing" || b.state === "scared") {
      sheetKey = "npcs/bandit/Unarmed_Run_without_shadow.png";
      totalCols = 8;
    } else {
      sheetKey = "npcs/bandit/Unarmed_Walk_without_shadow.png";
      totalCols = 6;
    }

    const col = this.banditAnimFrame % totalCols;
    // Use row 2 (east-facing) by default, looks better in isometric view
    const dirRow = 2;
    const srcX = col * FRAME_W;
    const srcY = dirRow * FRAME_H;

    const img = sprites.get(sheetKey);
    ctx.save();
    // Mirror sprite when fleeing to the left
    const movingLeft = b.fleeCol < b.col;
    if ((b.state === "scared" || b.state === "fleeing") && movingLeft) {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    if (img) {
      ctx.drawImage(
        img,
        srcX,
        srcY,
        FRAME_W,
        FRAME_H,
        x - FRAME_W / 2,
        y - FRAME_H + 10,
        FRAME_W,
        FRAME_H,
      );
    } else {
      // Canvas fallback while sprite loads
      ctx.fillStyle = "#d4946a";
      ctx.fillRect(x - 7, y - 28, 14, 18);
      ctx.fillStyle = "#1a1a3a";
      ctx.fillRect(x - 8, y - 14, 16, 8);
      ctx.fillStyle = "#d4946a";
      ctx.beginPath();
      ctx.arc(x, y - 35, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a1010";
      ctx.fillRect(x - 8, y - 40, 16, 7);
    }
    ctx.restore();

    // Label above
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle =
      b.state === "scared"
        ? "#aaffaa"
        : b.state === "fleeing"
          ? "#ff6060"
          : "#ffcc44";
    const label =
      b.state === "scared"
        ? "😱 fugindo!"
        : b.state === "fleeing"
          ? "🏃 com a vaca!"
          : "🤫 se aproximando";
    ctx.fillText(label, x, y - FRAME_H + 4);
  }

  private renderVendorDialog() {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const d = this.vendorDialog;

    // Posição do vendedor na tela
    const vendorScreen = this.isoToScreen(VENDOR_COL, VENDOR_ROW);
    const bw = Math.min(W - 32, 320),
      bh = 110;

    // Posiciona a caixa acima da cabeça do vendedor
    let bx = vendorScreen.x - bw / 2;
    let by = vendorScreen.y - 64 - bh - 30; // acima do sprite

    // Garante que não saia da tela
    bx = Math.max(16, Math.min(W - bw - 16, bx));
    by = Math.max(16, by);

    // Se ficar muito pra cima, coloca embaixo do vendedor
    if (by < 16) {
      by = vendorScreen.y + 20;
    }

    // Retro box: dark border + scanline-ish fill
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,215,0,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);

    // Speaker label
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("▶ VENDEDOR", bx + 14, by + 18);

    // Typewriter text — wrap at bw-28px
    const visText = d.text.slice(0, d.displayed);
    ctx.fillStyle = "#e8e8d0";
    ctx.font = "13px monospace";
    const maxW = bw - 28;
    const lines: string[] = [];
    let current = "";
    for (const ch of visText) {
      if (ch === "\n") {
        lines.push(current);
        current = "";
        continue;
      }
      const test = current + ch;
      if (ctx.measureText(test).width > maxW) {
        lines.push(current);
        current = ch;
      } else current = test;
    }
    lines.push(current);
    lines.forEach((ln, i) => ctx.fillText(ln, bx + 14, by + 38 + i * 18));

    // Blinking cursor while typing; "▶ continuar" when done
    if (d.done) {
      const blink = Math.floor(this.time * 2) % 2 === 0;
      if (blink) {
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 3px monospace";
        ctx.textAlign = "right";
        ctx.fillText(
          "[ E / clique para continuar ]",
          bx + bw - 14,
          by + bh - 12,
        );
      }
    } else {
      if (Math.floor(this.time * 4) % 2 === 0) {
        ctx.fillStyle = "#e8e8d0";
        ctx.fillText(
          "█",
          bx + 14 + ctx.measureText(lines[lines.length - 1]!).width,
          by + 38 + (lines.length - 1) * 18,
        );
      }
    }
    ctx.textAlign = "left";
  }

  private renderMinigame() {
    const { ctx, canvas, lasso } = this;
    const W = canvas.width,
      H = canvas.height;
    const needed = lasso.cow?.type.clicksNeeded ?? 15;
    const prog = lasso.clickCount / needed;
    const timeR = lasso.timeLeft / LASSO_TIME_LIMIT;
    const flash = lasso.flashTimer > 0;
    const bw = 296,
      bh = 148;
    const bx = W / 2 - bw / 2,
      by = H / 2 - bh / 2 - 20;

    // Panel (9-slice, style 2 = lighter variant; flash = style variant 2 tint)
    this.drawPanel(bx, by, bw, bh, flash ? 2 : 0);

    // Title
    ctx.fillStyle = flash ? "#FF8800" : "#FFD700";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🤠  PUXE!  PUXE!  PUXE!", W / 2, by + 50);

    // Progress bar
    const barX = bx + 28,
      barY = by + 62,
      barW = bw - 56,
      barH = 20;
    ctx.fillStyle = "#1a0e04";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = prog > 0.7 ? "#4caf50" : prog > 0.4 ? "#8bc34a" : "#cddc39";
    ctx.fillRect(barX, barY, barW * prog, barH);
    ctx.strokeStyle = "#8B5A00";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);

    // Time bar
    const tbY = barY + 28;
    ctx.fillStyle = "#1a0e04";
    ctx.fillRect(barX, tbY, barW, 10);
    ctx.fillStyle = timeR > 0.4 ? "#ff9800" : "#f44336";
    ctx.fillRect(barX, tbY, barW * timeR, 10);
    ctx.strokeStyle = "#5a3000";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, tbY, barW, 10);

    // Counter
    ctx.fillStyle = "#C8A870";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${lasso.clickCount} / ${needed} puxadas`, W / 2, by + 120);

    // Mobile big tap target
    if (canvas.width < 700) {
      const btnState = flash ? "active" : "pressed";
      this.drawPixelBtn(W / 2 - 62, H - 224, 124, 52, btnState, true);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PUXAR! 💪", W / 2, H - 198);
      ctx.textBaseline = "alphabetic";
    }
  }

  private renderMobileControls() {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const jx = 88,
      jy = H - 90;

    // ── Virtual joystick (craftpix palette: brown tones) ──────────────────────
    ctx.fillStyle = "rgba(60,30,8,0.55)";
    ctx.strokeStyle = "#a87040";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(jx, jy, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(jx, jy, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(200,150,60,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(jx, jy, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(220,170,80,0.55)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▲", jx, jy - 32);
    ctx.fillText("▼", jx, jy + 32);
    ctx.fillText("◀", jx - 32, jy);
    ctx.fillText("▶", jx + 32, jy);
    const jtx = jx + this.joystick.dx * 26,
      jty = jy + this.joystick.dy * 26;
    ctx.fillStyle = "rgba(200,140,50,0.75)";
    ctx.strokeStyle = "#c89040";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(jtx, jty, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(jtx, jty, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textBaseline = "alphabetic";

    // ── Action button (bottom-right) ──────────────────────────────────────────
    const ax = W - 80,
      ay = H - 80;
    const nearest = this.nearestWanderingCow();
    const inRange = nearest && dist(this.player, nearest) <= CAPTURE_DIST;
    const atBase = this.isAtBase(),
      hasHerd = this.herdCows().length > 0;
    let btnState: "normal" | "active" | "pressed" = "normal";
    let icon = this.icons.spaceKey;
    let label = "E";
    let iconEmoji = "";

    const atVendor = this.isAtVendor();
    const nearBench = this.nearestBench();
    const nearTreeBtn = this.nearestChoppableTree();
    const nearBoulderBtn = this.nearestBoulder();
    if (this.chop.active) {
      btnState = this.chop.flashTimer > 0 ? "pressed" : "active";
      icon = this.icons.axeIcon;
    } else if (this.lasso.active && this.lasso.phase === "pulling") {
      btnState = this.lasso.flashTimer > 0 ? "pressed" : "active";
      icon = this.icons.pull;
    } else if (nearBench && !this.benchHubOpen) {
      btnState = "active";
      icon = this.icons.benchIcon;
    } else if (atVendor && !this.shopOpen) {
      btnState = "active";
      icon = this.icons.moneyIcon;
    } else if (atBase && hasHerd) {
      btnState = "active";
      icon = this.icons.base;
    } else if (nearBoulderBtn) {
      btnState = "active";
      iconEmoji = "🪨";
    } else if (nearTreeBtn) {
      btnState = "active";
      icon = this.icons.axeIcon;
    } else if (inRange) {
      btnState = "active";
      icon = this.icons.cowboy;
    }
    this.drawPixelBtn(ax - 30, ay - 30, 60, 60, btnState);
    if (iconEmoji) {
      ctx.font = "26px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(iconEmoji, ax, ay);
      ctx.textBaseline = "alphabetic";
    } else {
      ctx.drawImage(icon, ax - 16, ay - 16, 32, 32);
    }

    // ── Stake button (above action button) ────────────────────────────────────
    const stakeX = W - 80,
      stakeY = H - 170;
    const stakeActive = this.stake.phase !== "idle";
    this.drawPixelBtn(
      stakeX - 30,
      stakeY - 30,
      60,
      60,
      stakeActive ? "active" : "normal",
    );
    ctx.drawImage(this.icons.stakeIcon, stakeX - 16, stakeY - 16, 32, 32);

    // ── Chat button (above stake button) ─────────────────────────────────────
    const chatBtnX = W - 80,
      chatBtnY = H - 260;
    this.drawPixelBtn(
      chatBtnX - 30,
      chatBtnY - 24,
      60,
      48,
      this.chatOpen ? "active" : "normal",
    );
    ctx.fillStyle = "#FFD700";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💬", chatBtnX, chatBtnY - 8);
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#C8A870";
    ctx.fillText("CHAT", chatBtnX, chatBtnY + 10);
    ctx.textBaseline = "alphabetic";
  }

  // ─── Cowboy Book ──────────────────────────────────────────────────────────

  private renderBook() {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;
    const BW = Math.min(W - 32, 500),
      BH = Math.min(H - 32, 620);
    const BX = (W - BW) / 2,
      BY = (H - BH) / 2;

    // Backdrop
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, 0, W, H);

    // Book panel
    this.drawPanel(BX, BY, BW, BH, 1);

    // Inner parchment
    const parchX = BX + 26;
    const parchY = BY + 37;
    const parchW = BW - 50;
    const parchH = BH - 74;
    ctx.fillStyle = "#f2e8cc";
    ctx.fillRect(parchX, parchY, parchW, parchH);

    // Title
    ctx.fillStyle = "#5c2e08";
    ctx.font = "bold 20px serif";
    ctx.textAlign = "center";
    ctx.fillText("📖  Livro do Cowboy", BX + BW / 2, parchY + 26);

    // Tab buttons
    const ownedItemsCount = SHOP_ITEMS.filter(
      (it) => (this.inventory.get(it.id) ?? 0) > 0,
    ).length;
    const discovNPCCount = NPC_ENTRIES.filter((n) =>
      this.discoveredNPCs.has(n.id),
    ).length;
    const bookTabs: Array<{
      key: "vacas" | "itens" | "personagens";
      label: string;
    }> = [
      { key: "vacas", label: `🐄 ${this.discovered.size}/${COW_TYPES.length}` },
      { key: "itens", label: `🎒 ${ownedItemsCount}/${SHOP_ITEMS.length}` },
      {
        key: "personagens",
        label: `👤 ${discovNPCCount}/${NPC_ENTRIES.length}`,
      },
    ];
    const tabW = (parchW - 20) / 3;
    const tabY = parchY + 38;
    const tabH = 24;
    for (let i = 0; i < bookTabs.length; i++) {
      const tab = bookTabs[i]!;
      const tx = parchX + 10 + i * tabW;
      const active = this.bookTab === tab.key;
      ctx.fillStyle = active ? "#c8a060" : "#e0d0a8";
      ctx.beginPath();
      ctx.roundRect(tx, tabY, tabW - 4, tabH, [4, 4, 0, 0]);
      ctx.fill();
      ctx.strokeStyle = "#c8a060";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, tabY, tabW - 4, tabH, [4, 4, 0, 0]);
      ctx.stroke();
      ctx.fillStyle = active ? "#3a1a00" : "#887050";
      ctx.font = `bold ${active ? 12 : 11}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tab.label, tx + (tabW - 4) / 2, tabY + 12);
      ctx.textBaseline = "alphabetic";
    }

    const headerH = 74;
    ctx.strokeStyle = "#c8a060";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(parchX + 10, parchY + headerH);
    ctx.lineTo(parchX + parchW - 10, parchY + headerH);
    ctx.stroke();

    // Close button
    const closeBtnX = BX + BW - 54,
      closeBtnY = BY + 8;
    this.drawPixelBtn(closeBtnX, closeBtnY, 48, 40, "pressed");
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕", closeBtnX + 24, closeBtnY + 20);
    ctx.textBaseline = "alphabetic";

    const pageTop = parchY + headerH + 2;
    const pageH = parchH - headerH - 48;

    if (this.bookTab === "vacas") {
      this.renderBookVacas(
        parchX,
        parchY,
        parchW,
        parchH,
        pageTop,
        pageH,
        BX,
        BW,
      );
    } else if (this.bookTab === "itens") {
      this.renderBookItens(parchX, parchY, parchW, parchH, pageTop, BX, BW);
    } else {
      this.renderBookPersonagens(
        parchX,
        parchY,
        parchW,
        parchH,
        pageTop,
        pageH,
        BX,
        BW,
      );
    }
  }

  private renderBookVacas(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    pageTop: number,
    pageH: number,
    BX: number,
    BW: number,
  ) {
    const { ctx } = this;
    const pageCX = parchX + parchW / 2;

    const t = this.bookPageAnimT;
    const scaleX = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(parchX, pageTop, parchW, pageH + 40);
    ctx.clip();

    ctx.save();
    ctx.translate(pageCX, pageTop + pageH / 2);
    ctx.scale(scaleX, 1);
    ctx.translate(-pageCX, -(pageTop + pageH / 2));

    const cowType = COW_TYPES[this.bookPage]!;
    const discovered = this.discovered.has(cowType.id);
    const count = this.capturedByType.get(cowType.id) ?? 0;

    const cowCX = pageCX;
    const cowCY = pageTop + 90;

    if (discovered) {
      ctx.save();
      ctx.translate(cowCX, cowCY);
      ctx.scale(1.4, 1.4);
      this.drawCowAt(0, 0, cowType);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.roundRect(cowCX - 44, cowCY - 44, 88, 80, 12);
      ctx.fill();
      ctx.fillStyle = "#bbb";
      ctx.font = "bold 52px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", cowCX, cowCY - 4);
      ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = discovered ? "#3a1a00" : "#888";
    ctx.font = `bold ${discovered ? 22 : 18}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(discovered ? cowType.name : "???", pageCX, cowCY + 64);

    const rarityColor = RARITY_COLORS[cowType.rarity] ?? "#aaa";
    const rarityLabel = RARITY_LABELS[cowType.rarity] ?? cowType.rarity;
    ctx.font = "12px sans-serif";
    const badgeW = ctx.measureText(rarityLabel).width + 16;
    const badgeX = pageCX - badgeW / 2;
    ctx.fillStyle = rarityColor + "33";
    ctx.beginPath();
    ctx.roundRect(badgeX, cowCY + 70, badgeW, 20, 6);
    ctx.fill();
    ctx.fillStyle = rarityColor;
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(rarityLabel, pageCX, cowCY + 84);

    ctx.strokeStyle = "#c8a060";
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(parchX + 30, cowCY + 98);
    ctx.lineTo(parchX + parchW - 30, cowCY + 98);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (discovered) {
      ctx.fillStyle = "#5c3010";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      const maxDescW = parchW - 60;
      const words = cowType.description.split(" ");
      let line = "";
      let lineY = cowCY + 118;
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxDescW) {
          ctx.fillText(line, pageCX, lineY);
          line = word;
          lineY += 18;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, pageCX, lineY);
      lineY += 28;
      // Capturadas badge
      const capText =
        count > 0
          ? `🏆 ${count} capturada${count !== 1 ? "s" : ""}`
          : "🎯 Ainda não capturada";
      ctx.font = "bold 12px sans-serif";
      const capBW = ctx.measureText(capText).width + 20;
      const capBX = pageCX - capBW / 2;
      ctx.fillStyle = count > 0 ? "rgba(180,130,0,0.18)" : "rgba(0,0,0,0.07)";
      ctx.beginPath();
      ctx.roundRect(capBX, lineY - 14, capBW, 22, 8);
      ctx.fill();
      ctx.strokeStyle = count > 0 ? "rgba(180,130,0,0.5)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(capBX, lineY - 14, capBW, 22, 8);
      ctx.stroke();
      ctx.fillStyle = count > 0 ? "#8a6000" : "#999";
      ctx.textBaseline = "middle";
      ctx.fillText(capText, pageCX, lineY - 3);
      ctx.textBaseline = "alphabetic";
    } else {
      ctx.fillStyle = "#aaa";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      ctx.fillText("Não descoberta ainda.", pageCX, cowCY + 120);
    }

    ctx.restore();
    ctx.restore();

    this.renderBookNav(
      parchX,
      parchY,
      parchW,
      parchH,
      BX,
      BW,
      this.bookPage,
      COW_TYPES.length,
    );

    ctx.fillStyle = "#887050";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "← → ou scroll para navegar",
      BX + BW / 2,
      parchY + parchH - 6,
    );
  }

  private renderBookItens(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    pageTop: number,
    BX: number,
    BW: number,
  ) {
    const { ctx } = this;
    const pageCX = parchX + parchW / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(parchX, pageTop, parchW, parchH - (pageTop - parchY));
    ctx.clip();

    const itemH = 74;
    let iy = pageTop + 10;

    for (const item of SHOP_ITEMS) {
      const level = this.inventory.get(item.id) ?? 0;
      const owned = level > 0;
      const maxed = level >= item.maxLevel;

      ctx.fillStyle = owned ? "rgba(180,130,40,0.12)" : "rgba(0,0,0,0.05)";
      ctx.beginPath();
      ctx.roundRect(parchX + 14, iy, parchW - 28, itemH - 6, 8);
      ctx.fill();
      if (owned) {
        ctx.strokeStyle = "rgba(180,130,40,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(parchX + 14, iy, parchW - 28, itemH - 6, 8);
        ctx.stroke();
      }

      const iconX = parchX + 40;
      const iconY = iy + (itemH - 6) / 2 - 2;
      const iconRadius = 22;

      // Fundo circular do ícone
      ctx.fillStyle = owned ? "rgba(200,160,80,0.3)" : "rgba(100,100,100,0.15)";
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = owned
        ? "rgba(180,130,40,0.5)"
        : "rgba(100,100,100,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Ícone (imagem ou emoji)
      ctx.globalAlpha = owned ? 1 : 0.4;
      const itemImg = this.itemIcons.get(item.id);
      if (itemImg && itemImg.complete && itemImg.naturalWidth > 0) {
        const imgSize = 28;
        ctx.drawImage(
          itemImg,
          iconX - imgSize / 2,
          iconY - imgSize / 2,
          imgSize,
          imgSize,
        );
      } else {
        ctx.font = "26px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000";
        ctx.fillText(item.icon, iconX, iconY);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = owned ? "#3a1a00" : "#999";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(owned ? item.name : "???", parchX + 70, iy + 22);

      if (owned) {
        ctx.fillStyle = "#5c3010";
        ctx.font = "11px serif";
        ctx.fillText(item.description, parchX + 70, iy + 38);
      } else {
        ctx.fillStyle = "#bbb";
        ctx.font = "11px serif";
        ctx.fillText("Item não descoberto", parchX + 70, iy + 38);
      }

      if (owned) {
        const badgeText =
          item.placeable || item.consumable
            ? `x${level}`
            : maxed
              ? "MAX"
              : `Nív. ${level}/${item.maxLevel}`;
        ctx.font = "bold 11px sans-serif";
        const bw = ctx.measureText(badgeText).width + 12;
        const bx = parchX + parchW - 28 - bw;
        ctx.fillStyle =
          (maxed && !item.placeable && !item.consumable
            ? "#FFD700"
            : "#c8a060") + "44";
        ctx.beginPath();
        ctx.roundRect(bx, iy + 10, bw, 18, 5);
        ctx.fill();
        ctx.fillStyle =
          maxed && !item.placeable && !item.consumable ? "#b08000" : "#6a4020";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, bx + bw / 2, iy + 19);
        ctx.textBaseline = "alphabetic";
      }

      iy += itemH;
    }

    ctx.restore();

    const ownedCount = SHOP_ITEMS.filter(
      (it) => (this.inventory.get(it.id) ?? 0) > 0,
    ).length;
    ctx.fillStyle = "#887050";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Itens descobertos: ${ownedCount} / ${SHOP_ITEMS.length}`,
      BX + BW / 2,
      parchY + parchH - 6,
    );
  }

  private renderBookPersonagens(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    pageTop: number,
    pageH: number,
    BX: number,
    BW: number,
  ) {
    const { ctx } = this;
    const pageCX = parchX + parchW / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(parchX, pageTop, parchW, pageH + 40);
    ctx.clip();

    const npc = NPC_ENTRIES[this.bookPage];
    if (!npc) {
      ctx.restore();
      return;
    }
    const discovered = this.discoveredNPCs.has(npc.id);

    const npcCX = pageCX;
    const npcCY = pageTop + 90;

    if (discovered) {
      const img = sprites.get(npc.spriteKey);
      const SW = 64,
        SH = 64;
      if (img) {
        ctx.save();
        ctx.translate(npcCX, npcCY - 14);
        ctx.scale(1.4, 1.4);
        // Se for sprite sheet (bandit), extrair um frame específico
        if (npc.spriteKey.includes("bandit")) {
          // Pegar frame 0 da row 2 (direção leste)
          ctx.drawImage(img, 0, 2 * SH, SW, SH, -SW / 2, -SH / 2, SW, SH);
        } else {
          ctx.drawImage(img, -SW / 2, -SH / 2, SW, SH);
        }
        ctx.restore();
      } else {
        ctx.font = "52px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#887050";
        ctx.fillText("🧑‍🌾", npcCX, npcCY - 10);
        ctx.textBaseline = "alphabetic";
      }
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.roundRect(npcCX - 44, npcCY - 54, 88, 80, 12);
      ctx.fill();
      ctx.fillStyle = "#bbb";
      ctx.font = "bold 52px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", npcCX, npcCY - 14);
      ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = discovered ? "#3a1a00" : "#888";
    ctx.font = `bold ${discovered ? 22 : 18}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(discovered ? npc.name : "???", pageCX, npcCY + 60);

    if (discovered) {
      ctx.font = "12px sans-serif";
      const bw = ctx.measureText(npc.role).width + 16;
      const bx = pageCX - bw / 2;
      ctx.fillStyle = "rgba(92,46,8,0.15)";
      ctx.beginPath();
      ctx.roundRect(bx, npcCY + 66, bw, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#5c2e08";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(npc.role, pageCX, npcCY + 80);

      ctx.strokeStyle = "#c8a060";
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(parchX + 30, npcCY + 94);
      ctx.lineTo(parchX + parchW - 30, npcCY + 94);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#5c3010";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      const maxDescW = parchW - 60;
      const words = npc.description.split(" ");
      let line = "";
      let lineY = npcCY + 116;
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxDescW) {
          ctx.fillText(line, pageCX, lineY);
          line = word;
          lineY += 18;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, pageCX, lineY);
    } else {
      ctx.fillStyle = "#aaa";
      ctx.font = "13px serif";
      ctx.textAlign = "center";
      ctx.fillText("Personagem não encontrado.", pageCX, npcCY + 112);
    }

    ctx.restore();

    if (NPC_ENTRIES.length > 1) {
      this.renderBookNav(
        parchX,
        parchY,
        parchW,
        parchH,
        BX,
        BW,
        this.bookPage,
        NPC_ENTRIES.length,
      );
    }

    const discCount = NPC_ENTRIES.filter((n) =>
      this.discoveredNPCs.has(n.id),
    ).length;
    ctx.fillStyle = "#887050";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Encontrados: ${discCount} / ${NPC_ENTRIES.length}`,
      BX + BW / 2,
      parchY + parchH - 6,
    );
  }

  private renderBookNav(
    parchX: number,
    parchY: number,
    parchW: number,
    parchH: number,
    BX: number,
    BW: number,
    page: number,
    total: number,
  ) {
    const { ctx } = this;
    const navY = parchY + parchH - 44;
    const prevCX = BX + BW / 2 - 70;
    const nextCX = BX + BW / 2 + 70;

    const canPrev = page > 0;
    this.drawPixelBtn(
      prevCX - 28,
      navY - 16,
      56,
      34,
      canPrev ? "normal" : "pressed",
    );
    ctx.fillStyle = canPrev ? "#FFD700" : "#888";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("◀  Ant.", prevCX, navY + 1);

    ctx.fillStyle = "#887050";
    ctx.font = "bold 13px serif";
    ctx.fillText(`${page + 1} / ${total}`, BX + BW / 2, navY + 1);

    const canNext = page < total - 1;
    this.drawPixelBtn(
      nextCX - 28,
      navY - 16,
      56,
      34,
      canNext ? "normal" : "pressed",
    );
    ctx.fillStyle = canNext ? "#FFD700" : "#888";
    ctx.fillText("Próx.  ▶", nextCX, navY + 1);
    ctx.textBaseline = "alphabetic";
  }

  // ─── Vendedor NPC ─────────────────────────────────────────────────────────

  private drawVendorNPC() {
    const { ctx } = this;
    const { x, y } = this.isoToScreen(VENDOR_COL, VENDOR_ROW);

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sprite
    const img = sprites.get("npcs/saler.png");
    const SW = 64,
      SH = 64;
    if (img) {
      ctx.drawImage(img, x - SW / 2, y - SH + 12, SW, SH);
    } else {
      // Fallback canvas enquanto o sprite carrega
      ctx.fillStyle = "#7a4a18";
      ctx.beginPath();
      ctx.roundRect(x - 9, y - 30, 18, 22, 3);
      ctx.fill();
      ctx.fillStyle = "#e8c090";
      ctx.beginPath();
      ctx.arc(x, y - 36, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tag de nome acima da cabeça
    const headTop = y - SH + 12; // topo do sprite
    const nameText = "🛒 Vendedor";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const nameW = ctx.measureText(nameText).width + 16;
    const nameTagY = headTop - 8; // logo acima do sprite
    // Fundo escuro com borda dourada
    ctx.fillStyle = "rgba(10, 8, 20, 0.80)";
    ctx.beginPath();
    (ctx as any).roundRect(x - nameW / 2, nameTagY - 14, nameW, 17, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 215, 0, 0.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Texto
    ctx.fillStyle = "#FFE566";
    ctx.fillText(nameText, x, nameTagY);

    // Moeda animada acima do nome
    const coinBob = Math.sin(this.time * 2) * 2;
    const coinY = nameTagY - 20 + coinBob;
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(x, coinY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a07000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#7a5000";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", x, coinY);
    ctx.textBaseline = "alphabetic";

    // Anel de interação quando player está perto
    if (this.isAtVendor() && !this.shopOpen) {
      ctx.strokeStyle = "rgba(255,215,0,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 28, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── Loja UI ──────────────────────────────────────────────────────────────

  private renderBenchHub() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const bench = this.activeBench!;
    const isComm = bench.type === "bancada_comunitaria";
    const isOwner = bench.owner === this.myName;

    // Receitas disponíveis
    interface Recipe { id: string; name: string; icon: string; desc: string; stone: number; coins: number; }
    const recipes: Recipe[] = [
      { id: "machado", name: "Machado de Pedra", icon: "🪓", desc: "Necessário para cortar árvores", stone: 5, coins: 50 },
    ];

    const RECIPE_H = 68;
    const PW = Math.min(W - 32, 380);
    const HEADER_H = 66;
    const pickupH = isOwner ? 46 : 0;
    const PH = Math.min(H - 40, HEADER_H + recipes.length * RECIPE_H + 20 + pickupH);
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    this.drawPanel(PX, PY, PW, PH, 0);

    // Título
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#FFD700";
    const title = isComm ? "🏗️ Bancada Comunitária" : "🔨 Bancada Individual";
    ctx.fillText(title, PX + PW / 2, PY + 28);

    // Dono
    ctx.font = "11px sans-serif";
    ctx.fillStyle = bench.ownerColor;
    ctx.fillText(`de ${bench.owner}`, PX + PW / 2, PY + 46);

    // Divisor
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H - 4);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H - 4);
    ctx.stroke();

    // Receitas
    this.benchCraftBtns = [];
    let ry = PY + HEADER_H;
    const stone = this.inventory.get("stone") ?? 0;
    const machado = this.inventory.get("machado") ?? 0;

    for (const recipe of recipes) {
      const canCraft = stone >= recipe.stone && this.coins >= recipe.coins && machado === 0;
      const alreadyHas = recipe.id === "machado" && machado > 0;

      // Recipe card background
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(PX + 8, ry + 4, PW - 16, RECIPE_H - 8);
      ctx.strokeStyle = "rgba(200,160,80,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(PX + 8, ry + 4, PW - 16, RECIPE_H - 8);

      // Icon + name
      ctx.drawImage(this.icons.axeIcon, PX + 14, ry + 10, 18, 18);
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.textAlign = "left";
      ctx.fillText(recipe.name, PX + 38, ry + 24);

      // Description
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.fillText(recipe.desc, PX + 16, ry + 38);

      // Ingredients
      ctx.font = "11px sans-serif";
      const stoneOk = stone >= recipe.stone;
      const coinsOk = this.coins >= recipe.coins;
      ctx.fillStyle = stoneOk ? "#90ee90" : "#ff8888";
      ctx.fillText(`🪨 ${stone}/${recipe.stone}`, PX + 16, ry + 54);
      ctx.fillStyle = coinsOk ? "#90ee90" : "#ff8888";
      ctx.fillText(`💰 ${this.coins}/${recipe.coins}`, PX + 80, ry + 54);

      // Craft button
      const btnW = 80, btnH = 26;
      const btnX = PX + PW - 16 - btnW;
      const btnY = ry + (RECIPE_H - btnH) / 2;

      if (alreadyHas) {
        ctx.fillStyle = "rgba(100,100,100,0.5)";
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("✓ Tem", btnX + btnW / 2, btnY + btnH / 2 + 4);
      } else {
        this.drawPixelBtn(btnX, btnY, btnW, btnH, "normal");
        ctx.font = `bold 11px sans-serif`;
        ctx.fillStyle = canCraft ? "#FFD700" : "#888";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(canCraft ? "✦ Criar" : "🔒 Criar", btnX + btnW / 2, btnY + btnH / 2);
        ctx.textBaseline = "alphabetic";
        if (canCraft) {
          this.benchCraftBtns.push({ id: recipe.id, x: btnX, y: btnY, w: btnW, h: btnH });
        }
      }

      ry += RECIPE_H;
    }

    // Botão fechar
    const closeCX = PX + PW - 18, closeCY = PY + 18;
    ctx.fillStyle = "#9b3a18";
    ctx.beginPath();
    ctx.arc(closeCX, closeCY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e05030";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("✕", closeCX, closeCY);
    ctx.textBaseline = "alphabetic";
    this.benchHubCloseBtn = { x: closeCX, y: closeCY, r: 12 };

    // Botão recolher (só o dono)
    if (isOwner) {
      const bW = 140, bH = 30;
      const bX = PX + PW / 2 - bW / 2;
      const bY = PY + PH - 44;
      this.drawPixelBtn(bX, bY, bW, bH, "normal");
      ctx.fillStyle = "#FF9980";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📦 Recolher bancada", bX + bW / 2, bY + bH / 2);
      ctx.textBaseline = "alphabetic";
      this.benchPickupBtn = { x: bX, y: bY, w: bW, h: bH };
    } else {
      this.benchPickupBtn = { x: 0, y: 0, w: 0, h: 0 };
    }
  }

  private renderShop() {
    const { ctx, canvas } = this;
    const W = canvas.width,
      H = canvas.height;

    const herd = this.herdCows();
    const based = this.basedCows().sort((a, b) => a.herdIndex - b.herdIndex);
    const ROW_H = 52;
    const SELL_MAX = 4; // max visible per section
    const PW = Math.min(W - 32, 390);

    // ── Compute panel height per tab ──────────────────────────────────────────
    let contentH: number;
    let totalBuyContentH = 0;
    const MAX_BUY_VISIBLE_H = 420; // altura máxima visível na aba comprar
    if (this.shopTab === "sell") {
      const herdRows = Math.max(1, Math.min(herd.length, SELL_MAX));
      const herdSellAllH = herd.length > 0 ? 44 : 0;
      const basedRows = Math.max(1, Math.min(based.length, SELL_MAX));
      const basedSellAllH = based.length > 0 ? 44 : 0;
      contentH =
        24 +
        herdRows * ROW_H +
        herdSellAllH +
        12 +
        24 +
        basedRows * ROW_H +
        basedSellAllH +
        8;
    } else {
      // Calcular altura real do conteúdo (com alturas dinâmicas)
      totalBuyContentH = 8;
      for (const item of SHOP_ITEMS) {
        const descLines = this.wrapTextLines(
          item.description,
          PW - 50 - 72 - 24,
          "10px sans-serif",
        );
        totalBuyContentH += 72 + (descLines.length - 1) * 12;
      }
      contentH = Math.min(MAX_BUY_VISIBLE_H, totalBuyContentH);
    }
    const HEADER_H = 66; // title + coins
    const TAB_H = 38;
    const PH = Math.min(H - 40, HEADER_H + TAB_H + contentH);
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2;

    // ── Overlay + panel ───────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    this.drawPanel(PX, PY, PW, PH, 0);

    // ── Title ─────────────────────────────────────────────────────────────────
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.fillText("🤠  Loja do Vaqueiro", PX + PW / 2, PY + 26);
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = "#FFD700";
    const coinsText = `${this.coins} moedas`;
    const coinsTextWidth = ctx.measureText(coinsText).width;
    ctx.drawImage(
      this.icons.moneyIcon,
      PX + PW / 2 - coinsTextWidth / 2 - 20,
      PY + 38,
      16,
      16,
    );
    ctx.fillText(coinsText, PX + PW / 2, PY + 48);

    // ── Close button ──────────────────────────────────────────────────────────
    const closeCX = PX + PW - 18,
      closeCY = PY + 18;
    this.shopCloseBtn = { x: closeCX, y: closeCY, r: 12 };
    ctx.fillStyle = "#9b3a18";
    ctx.beginPath();
    ctx.arc(closeCX, closeCY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e05030";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#FFE0A0";
    ctx.font = "bold 13px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText("✕", closeCX, closeCY);
    ctx.textBaseline = "alphabetic";

    // Divisor under header
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H);
    ctx.stroke();

    // ── Tabs ──────────────────────────────────────────────────────────────────
    this.shopTabBtns = [];
    const tabLabels: Array<{ tab: "sell" | "buy"; label: string }> = [
      { tab: "sell", label: "🐄 Vender" },
      { tab: "buy", label: "🛒 Comprar" },
    ];
    const tabW = PW / tabLabels.length;
    const tabY = PY + HEADER_H;
    for (let ti = 0; ti < tabLabels.length; ti++) {
      const { tab, label } = tabLabels[ti]!;
      const tx = PX + ti * tabW;
      const isActive = this.shopTab === tab;
      ctx.fillStyle = isActive ? "rgba(160,100,20,0.5)" : "rgba(0,0,0,0.25)";
      ctx.fillRect(tx, tabY, tabW, TAB_H);
      ctx.fillStyle = isActive ? "#FFD700" : "#C8A870";
      ctx.font = `${isActive ? "bold " : ""}13px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, tx + tabW / 2, tabY + 24);
      if (isActive) {
        ctx.fillStyle = "#c89040";
        ctx.fillRect(tx, tabY + TAB_H - 3, tabW, 3);
      }
      this.shopTabBtns.push({ tab, x: tx, y: tabY, w: tabW, h: TAB_H });
    }

    // Divisor under tabs
    ctx.strokeStyle = "rgba(200,160,80,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX + 10, PY + HEADER_H + TAB_H);
    ctx.lineTo(PX + PW - 10, PY + HEADER_H + TAB_H);
    ctx.stroke();

    const contentY = PY + HEADER_H + TAB_H;

    // ── Helper: draw a cow row ─────────────────────────────────────────────────
    const drawCowRow = (
      cow: Cow,
      rowY: number,
      rowIdx: number,
      btnArr: typeof this.shopSellButtons,
    ) => {
      if (rowIdx % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(PX + 6, rowY, PW - 12, ROW_H);
      }
      // Clip to row so cow drawing can't bleed outside
      ctx.save();
      ctx.beginPath();
      ctx.rect(PX + 6, rowY, PW - 12, ROW_H);
      ctx.clip();
      // Draw cow centred vertically in the upper ⅔ of the row
      this.drawCowAt(PX + 30, rowY + Math.round(ROW_H * 0.52), cow.type);
      ctx.restore();
      const textX = PX + 58;
      ctx.textAlign = "left";
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#FFE0A0";
      ctx.fillText(cow.type.name, textX, rowY + 16);
      const rc = RARITY_COLORS[cow.type.rarity] ?? "#9e9e9e";
      const rl = RARITY_LABELS[cow.type.rarity] ?? cow.type.rarity;
      ctx.font = "9px sans-serif";
      const bw = ctx.measureText(rl).width + 8;
      ctx.fillStyle = rc + "33";
      ctx.beginPath();
      ctx.roundRect(textX, rowY + 19, bw, 13, 3);
      ctx.fill();
      ctx.fillStyle = rc;
      ctx.fillText(rl, textX + 4, rowY + 29);
      const price = COW_SELL_PRICES[cow.type.rarity] ?? 10;
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.drawImage(this.icons.moneyIcon, textX, rowY + 34, 12, 12);
      ctx.fillText(`${price}`, textX + 14, rowY + 44);
      const bW = 64,
        bH = 24;
      const bX = PX + PW - bW - 12,
        bY = rowY + (ROW_H - bH) / 2;
      this.drawPixelBtn(bX, bY, bW, bH, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Vender", bX + bW / 2, bY + bH / 2);
      ctx.textBaseline = "alphabetic";
      btnArr.push({ cow, x: bX, y: bY, w: bW, h: bH });
    };

    // ── Helper: "Vender Tudo" button ──────────────────────────────────────────
    const drawSellAllBtn = (
      cows: Cow[],
      atY: number,
    ): { x: number; y: number; w: number; h: number } => {
      if (cows.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      const total = cows.reduce(
        (s, c) => s + (COW_SELL_PRICES[c.type.rarity] ?? 10),
        0,
      );
      const bW = Math.min(PW - 40, 230),
        bH = 30;
      const bX = PX + (PW - bW) / 2,
        bY = atY + 7;
      this.drawPixelBtn(bX, bY, bW, bH, "normal");
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const sellAllText = `Vender Tudo  ${total}`;
      const sellAllTextWidth = ctx.measureText(sellAllText).width;
      ctx.drawImage(
        this.icons.moneyIcon,
        bX + bW / 2 - sellAllTextWidth / 2 + 68,
        bY + bH / 2 - 7,
        14,
        14,
      );
      ctx.fillText(`Vender Tudo       ${total}`, bX + bW / 2, bY + bH / 2);
      ctx.textBaseline = "alphabetic";
      return { x: bX, y: bY, w: bW, h: bH };
    };

    // ── Sell tab ──────────────────────────────────────────────────────────────
    if (this.shopTab === "sell") {
      this.shopSellButtons = [];
      this.shopSellBasedButtons = [];
      let cy = contentY + 6;

      // Sub-header: Rebanho
      ctx.textAlign = "left";
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.fillText("🐄 Rebanho", PX + 12, cy + 13);
      cy += 20;

      const herdVisible = herd.slice(0, SELL_MAX);
      if (herdVisible.length === 0) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#7a6040";
        ctx.textAlign = "center";
        ctx.fillText("Rebanho vazio", PX + PW / 2, cy + ROW_H / 2 + 4);
        cy += ROW_H;
      } else {
        for (let i = 0; i < herdVisible.length; i++) {
          drawCowRow(herdVisible[i]!, cy, i, this.shopSellButtons);
          cy += ROW_H;
        }
        if (herd.length > SELL_MAX) {
          ctx.font = "10px sans-serif";
          ctx.fillStyle = "#C8A870";
          ctx.textAlign = "center";
          ctx.fillText(`+${herd.length - SELL_MAX} mais`, PX + PW / 2, cy - 2);
        }
      }
      this.shopSellAllHerdBtn = drawSellAllBtn(herd, cy);
      cy += herd.length > 0 ? 44 : 0;

      // Divider
      cy += 8;
      ctx.strokeStyle = "rgba(200,160,80,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PX + 16, cy);
      ctx.lineTo(PX + PW - 16, cy);
      ctx.stroke();
      cy += 4;

      // Sub-header: Curral
      ctx.textAlign = "left";
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#C8A870";
      ctx.fillText("🏠 Curral", PX + 12, cy + 13);
      cy += 20;

      const basedVisible = based.slice(0, SELL_MAX);
      if (basedVisible.length === 0) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#7a6040";
        ctx.textAlign = "center";
        ctx.fillText("Curral vazio", PX + PW / 2, cy + ROW_H / 2 + 4);
        cy += ROW_H;
      } else {
        for (let i = 0; i < basedVisible.length; i++) {
          drawCowRow(basedVisible[i]!, cy, i, this.shopSellBasedButtons);
          cy += ROW_H;
        }
        if (based.length > SELL_MAX) {
          ctx.font = "10px sans-serif";
          ctx.fillStyle = "#C8A870";
          ctx.textAlign = "center";
          ctx.fillText(`+${based.length - SELL_MAX} mais`, PX + PW / 2, cy - 2);
        }
      }
      this.shopSellAllBasedBtn = drawSellAllBtn(based, cy);

      // ── Buy tab ───────────────────────────────────────────────────────────────
    } else {
      this.shopBuyButtons = [];
      const btnW = 72;
      const textMaxWidth = PW - 50 - btnW - 24; // largura disponível para descrição

      // Helper para quebrar texto em linhas
      const wrapText = (
        text: string,
        maxWidth: number,
        font: string,
      ): string[] => {
        ctx.font = font;
        const words = text.split(" ");
        const lines: string[] = [];
        let currentLine = "";
        for (const word of words) {
          const testLine = currentLine ? currentLine + " " + word : word;
          if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };

      // Calcular altura total do conteúdo
      let totalContentHeight = 8;
      for (const item of SHOP_ITEMS) {
        const descLines = wrapText(
          item.description,
          textMaxWidth,
          "10px sans-serif",
        );
        totalContentHeight += 72 + (descLines.length - 1) * 12;
      }

      // Limitar o scroll ao máximo
      const maxScroll = Math.max(0, totalContentHeight - contentH);
      this.shopBuyScroll = Math.min(this.shopBuyScroll, maxScroll);

      // Guardar área de conteúdo para detectar scroll
      this.shopBuyContentArea = { x: PX, y: contentY, w: PW, h: contentH };

      // Aplicar clipping na área de conteúdo
      ctx.save();
      ctx.beginPath();
      ctx.rect(PX + 4, contentY, PW - 8, contentH);
      ctx.clip();

      let cy = contentY + 8 - this.shopBuyScroll;

      for (const item of SHOP_ITEMS) {
        const level = this.inventory.get(item.id) ?? 0;
        const maxed = level >= item.maxLevel;
        const price = maxed ? 0 : itemNextPrice(item, level);
        const canAfford = !maxed && this.coins >= price;

        // Calcula linhas da descrição
        const descLines = wrapText(
          item.description,
          textMaxWidth,
          "10px sans-serif",
        );
        const itemH = 72 + (descLines.length - 1) * 12;

        // Pular itens fora da área visível
        if (cy + itemH < contentY || cy > contentY + contentH) {
          cy += itemH;
          continue;
        }

        // Row bg
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(PX + 6, cy, PW - 12, itemH - 2);

        // Icon background
        const iconX = PX + 36;
        const iconY = cy + 36;
        ctx.fillStyle = "rgba(200,160,80,0.25)";
        ctx.beginPath();
        ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(180,130,40,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Icon (image or emoji)
        const shopItemImg = this.itemIcons.get(item.id);
        if (
          shopItemImg &&
          shopItemImg.complete &&
          shopItemImg.naturalWidth > 0
        ) {
          ctx.drawImage(shopItemImg, iconX - 12, iconY - 12, 24, 24);
        } else {
          ctx.font = "22px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#FFE0A0";
          ctx.fillText(item.icon, iconX, iconY);
          ctx.textBaseline = "alphabetic";
        }

        // Name
        ctx.textAlign = "left";
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = "#FFE0A0";
        ctx.fillText(item.name, PX + 60, cy + 18);

        // Description (múltiplas linhas)
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#C8A870";
        let descY = cy + 32;
        for (const line of descLines) {
          ctx.fillText(line, PX + 60, descY);
          descY += 12;
        }

        // Level pips ou quantidade (para itens placeáveis)
        const pipsY = cy + 32 + descLines.length * 12 + 4;
        if (item.placeable || item.consumable) {
          ctx.font = "bold 10px sans-serif";
          ctx.fillStyle = level > 0 ? "#98FF98" : "#C8A870";
          ctx.textAlign = "left";
          ctx.fillText(
            level > 0
              ? `x${level}/${item.maxLevel} em estoque`
              : `0/${item.maxLevel} em estoque`,
            PX + 62,
            pipsY + 4,
          );
        } else {
          ctx.fillStyle = "#9b7e57";
          for (let i = 0; i < item.maxLevel; i++) {
            ctx.fillStyle = i < level ? "#FFD700" : "#3a2208";
            ctx.beginPath();
            ctx.arc(PX + 62 + i * 14, pipsY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#9b7e57";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.font = "10px sans-serif";
          ctx.fillStyle = "#C8A870";
          ctx.textAlign = "left";
          ctx.fillText(
            `Nível ${level}/${item.maxLevel}`,
            PX + 62 + item.maxLevel * 14 + 4,
            pipsY + 4,
          );
        }

        // Buy button
        const bW = 72,
          bH = 28;
        const bX = PX + PW - bW - 12,
          bY = cy + (itemH - bH) / 2;
        if (maxed && item.consumable) {
          this.drawPixelBtn(bX, bY, bW, bH, "pressed");
          ctx.fillStyle = "#7a6040";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Cheio", bX + bW / 2, bY + bH / 2);
        } else if (maxed && !item.placeable) {
          this.drawPixelBtn(bX, bY, bW, bH, "pressed");
          ctx.fillStyle = "#7a6040";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Máximo", bX + bW / 2, bY + bH / 2);
        } else {
          this.drawPixelBtn(bX, bY, bW, bH, canAfford ? "normal" : "pressed");
          ctx.fillStyle = canAfford ? "#FFD700" : "#7a6040";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const priceText = `${price}`;
          const priceTextWidth = ctx.measureText(priceText).width;
          ctx.drawImage(
            this.icons.moneyIcon,
            bX + bW / 2 - priceTextWidth / 2 - 16,
            bY + bH / 2 - 6,
            12,
            12,
          );
          ctx.fillText(priceText, bX + bW / 2, bY + bH / 2);
          // Só adicionar botão se estiver visível
          if (canAfford && bY + bH > contentY && bY < contentY + contentH)
            this.shopBuyButtons.push({ item, x: bX, y: bY, w: bW, h: bH });
        }
        ctx.textBaseline = "alphabetic";

        cy += itemH;
      }

      ctx.restore();

      // Desenhar scrollbar se necessário
      if (maxScroll > 0) {
        const scrollBarH = contentH - 8;
        const thumbH = Math.max(
          30,
          (contentH / totalContentHeight) * scrollBarH,
        );
        const thumbY =
          contentY +
          4 +
          (this.shopBuyScroll / maxScroll) * (scrollBarH - thumbH);

        // Track
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(PX + PW - 10, contentY + 4, 6, scrollBarH);

        // Thumb
        ctx.fillStyle = "rgba(200,160,80,0.6)";
        ctx.beginPath();
        ctx.roundRect(PX + PW - 10, thumbY, 6, thumbH, 3);
        ctx.fill();
      }
    }
  }

  private drawCowAt(x: number, y: number, t: CowType) {
    const { ctx } = this;
    const cowSprite = t.sprite ? sprites.get(t.sprite) : null;
    if (cowSprite) {
      const s = 52;
      ctx.drawImage(cowSprite, x - s / 2, y - s + 4, s, s);
      return;
    }
    const body = t.bodyColor,
      spot = t.spotColor;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 20, 30, 16, 4);
    ctx.fill();
    if (t.renderStyle === "striped") {
      ctx.fillStyle = spot;
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 14 + i * 7, y - 20, 3, 16);
    } else {
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.ellipse(x - 5, y - 13, 5, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 5, y - 10, 4, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(x + 12, y - 22, 14, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 21, y - 20, 2, 2);
    ctx.fillStyle = "#ddd";
    for (const lx of [x - 12, x - 4, x + 4, x + 10])
      ctx.fillRect(lx, y - 4, 4, 8);
  }
}
