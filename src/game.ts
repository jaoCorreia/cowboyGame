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
  CAPTURE_DIST,
  LASSO_TIME_LIMIT,
  LASSO_THROW_DURATION,
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
import { World, type Entity } from "./ecs/World";
import {
  Position as EcsPosition,
  CowAI,
  CowTypeComp,
  BanditAI,
  BasedTag,
  LegacyId,
  NetworkId,
  RemotePlayerData,
} from "./components";
import { CowAISystem } from "./systems/CowAISystem";
import { BanditAISystem } from "./systems/BanditAISystem";
import { type NPCEntry, NPC_ENTRIES } from "./npcs";
import { drawPanel, drawPixelBtn, drawCowAt } from "./ui/drawUtils";
import { BookRenderer } from "./ui/BookRenderer";
import { ShopRenderer, type ShopCtx } from "./ui/ShopRenderer";
import { MobileControlsRenderer, type MobileCtx } from "./ui/MobileControls";
import { InventoryRenderer, type InventoryCtx } from "./ui/InventoryRenderer";
import { BenchHubRenderer } from "./ui/BenchHubRenderer";
import { VendorRenderer } from "./ui/VendorRenderer";
import { BanditRenderer, type BanditView } from "./ui/BanditRenderer";
import { CowRenderer } from "./ui/CowRenderer";
import { renderNightOverlay } from "./ui/NightOverlay";
import { MapRenderer } from "./ui/MapRenderer";
import {
  drawBirthdayCake,
  renderBirthdayParticles,
  renderEventPopup,
  renderStarterPackPopup,
  renderBirthdayDialog,
} from "./ui/BirthdayRenderer";
import {
  renderStatsPanel,
  renderOnlinePanel,
  renderChat,
} from "./ui/HUDRenderer";
import { renderAdminOverlay } from "./ui/AdminRenderer";

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
  cowEntity: Entity | null;
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
  private basedCount = 0;
  private lasso: Lasso;
  private world = new World();
  private cowAISystem = new CowAISystem();
  private banditAISystem = new BanditAISystem();
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
  private remotePlayerEntities = new Map<string, Entity>();
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
  private bookRenderer = new BookRenderer();
  private shopRenderer = new ShopRenderer();
  private mobileControlsRenderer = new MobileControlsRenderer();
  private inventoryRenderer = new InventoryRenderer();
  private benchHubRenderer = new BenchHubRenderer();
  private vendorRenderer = new VendorRenderer();
  private banditRenderer = new BanditRenderer();
  private cowRenderer = new CowRenderer();
  private mapRenderer = new MapRenderer();
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
  private benchCraftBtns: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
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
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    life: number;
    maxLife: number;
    size: number;
  }> = [];
  private eventPopupDismissed = !!sessionStorage.getItem(
    "cowboy_bday_popup_seen",
  );
  private eventPopupTimer = 10;

  // Starter pack one-time popup
  private starterPackDismissed = !!localStorage.getItem("cowboy_starter_v1");
  private starterPackBuyBtn = { x: 0, y: 0, w: 0, h: 0 };
  private starterPackCloseBtn = { x: 0, y: 0, w: 0, h: 0 };

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
      this.birthdaySentParabens = !!localStorage.getItem(
        "cowboy_parabens_2025",
      );
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
    for (let i = 0; i < COW_COUNT; i++) {
      this.spawnCowEntity(i);
    }
    // Restaura vacas que estavam na base ao deslogar
    if (userData?.basedCows && userData.basedCows.length > 0) {
      userData.basedCows.forEach((typeId, i) => {
        const pos = basedSlotPos(i);
        this.addBasedCowEntity(COW_COUNT + i, pos.col, pos.row, typeId);
      });
      this.nextCowId = COW_COUNT + userData.basedCows.length;
    }
    this.lasso = {
      active: false,
      cowEntity: null,
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
          for (const p of existing) this._spawnRemotePlayer(p);
        },
        onJoin: (p) => {
          this._spawnRemotePlayer(p);
        },
        onMove: (u) => {
          const entity = this.remotePlayerEntities.get(u.id);
          if (entity !== undefined) {
            const pos = this.world.get(entity, EcsPosition);
            const data = this.world.get(entity, RemotePlayerData);
            if (pos) {
              pos.col = u.col;
              pos.row = u.row;
            }
            if (data) {
              data.dirCol = u.dirCol;
              data.dirRow = u.dirRow;
              data.moving = u.moving;
              data.herdCount = u.herdCount;
            }
          }
        },
        onLeave: (id) => {
          const entity = this.remotePlayerEntities.get(id);
          if (entity !== undefined) {
            this.world.destroy(entity);
            this.remotePlayerEntities.delete(id);
          }
          // Vacas no curral permanecem visíveis mesmo após desconexão
        },
        onCowBased: (batch) => {
          if (batch.id === this.myId) {
            // Aplica posições canônicas do servidor nas vacas locais no curral
            const localBased = this.basedCows().sort(
              (a, b) => a.herdIndex - b.herdIndex,
            );
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
          const rpEntity = this.remotePlayerEntities.get(msg.id);
          if (rpEntity !== undefined) {
            const data = this.world.get(rpEntity, RemotePlayerData);
            if (data) {
              data.lastMessage = msg.text;
              data.lastMessageTime = Date.now();
            }
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
          basedCowTypes: this.basedCows()
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
      if (isNaN(col) || isNaN(row)) {
        err("Uso: /tp <col> <row>");
        return;
      }
      this.player.col = Math.max(0, Math.min(MAP_COLS - 1, col));
      this.player.row = Math.max(0, Math.min(MAP_ROWS - 1, row));
      ok(`Teletransportado para (${col}, ${row})`);
    } else if (cmd === "spawn") {
      const entity = this.spawnCowEntity(this.nextCowId++);
      const pos = this.world.must(entity, EcsPosition);
      pos.col = this.player.col + 2;
      pos.row = this.player.row + 2;
      const tc = this.world.must(entity, CowTypeComp);
      ok(
        `Vaca spawned: ${tc.cowType.id} em (${pos.col.toFixed(1)}, ${pos.row.toFixed(1)})`,
      );
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
      if (isNaN(amount) || amount < 0) {
        err("Uso: /setcoins <amount>");
        return;
      }
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
        if (!username || isNaN(amount)) {
          err("Uso: /give <amount> ou /give <username> <amount>");
          return;
        }
        fetch("/admin/cmd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: this.myToken,
            command: "give_coins",
            username,
            amount,
          }),
        })
          .then((r) => r.json())
          .then((d: { ok?: boolean; error?: string }) => {
            if (d.ok) {
              this.adminCmdResult = `✅ +${amount} coins → ${username}`;
              this.adminCmdResultTimer = 3;
            } else {
              this.adminCmdResult = `❌ ${d.error ?? "Erro"}`;
              this.adminCmdResultTimer = 3;
            }
          })
          .catch(() => {
            this.adminCmdResult = "❌ Erro de conexão";
            this.adminCmdResultTimer = 3;
          });
        ok(`Enviando ${amount} coins para ${username}...`);
      }
    } else if (cmd === "kick") {
      const username = parts.slice(1).join(" ");
      if (!username) {
        err("Uso: /kick <username>");
        return;
      }
      fetch("/admin/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.myToken,
          command: "kick",
          username,
        }),
      })
        .then((r) => r.json())
        .then((d: { ok?: boolean; error?: string }) => {
          if (d.ok) {
            this.adminCmdResult = `✅ ${username} kickado`;
            this.adminCmdResultTimer = 3;
          } else {
            this.adminCmdResult = `❌ ${d.error ?? "Erro"}`;
            this.adminCmdResultTimer = 3;
          }
        })
        .catch(() => {
          this.adminCmdResult = "❌ Erro de conexão";
          this.adminCmdResultTimer = 3;
        });
      ok(`Kickando ${username}...`);
    } else if (cmd === "broadcast" || cmd === "bc") {
      const text = parts.slice(1).join(" ");
      if (!text) {
        err("Uso: /broadcast <mensagem>");
        return;
      }
      fetch("/admin/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.myToken,
          command: "broadcast",
          text,
        }),
      })
        .then((r) => r.json())
        .then((d: { ok?: boolean; error?: string }) => {
          if (d.ok) {
            this.adminCmdResult = "✅ Broadcast enviado";
            this.adminCmdResultTimer = 3;
          } else {
            this.adminCmdResult = `❌ ${d.error ?? "Erro"}`;
            this.adminCmdResultTimer = 3;
          }
        })
        .catch(() => {
          this.adminCmdResult = "❌ Erro de conexão";
          this.adminCmdResultTimer = 3;
        });
      ok("Enviando broadcast...");
    } else if (cmd === "players") {
      const names = this.world
        .query(RemotePlayerData)
        .map(([, d]) => d.name)
        .join(", ");
      ok(`Online: ${names || "nenhum outro jogador"}`);
    } else if (cmd === "clearbase") {
      const based = this.world
        .query(EcsPosition, CowAI)
        .filter(([, , ai]) => ai.state === "based");
      for (const [e] of based) this.world.destroy(e);
      this.basedCount = 0;
      ok(`Base limpa: ${based.length} vacas removidas`);
    } else if (cmd === "pos") {
      ok(
        `Posição: col=${this.player.col.toFixed(2)}, row=${this.player.row.toFixed(2)}`,
      );
    } else if (cmd === "help") {
      ok(
        "/tp /spawn /godmode /time /setcoins /give /kick /broadcast /players /clearbase /pos /event",
      );
    } else if (cmd === "event") {
      const sub = (parts[1] ?? "").toLowerCase();
      if (sub === "list") {
        ok(`Eventos ativos: ${this.isBirthdayActive ? "birthday" : "nenhum"}`);
      } else if (sub === "birthday") {
        const state = (parts[2] ?? "").toLowerCase();
        if (state === "on") {
          this.birthdayForceState = "on";
          ok("Evento birthday: ON");
        } else if (state === "off") {
          this.birthdayForceState = "off";
          ok("Evento birthday: OFF");
        } else {
          err("Uso: /event birthday on|off");
        }
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
    const randomMsg =
      PARABENS_MESSAGES[Math.floor(Math.random() * PARABENS_MESSAGES.length)]!;
    const fullMsg = `🎂 ${this.myName} deseja: Feliz Aniversário ao criador! ${randomMsg}`;
    this.network?.sendChat(fullMsg);
    this.network?.sendBirthdayParabens();
    this.birthdayDialogOpen = false;
    this.spawnBirthdayConfetti();
  }

  private spawnBirthdayConfetti() {
    const W = this.canvas.width,
      H = this.canvas.height;
    const colors = [
      "#FF6B6B",
      "#FFD700",
      "#6BCB77",
      "#4D96FF",
      "#FF6BD6",
      "#FFA07A",
      "#C77DFF",
      "#00F5D4",
    ];
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
    drawBirthdayCake({
      ctx: this.ctx,
      cakeCol: CAKE_COL,
      cakeRow: CAKE_ROW,
      camX: this.camX,
      camY: this.camY,
      cakeBobbingTimer: this.cakeBobbingTimer,
      birthdayParabensCount: this.birthdayParabensCount,
      atCake: this.isAtCake(),
    });
  }

  private renderBirthdayParticles() {
    renderBirthdayParticles(this.ctx, this.birthdayParticles);
  }

  private renderEventPopup(W: number, H: number) {
    if (this.isPreview || this.eventPopupDismissed || !this.isBirthdayActive)
      return;
    renderEventPopup({
      ctx: this.ctx,
      canvas: { width: W, height: H },
      eventPopupTimer: this.eventPopupTimer,
    });
  }

  private renderStarterPackPopup(W: number, H: number) {
    if (this.isPreview || this.starterPackDismissed) return;
    const btns = renderStarterPackPopup({
      ctx: this.ctx,
      canvas: { width: W, height: H },
    });
    this.starterPackBuyBtn = btns.buyBtn;
    this.starterPackCloseBtn = btns.closeBtn;
  }

  private renderBirthdayDialog(W: number, H: number) {
    if (!this.birthdayDialogOpen) return;
    const btns = renderBirthdayDialog({
      ctx: this.ctx,
      canvas: { width: W, height: H },
      birthdaySentParabens: this.birthdaySentParabens,
    });
    this.birthdayConfirmBtn = btns.confirmBtn;
    this.birthdayCloseBtn = btns.closeBtn;
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

    // Starter pack popup
    if (!this.starterPackDismissed) {
      const bb = this.starterPackBuyBtn;
      if (
        bb.w > 0 &&
        x >= bb.x &&
        x <= bb.x + bb.w &&
        y >= bb.y &&
        y <= bb.y + bb.h
      ) {
        this.starterPackDismissed = true;
        localStorage.setItem("cowboy_starter_v1", "1");
        void buyPremium(this.myToken);
        return;
      }
      const scb = this.starterPackCloseBtn;
      if (
        scb.w > 0 &&
        x >= scb.x &&
        x <= scb.x + scb.w &&
        y >= scb.y &&
        y <= scb.y + scb.h
      ) {
        this.starterPackDismissed = true;
        localStorage.setItem("cowboy_starter_v1", "1");
        return;
      }
      return; // swallow clicks while popup is open
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
      if (
        cb.w > 0 &&
        x >= cb.x &&
        x <= cb.x + cb.w &&
        y >= cb.y &&
        y <= cb.y + cb.h
      ) {
        this.birthdayDialogOpen = false;
        return;
      }
      const conf = this.birthdayConfirmBtn;
      if (
        conf.w > 0 &&
        x >= conf.x &&
        x <= conf.x + conf.w &&
        y >= conf.y &&
        y <= conf.y + conf.h
      ) {
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
        if (
          x >= btn.x &&
          x <= btn.x + btn.w &&
          y >= btn.y &&
          y <= btn.y + btn.h
        ) {
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
    for (const [entity, pos, ai] of this.world.query(EcsPosition, CowAI)) {
      if (ai.state !== "wandering") continue;
      const s = this.isoToScreen(pos.col, pos.row);
      if (
        Math.hypot(x - s.x, y - (s.y - 12)) < 34 &&
        Math.hypot(pos.col - this.player.col, pos.row - this.player.row) <=
          this.effectiveCaptureRange
      ) {
        if (this.herdCows().length >= this.effectiveHerdCapacity) return;
        this.startLasso(entity);
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
    const nearBanditEntry = this.world
      .query(EcsPosition, BanditAI)
      .find(
        ([, pos, ai]) =>
          ai.state === "fleeing" && dist(this.player, pos) <= 3.5,
      );
    if (nearBanditEntry) {
      const [, , ai] = nearBanditEntry;
      if (ai.targetCowEntity !== null) {
        const cowAI = this.world.get(ai.targetCowEntity, CowAI);
        if (cowAI) cowAI.state = "wandering";
        ai.targetCowEntity = null;
      }
      ai.state = "scared";
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
    const cowEntity = this.nearestWanderingCow();
    if (
      cowEntity !== null &&
      this.herdCows().length < this.effectiveHerdCapacity
    )
      this.startLasso(cowEntity);
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
      for (const [entity, , ai, tc] of this.world.query(
        EcsPosition,
        CowAI,
        CowTypeComp,
      )) {
        if (
          tc.cowType.nightOnly &&
          (ai.state === "wandering" || ai.state === "fleeing")
        ) {
          this.world.destroy(entity);
        }
      }
    }
    if (!this.prevIsNight && nowNight) {
      // Dusk: spawn a burst of 3 night cows immediately
      for (let i = 0; i < 3; i++) {
        this.spawnCowEntity(this.nextCowId++, true);
      }
    }
    if (nowNight !== this.prevIsNight) this.onPeriodChange();
    this.prevIsNight = nowNight;

    // Respawn de vacas a cada 45-75s, sem ultrapassar COW_COUNT ativas
    this.cowSpawnTimer -= dt;
    if (this.cowSpawnTimer <= 0) {
      const active = this.world
        .query(CowAI)
        .filter(
          ([, ai]) =>
            ai.state === "wandering" ||
            ai.state === "fleeing" ||
            ai.state === "herd",
        ).length;
      if (active < COW_COUNT) {
        this.spawnCowEntity(this.nextCowId++);
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
    const basedCowTypes = this.basedCows()
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
    const basedCowTypes = this.basedCows().map((c) => c.type.id);
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

  private updateHerd(_dt: number) {
    /* now handled by CowAISystem */
  }

  private updateCows(dt: number) {
    this.cowAISystem.update(this.world, dt, {
      map: this.map,
      playerCol: this.player.col,
      playerRow: this.player.row,
      lassoActive: this.lasso.active,
      lassoTargetEntity: this.lasso.cowEntity ?? null,
      herdCapacity: this.effectiveHerdCapacity,
      isNight: this.isNight,
    });
  }

  private updateLasso(dt: number) {
    const l = this.lasso;
    if (l.cowEntity === null || !this.world.isAlive(l.cowEntity)) {
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
      const clicksNeeded = this.world.must(l.cowEntity, CowTypeComp).cowType
        .clicksNeeded;
      if (l.clickCount >= this.effectiveLassoClicks(clicksNeeded)) {
        this.captureCow(l.cowEntity);
        l.active = false;
        return;
      }
      if (l.timeLeft <= 0) {
        if (this.adminGodMode) {
          this.captureCow(l.cowEntity);
          l.active = false;
        } else {
          l.phase = "fail";
          this.world.must(l.cowEntity, CowAI).state = "fleeing";
          setTimeout(() => {
            this.lasso.active = false;
          }, 700);
        }
      }
    }
  }

  private captureCow(entity: Entity) {
    const herdLen = this.herdCows().length;
    const pos = this.world.must(entity, EcsPosition);
    const ai = this.world.must(entity, CowAI);
    const tc = this.world.must(entity, CowTypeComp);
    ai.state = "herd";
    ai.herdIndex = herdLen;
    pos.col = this.player.col;
    pos.row = this.player.row;
    ai.sparkTimer = 1.5;
    this.discovered.add(tc.cowType.id);
    this.capturedByType.set(
      tc.cowType.id,
      (this.capturedByType.get(tc.cowType.id) ?? 0) + 1,
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
      const slotPos = basedSlotPos(startIdx + i);
      cow.col = slotPos.col;
      cow.row = slotPos.row;
      // Respawn gerenciado pelo cowSpawnTimer no update loop
    }
    // Notifica outros jogadores (multiplayer visual)
    this.network?.sendCowBased(herd.map((c) => c.type.id));
    // Salva imediatamente — não espera o timer de 60s
    this.triggerSave();
  }

  private startLasso(entity: Entity) {
    const ai = this.world.must(entity, CowAI);
    const tc = this.world.must(entity, CowTypeComp);
    ai.state = "lassoed" as never;
    this.discovered.add(tc.cowType.id);
    this.lasso = {
      active: true,
      cowEntity: entity,
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
    return (
      m === BIRTHDAY_MONTH && d >= BIRTHDAY_DAY_START && d <= BIRTHDAY_DAY_END
    );
  }

  private isAtCake(): boolean {
    return (
      dist(this.player, { col: CAKE_COL, row: CAKE_ROW }) <= CAKE_INTERACT_DIST
    );
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

  private sellCow(cow: Cow & { _entity?: Entity }) {
    const price = COW_SELL_PRICES[cow.type.rarity] ?? 10;
    this.coins += price;
    this.saveCoinsLocally();
    if (cow._entity !== undefined) {
      this.world.destroy(cow._entity);
    }
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
      if (cow._entity !== undefined) this.world.destroy(cow._entity);
    }
    this.saveCoinsLocally();
    this.triggerSave();
  }

  private sellBasedCow(cow: Cow & { _entity?: Entity }) {
    this.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
    this.saveCoinsLocally();
    if (cow._entity !== undefined) this.world.destroy(cow._entity);
    this.basedCount = Math.max(0, this.basedCount - 1);
    // Reindexar e reposicionar vacas restantes no curral
    this.basedCows()
      .sort((a, b) => a.herdIndex - b.herdIndex)
      .forEach((c, i) => {
        c.herdIndex = i;
        const slotPos = basedSlotPos(i);
        c.col = slotPos.col;
        c.row = slotPos.row;
      });
    this.triggerSave();
  }

  private sellAllBasedCows() {
    const based = this.basedCows();
    if (based.length === 0) return;
    for (const cow of based) {
      this.coins += COW_SELL_PRICES[cow.type.rarity] ?? 10;
      if (cow._entity !== undefined) this.world.destroy(cow._entity);
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

  private herdCows(): (Cow & { _entity: Entity })[] {
    return this.world
      .query(EcsPosition, CowAI)
      .filter(([, , ai]) => ai.state === "herd")
      .sort((a, b) => a[2].herdIndex - b[2].herdIndex)
      .map(([e]) => this.cowCompat(e));
  }

  private basedCows(): (Cow & { _entity: Entity })[] {
    return this.world
      .query(EcsPosition, CowAI)
      .filter(([, , ai]) => ai.state === "based")
      .map(([e]) => this.cowCompat(e));
  }

  // Creates or updates a remote player entity in the ECS world
  private _spawnRemotePlayer(p: RemotePlayer): void {
    // Destroy old entity if re-joining with same id
    const existing = this.remotePlayerEntities.get(p.id);
    if (existing !== undefined) this.world.destroy(existing);

    const entity = this.world.create();
    const data = new RemotePlayerData();
    data.dirCol = p.dirCol;
    data.dirRow = p.dirRow;
    data.moving = p.moving;
    data.color = p.color;
    data.name = p.name;
    data.herdCount = p.herdCount;
    data.lastMessage = p.lastMessage;
    data.lastMessageTime = p.lastMessageTime;

    this.world.add(entity, new EcsPosition(p.col, p.row));
    this.world.add(entity, new NetworkId(p.id));
    this.world.add(entity, data);
    this.remotePlayerEntities.set(p.id, entity);
  }

  // Creates a cow entity in the ECS world
  private spawnCowEntity(id: number, nightMode = false): Entity {
    const rawCow = spawnCow(id, this.map, nightMode);
    const entity = this.world.create();
    const ai = new CowAI();
    ai.state = rawCow.state as CowAI["state"];
    ai.wanderTimer = rawCow.wanderTimer;
    ai.wanderDirCol = rawCow.wanderDirCol;
    ai.wanderDirRow = rawCow.wanderDirRow;
    ai.herdIndex = rawCow.herdIndex;
    ai.sparkTimer = rawCow.sparkTimer;
    this.world
      .add(entity, new EcsPosition(rawCow.col, rawCow.row))
      .add(entity, new LegacyId(id))
      .add(entity, ai)
      .add(entity, new CowTypeComp(rawCow.type));
    return entity;
  }

  // Creates a based cow entity from direct position (for restoring saved cows)
  private addBasedCowEntity(
    id: number,
    col: number,
    row: number,
    typeId: string,
  ): Entity {
    const cowType = COW_TYPES.find((t) => t.id === typeId) ?? COW_TYPES[0]!;
    const entity = this.world.create();
    const ai = new CowAI();
    ai.state = "based";
    ai.herdIndex = id - COW_COUNT; // slot index
    this.world
      .add(entity, new EcsPosition(col, row))
      .add(entity, new LegacyId(id))
      .add(entity, ai)
      .add(entity, new CowTypeComp(cowType))
      .add(entity, new BasedTag());
    return entity;
  }

  // Returns a Bandit-compatible object that reads/writes ECS components
  private banditCompat(entity: Entity): Bandit & { _entity: Entity } {
    const pos = this.world.must(entity, EcsPosition);
    const ai = this.world.must(entity, BanditAI);
    const world = this.world;
    const cowCompatFn = this.cowCompat.bind(this);
    return {
      id: entity,
      get col() {
        return pos.col;
      },
      set col(v: number) {
        pos.col = v;
      },
      get row() {
        return pos.row;
      },
      set row(v: number) {
        pos.row = v;
      },
      get fleeCol() {
        return ai.fleeCol;
      },
      set fleeCol(v: number) {
        ai.fleeCol = v;
      },
      get fleeRow() {
        return ai.fleeRow;
      },
      set fleeRow(v: number) {
        ai.fleeRow = v;
      },
      get state() {
        return ai.state as Bandit["state"];
      },
      set state(v: Bandit["state"]) {
        ai.state = v;
      },
      get targetCow() {
        if (ai.targetCowEntity === null || !world.isAlive(ai.targetCowEntity))
          return null;
        return cowCompatFn(ai.targetCowEntity);
      },
      set targetCow(v: Cow | null) {
        ai.targetCowEntity =
          (v as (Cow & { _entity?: Entity }) | null)?._entity ?? null;
      },
      _entity: entity,
    };
  }

  // Returns a Cow-compatible object that reads/writes ECS components
  private cowCompat(entity: Entity): Cow & { _entity: Entity } {
    const pos = this.world.must(entity, EcsPosition);
    const ai = this.world.must(entity, CowAI);
    const tc = this.world.must(entity, CowTypeComp);
    const lid = this.world.must(entity, LegacyId);
    return {
      id: lid.id,
      get col() {
        return pos.col;
      },
      set col(v: number) {
        pos.col = v;
      },
      get row() {
        return pos.row;
      },
      set row(v: number) {
        pos.row = v;
      },
      get state() {
        return ai.state as CowState;
      },
      set state(v: CowState) {
        ai.state = v as never;
      },
      get type() {
        return tc.cowType;
      },
      get wanderTimer() {
        return ai.wanderTimer;
      },
      set wanderTimer(v: number) {
        ai.wanderTimer = v;
      },
      get wanderDirCol() {
        return ai.wanderDirCol;
      },
      set wanderDirCol(v: number) {
        ai.wanderDirCol = v;
      },
      get wanderDirRow() {
        return ai.wanderDirRow;
      },
      set wanderDirRow(v: number) {
        ai.wanderDirRow = v;
      },
      get herdIndex() {
        return ai.herdIndex;
      },
      set herdIndex(v: number) {
        ai.herdIndex = v;
      },
      get sparkTimer() {
        return ai.sparkTimer;
      },
      set sparkTimer(v: number) {
        ai.sparkTimer = v;
      },
      _entity: entity,
    };
  }

  private remotePlayerCompat(
    entity: Entity,
  ): RemotePlayer & { _entity: Entity } {
    const pos = this.world.must(entity, EcsPosition);
    const data = this.world.must(entity, RemotePlayerData);
    const nid = this.world.must(entity, NetworkId);
    return {
      id: nid.id,
      get col() {
        return pos.col;
      },
      set col(v: number) {
        pos.col = v;
      },
      get row() {
        return pos.row;
      },
      set row(v: number) {
        pos.row = v;
      },
      get dirCol() {
        return data.dirCol;
      },
      set dirCol(v: number) {
        data.dirCol = v;
      },
      get dirRow() {
        return data.dirRow;
      },
      set dirRow(v: number) {
        data.dirRow = v;
      },
      get moving() {
        return data.moving;
      },
      set moving(v: boolean) {
        data.moving = v;
      },
      get color() {
        return data.color;
      },
      set color(v: string) {
        data.color = v;
      },
      get name() {
        return data.name;
      },
      set name(v: string) {
        data.name = v;
      },
      get herdCount() {
        return data.herdCount;
      },
      set herdCount(v: number) {
        data.herdCount = v;
      },
      get lastMessage() {
        return data.lastMessage;
      },
      set lastMessage(v: string | undefined) {
        data.lastMessage = v;
      },
      get lastMessageTime() {
        return data.lastMessageTime;
      },
      set lastMessageTime(v: number | undefined) {
        data.lastMessageTime = v;
      },
      _entity: entity,
    };
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

  private nearestWanderingCow(): Entity | null {
    return CowAISystem.nearestWandering(
      this.world,
      this.player.col,
      this.player.row,
      this.effectiveCaptureRange,
    );
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
    if (current === 0 && this.inventorySlotCount() >= MAX_INVENTORY_SLOTS)
      return 0; // sem slot livre
    const gained = Math.min(amount, maxStack - current);
    if (gained > 0) this.inventory.set(id, current + gained);
    return gained;
  }

  private nearestBoulder(): { col: number; row: number } | null {
    const pc = this.player.col,
      pr = this.player.row;
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
    const drop =
      STONE_DROP_MIN +
      Math.floor(Math.random() * (STONE_DROP_MAX - STONE_DROP_MIN + 1));
    this.addResource("stone", drop, STONE_MAX_STACK);
    this.chopFlash = 0.2;
  }

  private startChop(col: number, row: number) {
    this.chop = {
      active: true,
      col,
      row,
      clickCount: 0,
      timeLeft: CHOP_TIME_LIMIT,
      flashTimer: 0,
    };
  }

  private updateChop(dt: number) {
    if (!this.chop.active) return;
    this.chop.timeLeft -= dt;
    if (this.chop.flashTimer > 0) this.chop.flashTimer -= dt;
    if (this.chop.clickCount >= CHOP_CLICKS_NEEDED) {
      // Sucesso
      const drop =
        WOOD_DROP_MIN +
        Math.floor(Math.random() * (WOOD_DROP_MAX - WOOD_DROP_MIN + 1));
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
    if (!this.hasMachado() && this.inventorySlotCount() >= MAX_INVENTORY_SLOTS)
      return;
    this.inventory.set("stone", stone - 5);
    if ((this.inventory.get("stone") ?? 0) === 0)
      this.inventory.delete("stone");
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
      const W = cv.width,
        H = cv.height;
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
      ctx.fillText(
        `Cortando... ${this.chop.clickCount}/${CHOP_CLICKS_NEEDED}`,
        W / 2 + 2,
        by - 8,
      );
      // barra
      ctx.fillStyle = "#2a1a08";
      ctx.fillRect(bx, by, barW, 18);
      const fillColor =
        progress > 0.7 ? "#4caf50" : progress > 0.4 ? "#ff9800" : "#f44336";
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

  // ─── Panel — draws a clean pixel-art wood frame (canvas-only, no sprites) ──
  // Style variants: 0=warm brown, 1=darker brown, 2=grey-green, 3=olive
  private drawPanel(x: number, y: number, w: number, h: number, style = 0) {
    drawPanel(this.ctx, x, y, w, h, style);
  }

  // ─── Button — craftpix-style wood pixel-art button ────────────────────────
  // Three states:  normal (raised dark wood) | active (amber lit) | pressed (sunken)
  private drawPixelBtn(
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    state: "normal" | "active" | "pressed" = "normal",
    _wide = false,
  ) {
    drawPixelBtn(this.ctx, dx, dy, dw, dh, state, _wide);
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

  private _mapCtx(): import("./ui/MapRenderer").MapCtx {
    return {
      ctx: this.ctx,
      time: this.time,
      map: this.map,
      visibleRange: this.visibleTileRange(),
      isoToScreen: this.isoToScreen.bind(this),
    };
  }

  private renderMap() {
    this.mapRenderer.renderMap(this._mapCtx());
  }

  private renderFence() {
    this.mapRenderer.renderFence(this._mapCtx());
  }

  private drawDecoration(col: number, row: number, deco: Tile["decoration"]) {
    this.mapRenderer.drawDecoration(col, row, deco, this._mapCtx());
  }

  private drawStump(col: number, row: number) {
    this.mapRenderer.drawStump(col, row, this._mapCtx());
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

    for (const [entity] of this.world.query(EcsPosition, CowAI, CowTypeComp)) {
      const c = this.cowCompat(entity);
      items.push({
        depth: c.col + c.row + (c.state === "based" ? -100 : 0),
        draw: () => this.drawCow(c),
      });
    }

    // Jogadores remotos + rebanho deles (depth sorted separadamente)
    for (const [entity] of this.world.query(
      EcsPosition,
      RemotePlayerData,
      NetworkId,
    )) {
      const r = this.remotePlayerCompat(entity);
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
    // dc > 0 = east, dc < 0 = west
    // dr > 0 = south, dr < 0 = north
    if (dc > 0 && dr < 0) return "north-east";
    if (dc > 0 && dr === 0) return "east";
    if (dc > 0 && dr > 0) return "south-east";
    if (dc === 0 && dr > 0) return "south";
    if (dc < 0 && dr > 0) return "south-west";
    if (dc < 0 && dr === 0) return "west";
    if (dc < 0 && dr < 0) return "north-west";
    if (dc === 0 && dr < 0) return "north";
    return "north"; // fallback
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
    this.cowRenderer.drawRemotePlayer({
      ctx: this.ctx,
      rp,
      time: this.time,
      isoToScreen: (col, row) => this.isoToScreen(col, row),
      getSpriteDir: (dc, dr) => this.getSpriteDir(dc, dr),
    });
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
    this.cowRenderer.drawRemoteBasedCow({
      ctx: this.ctx,
      col,
      row,
      color,
      baseAlpha,
      bob,
      isoToScreen: (c, r) => this.isoToScreen(c, r),
    });
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
      const nearestEntity = this.nearestWanderingCow();
      if (nearestEntity !== null) {
        const nearestPos = this.world.must(nearestEntity, EcsPosition);
        const d = dist(this.player, nearestPos);
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
    this.cowRenderer.drawCow({
      ctx: this.ctx,
      cow,
      time: this.time,
      nightFade: this.nightFade,
      eyeIcon: this.icons.eyeIcon,
      isoToScreen: (col, row) => this.isoToScreen(col, row),
      playerPos: this.player,
      dist,
      captureDistFearThreshold: CAPTURE_DIST,
    });
  }

  // ─── Lasso ────────────────────────────────────────────────────────────────

  private renderLasso() {
    if (
      !this.lasso.active ||
      this.lasso.cowEntity === null ||
      !this.world.isAlive(this.lasso.cowEntity)
    )
      return;
    const { ctx, lasso: l } = this;
    const cowPos = this.world.must(l.cowEntity!, EcsPosition);
    const ps = this.isoToScreen(this.player.col, this.player.row);
    const cs = this.isoToScreen(cowPos.col, cowPos.row);
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
    renderNightOverlay(
      this.ctx,
      this.canvas,
      this.timePeriod,
      this.nightFade,
      this.time,
    );
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

    // Starter pack popup (uma vez por usuário)
    if (!this.starterPackDismissed) this.renderStarterPackPopup(W, H);
  }

  // ── Admin overlay ─────────────────────────────────────────────────────────

  private renderAdminOverlay(W: number, H: number) {
    renderAdminOverlay({
      ctx: this.ctx,
      canvas: { width: W, height: H },
      adminGodMode: this.adminGodMode,
      adminForcePeriod: this.adminForcePeriod,
      adminCmdResult: this.adminCmdResult,
      adminCmdResultTimer: this.adminCmdResultTimer,
      adminCmdOpen: this.adminCmdOpen,
      shopOpen: this.shopOpen,
      bookOpen: this.bookOpen,
      inventoryOpen: this.inventoryOpen,
    });
  }

  // ── Painel de stats (top-left) ────────────────────────────────────────────

  private renderStatsPanel() {
    renderStatsPanel({
      ctx: this.ctx,
      statsMinimized: this.statsMinimized,
      myColor: this.myColor,
      myName: this.myName,
      herdCount: this.herdCows().length,
      basedCount: this.basedCount,
      wanderingCount: this.world
        .query(CowAI)
        .filter(([, ai]) => ai.state === "wandering" || ai.state === "fleeing")
        .length,
      timePeriod: this.timePeriod,
      nightFade: this.nightFade,
      coins: this.coins,
      moneyIcon: this.icons.moneyIcon,
      leiteTimer: this.leiteTimer,
      time: this.time,
      hasOwnedItems: SHOP_ITEMS.some(
        (it) => (this.inventory.get(it.id) ?? 0) > 0,
      ),
    });
  }

  // ── Painel de jogadores online (top-left, abaixo do stats) ──────────────

  private renderOnlinePanel(W: number, _H: number) {
    const players = [
      { color: this.myColor, name: this.myName + " (você)", isMe: true },
      ...this.world.query(RemotePlayerData, NetworkId).map(([, data]) => ({
        color: data.color,
        name: data.name,
        isMe: false,
      })),
    ];
    renderOnlinePanel({
      ctx: this.ctx,
      statsMinimized: this.statsMinimized,
      players,
    });
  }

  // ── Chat (bottom-left) ────────────────────────────────────────────────────

  private renderChat(W: number, H: number) {
    this.chatHistoryScroll = renderChat({
      ctx: this.ctx,
      canvas: { width: W, height: H },
      chatOpen: this.chatOpen,
      chatMessages: this.chatMessages,
      chatHistoryScroll: this.chatHistoryScroll,
    });
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
    const out: InventoryCtx["out"] = {
      inventoryCloseBtn: { x: 0, y: 0, r: 0 },
      inventoryContentArea: { x: 0, y: 0, w: 0, h: 0 },
      inventoryScroll: this.inventoryScroll,
      inventoryDropBtns: [],
      inventoryTradeBtns: [],
      inventoryPlaceBtns: [],
      inventoryUseBtns: [],
      tradeAcceptBtn: { x: 0, y: 0, w: 0, h: 0 },
      tradeDeclineBtn: { x: 0, y: 0, w: 0, h: 0 },
      tradeCancelBtn: { x: 0, y: 0, w: 0, h: 0 },
      tradePlayerBtns: [],
    };
    const onlinePlayers = this.world
      .query(EcsPosition, RemotePlayerData, NetworkId)
      .map(([entity]) => this.remotePlayerCompat(entity));
    this.inventoryRenderer.render({
      ctx: this.ctx,
      canvas: { width: W, height: H },
      inventory: this.inventory,
      inventoryScroll: this.inventoryScroll,
      itemIcons: this.itemIcons,
      leiteTimer: this.leiteTimer,
      time: this.time,
      tradeState: this.tradeState,
      tradeIncoming: this.tradeIncoming,
      tradeItem: this.tradeItem,
      tradeResultMsg: this.tradeResultMsg,
      onlinePlayers,
      icons: { trunkIcon: this.icons.trunkIcon, axeIcon: this.icons.axeIcon },
      wrapTextLines: this.wrapTextLines.bind(this),
      inventorySlotCount: this.inventorySlotCount.bind(this),
      out,
    });
    // Read back hitboxes and state
    this.inventoryCloseBtn = out.inventoryCloseBtn;
    this.inventoryContentArea = out.inventoryContentArea;
    this.inventoryScroll = out.inventoryScroll;
    this.inventoryDropBtns =
      out.inventoryDropBtns as typeof this.inventoryDropBtns;
    this.inventoryTradeBtns =
      out.inventoryTradeBtns as typeof this.inventoryTradeBtns;
    this.inventoryPlaceBtns =
      out.inventoryPlaceBtns as typeof this.inventoryPlaceBtns;
    this.inventoryUseBtns =
      out.inventoryUseBtns as typeof this.inventoryUseBtns;
    this.tradeAcceptBtn = out.tradeAcceptBtn;
    this.tradeDeclineBtn = out.tradeDeclineBtn;
    this.tradeCancelBtn = out.tradeCancelBtn;
    this.tradePlayerBtns = out.tradePlayerBtns;
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

    const nearestEntity = this.nearestWanderingCow();
    const nearestPos =
      nearestEntity !== null
        ? this.world.get(nearestEntity, EcsPosition)
        : null;
    const atBase = this.isAtBase(),
      hasHerd = this.herdCows().length > 0;
    const atVendor = this.isAtVendor();
    let hint = "";
    const isMobile = W < 600;
    if (atVendor && !this.shopOpen)
      hint = isMobile
        ? "Botão: Abrir Loja!"
        : "Pressione E / botão para abrir a LOJA!";
    else if (atBase && hasHerd)
      hint = isMobile
        ? "Botão: Depositar na base!"
        : "Pressione E / botão para DEPOSITAR na base!";
    else if (this.isBirthdayActive && this.isAtCake())
      hint = isMobile
        ? "🎂 Botão: Interagir com o bolo!"
        : "🎂 Pressione E para interagir com o BOLO DE ANIVERSÁRIO!";
    else if (nearestPos && dist(this.player, nearestPos) <= CAPTURE_DIST)
      hint = isMobile
        ? "Botão: Laçar vaca!"
        : "Pressione E / botão para LAÇAR a vaca!";

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
    const basedEntry = this.world
      .query(EcsPosition, CowAI)
      .find(([, , ai]) => ai.state === "based");
    const wanderingEntry = this.world
      .query(EcsPosition, CowAI)
      .find(([, , ai]) => ai.state === "wandering");
    const entry = basedEntry ?? wanderingEntry;
    if (!entry) {
      console.warn("[bandit] sem vaca alvo");
      return;
    }
    const [, targetPos] = entry;
    // Spawn close to target cow, just slightly away
    const spawnCol = targetPos.col + 8;
    const spawnRow = targetPos.row + 8;
    const fleeCol = MAP_COLS - 2;
    const fleeRow = MAP_ROWS - 2;
    const banditEntity = this.world.create();
    const banditAI = new BanditAI();
    banditAI.state = "approaching";
    banditAI.fleeCol = fleeCol;
    banditAI.fleeRow = fleeRow;
    banditAI.targetCowEntity = entry[0];
    this.world
      .add(banditEntity, new EcsPosition(spawnCol, spawnRow))
      .add(banditEntity, banditAI);
  }

  private spawnBandit() {
    const basedEntries = this.world
      .query(EcsPosition, CowAI)
      .filter(([, , ai]) => ai.state === "based");
    const wanderingEntries =
      basedEntries.length > 0
        ? basedEntries
        : this.world
            .query(EcsPosition, CowAI)
            .filter(
              ([, , ai]) => ai.state === "wandering" || ai.state === "fleeing",
            );
    if (wanderingEntries.length === 0) return;
    const targetEntry =
      wanderingEntries[Math.floor(Math.random() * wanderingEntries.length)]!;
    const target = this.cowCompat(targetEntry[0]);

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

    const banditEntity = this.world.create();
    const banditAI = new BanditAI();
    banditAI.state = "approaching";
    banditAI.fleeCol = fleeCol;
    banditAI.fleeRow = fleeRow;
    banditAI.targetCowEntity = targetEntry[0];
    this.world
      .add(banditEntity, new EcsPosition(spawn.col, spawn.row))
      .add(banditEntity, banditAI);
  }

  private updateBandits(dt: number) {
    const period = this.timePeriod;

    // Advance bandit animation (always, not only during tug)
    this.banditAnimTimer += dt;
    if (this.banditAnimTimer >= 0.12) {
      this.banditAnimTimer = 0;
      this.banditAnimFrame++;
    }

    const toDestroy: Entity[] = [];

    // Auto-scare: player próximo de bandido em fuga
    for (const [entity, pos, ai] of this.world.query(EcsPosition, BanditAI)) {
      if (ai.state === "fleeing" && dist(this.player, pos) <= 2.5) {
        if (ai.targetCowEntity !== null) {
          const cowAI = this.world.get(ai.targetCowEntity, CowAI);
          if (cowAI) cowAI.state = "wandering";
          ai.targetCowEntity = null;
        }
        ai.state = "scared";
        ai.fleeCol = pos.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
        ai.fleeRow = pos.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;
      }
    }

    // Atualiza cada bandido
    for (const [entity, pos, ai] of this.world.query(EcsPosition, BanditAI)) {
      if (ai.state === "approaching") {
        const cowEntity = ai.targetCowEntity;
        const cowAI =
          cowEntity !== null ? this.world.get(cowEntity, CowAI) : null;
        const cowPos =
          cowEntity !== null ? this.world.get(cowEntity, EcsPosition) : null;

        if (
          !cowAI ||
          !cowPos ||
          (cowAI.state !== "wandering" &&
            cowAI.state !== "fleeing" &&
            cowAI.state !== "based")
        ) {
          ai.state = "scared";
          ai.targetCowEntity = null;
          ai.fleeCol = pos.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
          ai.fleeRow = pos.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;
        } else {
          const dx = cowPos.col - pos.col;
          const dy = cowPos.row - pos.row;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1.2) {
            cowAI.state = "fleeing"; // marcada como "roubada" — sai do rebanho
            ai.state = "fleeing";
            ai.fleeCol = pos.col < MAP_COLS / 2 ? MAP_COLS - 2 : 1;
            ai.fleeRow = pos.row < MAP_ROWS / 2 ? MAP_ROWS - 2 : 1;
            this.discoveredNPCs.add("ladrao_culto");
          } else {
            pos.col += (dx / d) * BANDIT_APPROACH_SPEED * dt;
            pos.row += (dy / d) * BANDIT_APPROACH_SPEED * dt;
          }
        }
      } else if (ai.state === "fleeing") {
        const dx = ai.fleeCol - pos.col;
        const dy = ai.fleeRow - pos.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) {
          // Escapou — destrói o bandido e a vaca roubada
          if (ai.targetCowEntity !== null)
            this.world.destroy(ai.targetCowEntity);
          toDestroy.push(entity);
          continue;
        }
        const spd = BANDIT_FLEE_SPEED * dt;
        pos.col += (dx / d) * spd;
        pos.row += (dy / d) * spd;
        // Arrasta a vaca junto
        if (ai.targetCowEntity !== null) {
          const cowPos = this.world.get(ai.targetCowEntity, EcsPosition);
          if (cowPos) {
            cowPos.col = pos.col;
            cowPos.row = pos.row;
          }
        }
      } else if (ai.state === "scared") {
        const dx = ai.fleeCol - pos.col;
        const dy = ai.fleeRow - pos.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) {
          toDestroy.push(entity);
          continue;
        }
        pos.col += (dx / d) * BANDIT_SCARED_SPEED * dt;
        pos.row += (dy / d) * BANDIT_SCARED_SPEED * dt;
      }
    }

    for (const e of toDestroy) this.world.destroy(e);

    // Spawn timer
    if (
      this.BANDIT_ACTIVE_PERIODS.includes(period) &&
      this.world.query(BanditAI).length < 3
    ) {
      this.banditSpawnTimer -= dt;
      if (this.banditSpawnTimer <= 0) {
        this.spawnBandit();
        this.banditSpawnTimer = 120 + Math.random() * 60;
      }
    }
  }

  private renderBandits() {
    const bandits: BanditView[] = this.world
      .query(EcsPosition, BanditAI)
      .map(([entity]) => this.banditCompat(entity) as BanditView);
    const nearEntry = this.world
      .query(EcsPosition, BanditAI)
      .find(
        ([, pos, ai]) =>
          ai.state === "fleeing" && dist(this.player, pos) <= 4.5,
      );
    const nearFleeingBanditScreen = nearEntry
      ? this.isoToScreen(nearEntry[1].col, nearEntry[1].row)
      : null;
    this.banditRenderer.render({
      ctx: this.ctx,
      bandits,
      banditAnimFrame: this.banditAnimFrame,
      isoToScreen: (col, row) => this.isoToScreen(col, row),
      nearFleeingBanditScreen,
    });
  }

  private renderVendorDialog() {
    const vendorScreen = this.isoToScreen(VENDOR_COL, VENDOR_ROW);
    this.vendorRenderer.renderDialog({
      ctx: this.ctx,
      canvas: this.canvas,
      vendorDialog: {
        text: this.vendorDialog.text,
        displayed: this.vendorDialog.displayed,
        done: this.vendorDialog.done,
      },
      vendorScreenX: vendorScreen.x,
      vendorScreenY: vendorScreen.y,
      time: this.time,
    });
  }

  private renderMinigame() {
    const { lasso } = this;
    const needed =
      lasso.cowEntity !== null && this.world.isAlive(lasso.cowEntity)
        ? this.world.must(lasso.cowEntity, CowTypeComp).cowType.clicksNeeded
        : 15;
    this.vendorRenderer.renderMinigame({
      ctx: this.ctx,
      canvas: this.canvas,
      lasso: {
        cowEntity: lasso.cowEntity,
        phase: lasso.phase,
        clickCount: lasso.clickCount,
        timeLeft: lasso.timeLeft,
        flashTimer: lasso.flashTimer,
      },
      time: this.time,
      clicksNeeded: needed,
      drawPixelBtn: (x, y, w, h, state, wide) =>
        this.drawPixelBtn(x, y, w, h, state, wide),
    });
  }

  private renderMobileControls() {
    const mobileCtx: MobileCtx = {
      ctx: this.ctx,
      canvas: this.canvas,
      joystick: this.joystick,
      chop: this.chop,
      lasso: this.lasso,
      stake: this.stake,
      chatOpen: this.chatOpen,
      benchHubOpen: this.benchHubOpen,
      shopOpen: this.shopOpen,
      icons: this.icons,
      nearestWanderingCow: () => {
        const e = this.nearestWanderingCow();
        return e !== null ? this.world.get(e, EcsPosition) : null;
      },
      isAtBase: () => this.isAtBase(),
      isAtVendor: () => this.isAtVendor(),
      nearestBench: () => this.nearestBench(),
      nearestChoppableTree: () => this.nearestChoppableTree(),
      nearestBoulder: () => this.nearestBoulder(),
      herdCows: () => this.herdCows(),
      playerPos: this.player,
    };
    this.mobileControlsRenderer.render(mobileCtx);
  }

  // ─── Cowboy Book ──────────────────────────────────────────────────────────

  private renderBook() {
    this.bookRenderer.render({
      ctx: this.ctx,
      canvas: this.canvas,
      bookTab: this.bookTab,
      bookPage: this.bookPage,
      bookPageAnimT: this.bookPageAnimT,
      discovered: this.discovered,
      capturedByType: this.capturedByType,
      discoveredNPCs: this.discoveredNPCs,
      inventory: this.inventory,
      itemIcons: this.itemIcons,
    });
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
    const bench = this.activeBench!;
    const out = {
      benchCraftBtns: [] as Array<{
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }>,
      benchHubCloseBtn: { x: 0, y: 0, r: 0 },
      benchPickupBtn: { x: 0, y: 0, w: 0, h: 0 },
    };
    this.benchHubRenderer.render({
      ctx: this.ctx,
      canvas: this.canvas,
      bench: {
        type: bench.type,
        owner: bench.owner,
        ownerColor: bench.ownerColor,
      },
      isOwner: bench.owner === this.myName,
      stone: this.inventory.get("stone") ?? 0,
      coins: this.coins,
      machado: this.inventory.get("machado") ?? 0,
      axeIcon: this.icons.axeIcon,
      out,
    });
    this.benchCraftBtns = out.benchCraftBtns;
    this.benchHubCloseBtn = out.benchHubCloseBtn;
    this.benchPickupBtn = out.benchPickupBtn;
  }

  private renderShop() {
    const out: ShopCtx["out"] = {
      shopSellButtons: [],
      shopSellBasedButtons: [],
      shopTabBtns: [],
      shopCloseBtn: { x: 0, y: 0, r: 0 },
      shopBuyButtons: [],
      shopBuyContentArea: { x: 0, y: 0, w: 0, h: 0 },
      shopSellAllHerdBtn: { x: 0, y: 0, w: 0, h: 0 },
      shopSellAllBasedBtn: { x: 0, y: 0, w: 0, h: 0 },
    };
    this.shopRenderer.render({
      ctx: this.ctx,
      canvas: this.canvas,
      coins: this.coins,
      moneyIcon: this.icons.moneyIcon,
      shopTab: this.shopTab,
      shopBuyScroll: this.shopBuyScroll,
      inventory: this.inventory,
      itemIcons: this.itemIcons,
      herdCows: this.herdCows(),
      basedCows: this.basedCows().sort((a, b) => a.herdIndex - b.herdIndex),
      wrapTextLines: this.wrapTextLines.bind(this),
      out,
    });
    // Read back hitboxes
    this.shopSellButtons = out.shopSellButtons as typeof this.shopSellButtons;
    this.shopSellBasedButtons =
      out.shopSellBasedButtons as typeof this.shopSellBasedButtons;
    this.shopTabBtns = out.shopTabBtns;
    this.shopCloseBtn = out.shopCloseBtn;
    this.shopBuyButtons = out.shopBuyButtons as typeof this.shopBuyButtons;
    this.shopBuyContentArea = out.shopBuyContentArea;
    this.shopSellAllHerdBtn = out.shopSellAllHerdBtn;
    this.shopSellAllBasedBtn = out.shopSellAllBasedBtn;
  }

  private drawCowAt(x: number, y: number, t: CowType) {
    drawCowAt(this.ctx, x, y, t);
  }
}
