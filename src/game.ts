import { TILE_W, TILE_H, MAP_COLS, MAP_ROWS } from "./constants";
import { type Tile, generateMap } from "./mapGen";
import { sprites } from "./sprites";
import { SHOP_ITEMS } from "./items";
import {
  type ChatMessage,
  type PlacedObject,
} from "./network";
import { type UserData, saveGameState } from "./auth";
import { World, type Entity } from "./ecs/World";
import {
  Position as EcsPosition,
  CowAI,
  CowTypeComp,
  BasedTag,
  LegacyId,
  NetworkId,
  RemotePlayerData,
} from "./components";
import { ChatPanel } from "./ui/ChatPanel";
import { BenchHubPanel } from "./ui/BenchHubPanel";
import { ShopPanel } from "./ui/ShopPanel";
import { InventoryPanel } from "./ui/InventoryPanel";
import { CowRenderer } from "./ui/CowRenderer";
import { renderNightOverlay } from "./ui/NightOverlay";
import { MapRenderer } from "./ui/MapRenderer";
import { BookRenderer } from "./ui/BookRenderer";
import { CowAISystem } from "./systems/CowAISystem";
import { BanditAISystem } from "./systems/BanditAISystem";

import { PlayerController } from "./modules/PlayerController";
import { CombatController } from "./modules/CombatController";
import { InventoryController } from "./modules/InventoryController";
import { CraftingController } from "./modules/CraftingController";
import { ResourceController } from "./modules/ResourceController";
import { TradeController } from "./modules/TradeController";
import { EventController } from "./modules/EventController";
import { AdminController } from "./modules/AdminController";
import { NetworkController } from "./modules/NetworkController";
import { TimeController } from "./modules/TimeController";
import { UIController } from "./modules/UIController";

function dist(a: { col: number; row: number }, b: { col: number; row: number }) {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

type IconSet = {
  pull: HTMLImageElement;
  base: HTMLImageElement;
  cowboy: HTMLImageElement;
  bookIcon: HTMLImageElement;
  stakeIcon: HTMLImageElement;
  eyeIcon: HTMLImageElement;
  spaceKey: HTMLImageElement;
  trunkIcon: HTMLImageElement;
  moneyIcon: HTMLImageElement;
  benchIcon: HTMLImageElement;
  axeIcon: HTMLImageElement;
};

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: Tile[][];
  private world = new World();
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private icons!: IconSet;
  private lastTime = 0;
  public gameTime = 0;
  private rafId = 0;
  private isPreview = false;
  private destroyed = false;
  private readonly resizeHandler = () => this.resize();
  private readonly beforeUnloadHandler = () => this.saveBeforeUnload();

  private cowRenderer = new CowRenderer();
  private mapRenderer = new MapRenderer();
  private bookRenderer = new BookRenderer();
  private cowAISystem = new CowAISystem();
  private banditAISystem = new BanditAISystem();
  private chatPanel?: ChatPanel;
  private benchHubPanelHtml!: BenchHubPanel;
  private shopPanelHtml!: ShopPanel;
  private inventoryPanelHtml!: InventoryPanel;

  public readonly player: PlayerController;
  public readonly combat: CombatController;
  public readonly inventory: InventoryController;
  public readonly crafting: CraftingController;
  public readonly resources: ResourceController;
  public readonly trade: TradeController;
  public readonly events: EventController;
  public readonly admin: AdminController;
  public readonly network: NetworkController;
  public readonly timeManager: TimeController;
  public readonly ui: UIController;

  public remotePlayerEntities = new Map<string, Entity>();
  public remoteCowsInBase = new Map<string, { color: string; cows: Array<{ col: number; row: number }> }>();
  public myId = "";
  public myColor = "#3a5a9f";
  public myName = "Cowboy";
  public myToken = "";
  public userData: UserData | null = null;
  public placedObjects: PlacedObject[] = [];
  public chatMessages: Array<ChatMessage & { time: number }> = [];
  public chatOpen = false;
  public coins = 0;
  public bookOpen = false;
  public bookPage = 0;
  public bookPageTarget = 0;
  public bookPageAnimT = 1;
  public bookTab: "vacas" | "itens" | "personagens" = "vacas";
  public discovered = new Set<string>();
  public capturedByType = new Map<string, number>();
  public discoveredNPCs = new Set<string>();
  public shopOpen = false;
  public shopTab: "sell" | "buy" = "sell";
  public benchHubOpen = false;
  public activeBench: PlacedObject | null = null;
  public placementMode: string | null = null;
  public mouseTileCol = 0;
  public mouseTileRow = 0;
  public choppedTrees = new Map<string, number>();
  public statsMinimized = false;
  public inventoryOpen = false;
  public birthdayDialogOpen = false;
  public isAdmin = false;
  public basedCount = 0;
  public nextCowId = 0;

  constructor(canvas: HTMLCanvasElement, userData: UserData | null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.map = generateMap();

    if (!userData) {
      this.isPreview = true;
    } else {
      this.userData = userData;
      this.myToken = userData.token;
      this.myColor = userData.color;
      this.myName = userData.username;
      this.isAdmin = userData.isAdmin ?? false;
      this.basedCount = userData.basedCows?.length ?? userData.basedCount;
      this.discovered = new Set(userData.discovered);
      this.discoveredNPCs = new Set(userData.discoveredNPCs ?? []);
      this.capturedByType = new Map(Object.entries(userData.capturedByType));
      const serverCoins = userData.coins ?? 0;
      const localCoins = Number(localStorage.getItem(`cowboy_coins_${userData.username}`) ?? "0");
      this.coins = serverCoins > 0 ? serverCoins : localCoins;
    }

    this.player = new PlayerController(this);
    this.combat = new CombatController(this);
    this.inventory = new InventoryController(this);
    this.crafting = new CraftingController(this);
    this.resources = new ResourceController(this);
    this.trade = new TradeController(this);
    this.events = new EventController(this);
    this.admin = new AdminController(this);
    this.network = new NetworkController(this);
    this.timeManager = new TimeController(this);
    this.ui = new UIController(this);

    this.initCowCount();
    this.initIcons();
    this.setupPanels(userData);
    this.setupInput();
    this.resize();
    window.addEventListener("resize", this.resizeHandler);
    this.preloadSprites();

    if (!this.isPreview) {
      this.network.connect();
      this.setupBeforeUnload();
    }

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private initCowCount() {
    const { COW_COUNT } = require("./constants");
    this.nextCowId = this.basedCount > 0 ? COW_COUNT + this.basedCount : COW_COUNT;
    for (let i = 0; i < (this.basedCount > 0 ? 0 : COW_COUNT); i++) {
      this.spawnCowEntity(i);
    }
    if (this.userData?.basedCows && this.userData.basedCows.length > 0) {
      const { basedSlotPos } = require("./modules/CombatController");
      this.userData.basedCows.forEach((typeId: string, i: number) => {
        const pos = basedSlotPos(i);
        this.addBasedCowEntity(COW_COUNT + i, pos.col, pos.row, typeId);
      });
    }
  }

  private initIcons() {
    const { COW_COUNT } = require("./constants");
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

    for (const item of SHOP_ITEMS) {
      if (item.icon.includes("/") || item.icon.endsWith(".png")) {
        const img = new Image();
        let iconPath = item.icon.replace(/^public\//, "");
        if (!iconPath.startsWith("/")) iconPath = "/" + iconPath;
        img.src = iconPath;
        (this as any).itemIcons?.set(item.id, img);
      }
    }
  }

  private setupPanels(userData: UserData | null) {
    if (this.isPreview) return;

    this.statsMinimized = window.innerWidth < 500;
    this.zoom = window.innerWidth < 600 ? 1 : 1.5;

    this.benchHubPanelHtml = new BenchHubPanel({
      onCraft: (id) => { if (id === "machado") { this.crafting.craftMachado(); this._refreshBenchPanel(); } },
      onPickup: () => { void this.crafting.pickupBench(this.activeBench!); },
      onClose: () => { this.benchHubOpen = false; this.benchHubPanelHtml.close(); this.activeBench = null; },
    });

    this.shopPanelHtml = new ShopPanel({
      onSellCow: (cow) => {
        const found = this.combat.herdCows().find(c => c.herdIndex === cow.herdIndex);
        if (found) this.combat.sellCow(found);
        this._refreshShopPanel();
      },
      onSellAllHerd: () => { this.combat.sellAllCows(); this._refreshShopPanel(); },
      onSellCowBased: (cow) => {
        const found = this.combat.basedCows().find(c => c.herdIndex === cow.herdIndex);
        if (found) this.combat.sellBasedCow(found);
        this._refreshShopPanel();
      },
      onSellAllBased: () => { this.combat.sellAllBasedCows(); this._refreshShopPanel(); },
      onBuyItem: (item) => { this.inventory.buyItem(item); this._refreshShopPanel(); },
      onClose: () => { this.shopOpen = false; this.shopPanelHtml.close(); },
    });

    this.inventoryPanelHtml = new InventoryPanel({
      onDrop: (item) => { this.inventory.dropItem(item); this._refreshInventoryPanel(); },
      onTrade: (item) => { this.trade.startOffer(item); this._refreshInventoryPanel(); },
      onPlace: (item) => { this.crafting.startPlacement(item); },
      onUse: (item) => { this.inventory.useConsumable(item); this._refreshInventoryPanel(); },
      onAcceptTrade: () => { this.trade.acceptIncoming(); this._refreshInventoryPanel(); },
      onDeclineTrade: () => { this.trade.declineIncoming(); this._refreshInventoryPanel(); },
      onCancelTrade: () => { this.trade.cancel(); this._refreshInventoryPanel(); },
      onSelectPlayer: (id) => { this.trade.confirmOffer(id); this._refreshInventoryPanel(); },
      onClose: () => { this.inventoryOpen = false; this.inventoryPanelHtml.close(); },
    });

    this.chatPanel = new ChatPanel(this.chatMessages);
    this.chatPanel.onSend((text) => {
      this.network.sendChat(text);
    });

    if (this.isAdmin) this.admin.setupInput();
  }

  private setupInput() {
    this.ui.setupInput();
  }

  private preloadSprites() {
    const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
    for (const dir of dirs) {
      sprites.get(`player/idle/${dir}.png`);
      for (let f = 0; f < 4; f++) {
        sprites.get(`player/run/${dir}/frame_00${f}.png`);
      }
    }
    sprites.get("decorations/Curved_tree1.png");
    sprites.get("decorations/White_tree1.png");
    sprites.get("decorations/Blue-green_balls_tree3.png");
    sprites.get("npcs/bandit/Unarmed_Walk_without_shadow.png");
    sprites.get("npcs/bandit/Unarmed_Run_without_shadow.png");
    sprites.get("npcs/bandit/Unarmed_Idle_without_shadow.png");
  }

  private setupBeforeUnload() {
    window.addEventListener("beforeunload", this.beforeUnloadHandler);
  }

  private saveBeforeUnload() {
    const payload = JSON.stringify({
      token: this.myToken,
      basedCount: this.basedCount,
      discovered: [...this.discovered],
      discoveredNPCs: [...this.discoveredNPCs],
      capturedByType: Object.fromEntries(this.capturedByType),
      basedCowTypes: this.combat.basedCows()
        .sort((a, b) => a.herdIndex - b.herdIndex)
        .map((c) => c.type.id),
      coins: this.coins,
      inventory: Object.fromEntries(this.inventory.items),
    });
    navigator.sendBeacon("/auth/save", new Blob([payload], { type: "application/json" }));
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("beforeunload", this.beforeUnloadHandler);
    this.network.destroy();
    this.ui.destroy();
    this.chatPanel?.destroy();
    this.benchHubPanelHtml?.destroy();
    this.shopPanelHtml?.destroy();
    this.inventoryPanelHtml?.destroy();
    (this.admin as any).adminCmdInput?.remove();
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private loop(t: number) {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame((t2) => this.loop(t2));
    const elapsed = t - this.lastTime;
    if (elapsed < 16.67) return;
    const dt = Math.min(elapsed / 1000, 0.1);
    this.lastTime = t - (elapsed % 16.67);
    this.gameTime += dt;

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
    this.player.update(dt);
    this.combat.update(dt);
    this.resources.update(dt);
    this.timeManager.update(dt);
    this.network.update(dt);
    this.admin.update(dt);
    this.events.update(dt);
    this.ui.update(dt);
  }

  private updateCamera() {
    const sx = (this.player.col - this.player.row) * (TILE_W / 2);
    const sy = (this.player.col + this.player.row) * (TILE_H / 2);
    this.camX = this.canvas.width / (2 * this.zoom) - sx;
    this.camY = this.canvas.height / (2 * this.zoom) - sy - 40;
  }

  private render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const g = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.55);
    g.addColorStop(0, "#3a7fbf");
    g.addColorStop(1, "#a8d8ea");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    this.renderMap();
    this.renderEntities();
    ctx.restore();

    this.renderNightOverlay();
    if (this.bookOpen) this.renderBook();
    else this.renderUI();
  }

  private _benchPanelData() {
    const bench = this.activeBench!;
    return {
      type: bench.type,
      owner: bench.owner,
      ownerColor: bench.ownerColor,
      isOwner: bench.owner === this.myName,
      stone: this.inventory.items.get("stone") ?? 0,
      coins: this.coins,
      machado: this.inventory.items.get("machado") ?? 0,
    };
  }

  private _shopPanelData() {
    return {
      coins: this.coins,
      shopTab: this.shopTab,
      herdCows: this.combat.herdCows(),
      basedCows: this.combat.basedCows().sort((a, b) => a.herdIndex - b.herdIndex),
      inventory: this.inventory.items,
    };
  }

  private _inventoryPanelData() {
    const onlinePlayers = this.world.query(EcsPosition, RemotePlayerData, NetworkId)
      .map(([entity]) => this.remotePlayerCompat(entity));
    return {
      inventory: this.inventory.items,
      tradeState: this.trade.state,
      tradeIncoming: this.trade.incoming,
      tradeItem: this.trade.offerItem,
      tradeResultMsg: this.trade.resultMsg,
      onlinePlayers,
      leiteTimer: this.inventory.leiteTimer,
    };
  }

  private _openBenchPanel() {
    if (this.benchHubPanelHtml && this.activeBench) this.benchHubPanelHtml.open(this._benchPanelData());
  }

  private _refreshBenchPanel() {
    if (this.benchHubPanelHtml && this.activeBench) this.benchHubPanelHtml.refresh(this._benchPanelData());
  }

  private _openShopPanel() {
    if (this.shopPanelHtml) this.shopPanelHtml.open(this._shopPanelData());
  }

  private _refreshShopPanel() {
    if (this.shopPanelHtml) this.shopPanelHtml.refresh(this._shopPanelData());
  }

  private _openInventoryPanel() {
    if (this.inventoryPanelHtml) this.inventoryPanelHtml.open(this._inventoryPanelData());
  }

  private _refreshInventoryPanel() {
    if (this.inventoryPanelHtml) this.inventoryPanelHtml.refresh(this._inventoryPanelData());
  }

  private _pushChat(msg: ChatMessage & { time: number }) {
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 200) this.chatMessages.shift();
    this.chatPanel?.addMessage(msg);
  }

  addSystemMessage(text: string) {
    this._pushChat({ id: "system", name: "⚙ Sistema", color: "#FFD700", text, time: Date.now() });
  }

  private _mapCtx(): import("./ui/MapRenderer").MapCtx {
    return {
      ctx: this.ctx,
      time: this.gameTime,
      map: this.map,
      visibleRange: this.visibleTileRange(),
      isoToScreen: this.isoToScreen.bind(this),
    };
  }

  private renderMap() {
    this.mapRenderer.renderMap(this._mapCtx());
  }

  private renderEntities() {
    const { colMin, colMax, rowMin, rowMax } = this.visibleTileRange();

    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];

    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const tile = this.map[r]![c]!;
        const deco = tile.decoration;
        if (deco !== "tree" && deco !== "bush" && deco !== "cactus" && deco !== "boulder") {
          this.mapRenderer.drawDecoration(c, r, deco, this._mapCtx());
        }
      }
    }

    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const tile = this.map[r]![c]!;
        if (tile.decoration === "tree" || tile.decoration === "bush" || tile.decoration === "cactus" || tile.decoration === "boulder") {
          this.mapRenderer.drawDecoration(c, r, tile.decoration, this._mapCtx());
        }
      }
    }

    items.push({ depth: this.player.col + this.player.row, draw: () => this.player.draw(this) });

    for (const [entity] of this.world.query(EcsPosition, CowAI, CowTypeComp)) {
      const c = this.cowCompat(entity);
      items.push({ depth: c.col + c.row + (c.state === "based" ? -100 : 0), draw: () => this.drawCow(c) });
    }

    for (const [entity] of this.world.query(EcsPosition, RemotePlayerData, NetworkId)) {
      const r = this.remotePlayerCompat(entity);
      const hN = Math.min(r.herdCount ?? 0, 12);
      for (let i = 0; i < hN; i++) {
        const tCol = r.col - r.dirCol * (i + 1) * 1.1;
        const tRow = r.row - r.dirRow * (i + 1) * 1.1;
        const alpha = Math.max(0.45, 0.9 - i * 0.07);
        const herdbob = r.moving ? Math.sin(this.gameTime * 9 + i * 1.4) * 1.5 : 0;
        items.push({
          depth: tCol + tRow,
          draw: () => this.drawRemoteBasedCow(tCol, tRow, r.color, alpha, herdbob),
        });
      }
      items.push({ depth: r.col + r.row, draw: () => this.drawRemotePlayer(r) });
    }

    for (const [, batch] of this.remoteCowsInBase) {
      for (const pos of batch.cows) {
        items.push({
          depth: pos.col + pos.row - 100,
          draw: () => this.drawRemoteBasedCow(pos.col, pos.row, batch.color),
        });
      }
    }

    for (const obj of this.placedObjects) {
      items.push({ depth: obj.col + obj.row, draw: () => this.ui.drawBench(obj) });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();
  }

  private drawCow(cow: any) {
    this.cowRenderer.drawCow({
      ctx: this.ctx,
      cow,
      time: this.gameTime,
      nightFade: this.timeManager.nightFade,
      eyeIcon: this.icons.eyeIcon,
      isoToScreen: (col: number, row: number) => this.isoToScreen(col, row),
      playerPos: this.player,
      dist,
      captureDistFearThreshold: 0,
    });
  }

  private drawRemotePlayer(rp: any) {
    this.cowRenderer.drawRemotePlayer({
      ctx: this.ctx,
      rp,
      time: this.gameTime,
      isoToScreen: (col: number, row: number) => this.isoToScreen(col, row),
      getSpriteDir: (dc: number, dr: number) => this.player.getSpriteDir(dc, dr),
    });
  }

  private drawRemoteBasedCow(col: number, row: number, color: string, baseAlpha?: number, bob?: number) {
    this.cowRenderer.drawRemoteBasedCow({
      ctx: this.ctx,
      col,
      row,
      color,
      baseAlpha,
      bob,
      isoToScreen: (c: number, r: number) => this.isoToScreen(c, r),
    });
  }

  private isoToScreen(col: number, row: number) {
    return {
      x: (col - row) * (TILE_W / 2) + this.camX,
      y: (col + row) * (TILE_H / 2) + this.camY,
    };
  }

  screenToIso(x: number, y: number) {
    const wx = x - this.camX;
    const wy = y - this.camY;
    return {
      col: wx / TILE_W + wy / TILE_H,
      row: -wx / TILE_W + wy / TILE_H,
    };
  }

  private visibleTileRange() {
    const { camX: cx, camY: cy } = this;
    const W = this.canvas.width / this.zoom, H = this.canvas.height / this.zoom;
    const hw = TILE_W / 2, hh = TILE_H / 2;
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

  private renderNightOverlay() {
    renderNightOverlay(this.ctx, this.canvas, this.timeManager.period, this.timeManager.nightFade, this.gameTime);
  }

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
      inventory: this.inventory.items,
      itemIcons: new Map(),
    });
  }

  private renderUI() {
    this.ui.render();
  }

  spawnCowEntity(id: number, nightMode = false): Entity {
    const rawCow = this.combat.spawnCowRaw(id, this.map, nightMode);
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

  addBasedCowEntity(id: number, col: number, row: number, typeId: string): Entity {
    const { COW_TYPES } = require("./cowTypes");
    const cowType = COW_TYPES.find((t: any) => t.id === typeId) ?? COW_TYPES[0];
    const entity = this.world.create();
    const ai = new CowAI();
    ai.state = "based";
    ai.herdIndex = id;
    this.world
      .add(entity, new EcsPosition(col, row))
      .add(entity, new LegacyId(id))
      .add(entity, ai)
      .add(entity, new CowTypeComp(cowType))
      .add(entity, new BasedTag());
    return entity;
  }

  cowCompat(entity: Entity): any {
    const pos = this.world.must(entity, EcsPosition);
    const ai = this.world.must(entity, CowAI);
    const tc = this.world.must(entity, CowTypeComp);
    const lid = this.world.must(entity, LegacyId);
    return {
      id: lid.id,
      get col() { return pos.col; },
      set col(v: number) { pos.col = v; },
      get row() { return pos.row; },
      set row(v: number) { pos.row = v; },
      get state() { return ai.state; },
      set state(v: any) { ai.state = v; },
      get type() { return tc.cowType; },
      get wanderTimer() { return ai.wanderTimer; },
      set wanderTimer(v: number) { ai.wanderTimer = v; },
      get wanderDirCol() { return ai.wanderDirCol; },
      set wanderDirCol(v: number) { ai.wanderDirCol = v; },
      get wanderDirRow() { return ai.wanderDirRow; },
      set wanderDirRow(v: number) { ai.wanderDirRow = v; },
      get herdIndex() { return ai.herdIndex; },
      set herdIndex(v: number) { ai.herdIndex = v; },
      get sparkTimer() { return ai.sparkTimer; },
      set sparkTimer(v: number) { ai.sparkTimer = v; },
      _entity: entity,
    };
  }

  remotePlayerCompat(entity: Entity): any {
    const pos = this.world.must(entity, EcsPosition);
    const data = this.world.must(entity, RemotePlayerData);
    const nid = this.world.must(entity, NetworkId);
    return {
      id: nid.id,
      get col() { return pos.col; },
      set col(v: number) { pos.col = v; },
      get row() { return pos.row; },
      set row(v: number) { pos.row = v; },
      get dirCol() { return data.dirCol; },
      set dirCol(v: number) { data.dirCol = v; },
      get dirRow() { return data.dirRow; },
      set dirRow(v: number) { data.dirRow = v; },
      get moving() { return data.moving; },
      set moving(v: boolean) { data.moving = v; },
      get color() { return data.color; },
      set color(v: string) { data.color = v; },
      get name() { return data.name; },
      set name(v: string) { data.name = v; },
      get herdCount() { return data.herdCount; },
      set herdCount(v: number) { data.herdCount = v; },
      get lastMessage() { return data.lastMessage; },
      set lastMessage(v: string | undefined) { data.lastMessage = v; },
      get lastMessageTime() { return data.lastMessageTime; },
      set lastMessageTime(v: number | undefined) { data.lastMessageTime = v; },
      _entity: entity,
    };
  }

  get worldState() { return this.world; }
  get ecsPosition() { return EcsPosition; }
  get cowAISystemRef() { return this.cowAISystem; }
  get banditAISystemRef() { return this.banditAISystem; }
}
