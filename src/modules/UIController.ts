import { toggleMusic } from "../music";
import { VENDOR_COL, VENDOR_ROW, VENDOR_INTERACT_DIST } from "../constants";
import { drawPanel, drawPixelBtn } from "../ui/drawUtils";
import { renderStatsPanel, renderOnlinePanel, renderChat } from "../ui/HUDRenderer";
import { renderAdminOverlay } from "../ui/AdminRenderer";

export class UIController {
  private keys = new Set<string>();
  private joystickActive = false;
  private joystickTouchId = -1;
  private joystickStartX = 0;
  private joystickStartY = 0;
  private joystickDx = 0;
  private joystickDy = 0;
  private touchScrollActive = false;
  private touchScrollTarget: "shop" | "inventory" | "chat" | null = null;
  private touchScrollId = -1;
  private touchScrollStartY = 0;
  private touchScrollLastY = 0;
  public shopBuyScroll = 0;
  public inventoryScroll = 0;
  public chatHistoryScroll = 0;

  private readonly keyDownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private readonly keyUpHandler = (e: KeyboardEvent) => this.onKeyUp(e);
  private readonly pointerDownHandler = (e: PointerEvent) => this.onPointerDown(e);
  private readonly pointerMoveHandler = (e: PointerEvent) => this.onPointerMove(e);
  private readonly pointerUpHandler = (e: PointerEvent) => this.onPointerUp(e);
  private readonly wheelHandler = (e: WheelEvent) => this.onWheel(e);

  constructor(private game: any) {}

  setupInput() {
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    this.game.canvas.addEventListener("pointerdown", this.pointerDownHandler);
    this.game.canvas.addEventListener("pointermove", this.pointerMoveHandler);
    this.game.canvas.addEventListener("pointerup", this.pointerUpHandler);
    this.game.canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
  }

  destroy() {
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    this.game.canvas.removeEventListener("pointerdown", this.pointerDownHandler);
    this.game.canvas.removeEventListener("pointermove", this.pointerMoveHandler);
    this.game.canvas.removeEventListener("pointerup", this.pointerUpHandler);
    this.game.canvas.removeEventListener("wheel", this.wheelHandler);
  }

  update(_dt: number) {
    // Input is event-driven; this hook keeps Game.update simple and symmetric.
  }

  private onKeyDown(e: KeyboardEvent) {
    if (this.game.isAdmin && (e.key === "`" || e.key === "~")) {
      this.game.admin?.openCmd?.();
      e.preventDefault();
      return;
    }
    if (this.game.isAdmin && e.key.toLowerCase() === "z") {
      this.game.zoom = this.game.zoom > 1 ? 1 : 1.5;
      e.preventDefault();
      return;
    }
    if (this.game.isPreview || this.game.chatOpen || this.game.admin?.cmdOpen) return;

    if (e.key === "Escape") {
      this.handleEscape();
      return;
    }

    this.keys.add(e.key.toLowerCase());
    this.game.player?.onKeyDown?.(e.key);
    if (e.key === " " || e.key.toLowerCase() === "e") this.handleAction();
    if (e.key.toLowerCase() === "b") this.toggleBook();
    if (e.key.toLowerCase() === "m") toggleMusic();
    if (e.key.toLowerCase() === "q") this.game.combat?.toggleStakeAim?.();
    if (e.key.toLowerCase() === "t") { this.game.chatOpen = true; this.game.chatPanel?.open(); e.preventDefault(); }
    if (e.key.toLowerCase() === "i") {
      this.game.inventoryOpen = !this.game.inventoryOpen;
      if (this.game.inventoryOpen) this.game._openInventoryPanel?.();
      else this.game.inventoryPanelHtml?.close();
      e.preventDefault();
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase());
    this.game.player?.onKeyUp?.(e.key);
  }

  private onPointerDown(e: PointerEvent) {
    if (this.game.isPreview) return;
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const x = e.clientX, y = e.clientY;
    const gx = x / this.game.zoom, gy = y / this.game.zoom;

    // Chat button
    const chatBtnX = W - 80, chatBtnY = H - 260;
    if (Math.hypot(x - chatBtnX, y - chatBtnY) < 36) {
      if (this.game.chatOpen) this.game.chatPanel?.close?.();
      else { this.game.chatOpen = true; this.game.chatPanel?.open?.(); }
      return;
    }

    if (this.game.chatOpen) {
      this.game.chatOpen = false;
      this.game.chatPanel?.close?.();
      return;
    }

    // Shop close button
    if (this.game.shopOpen) {
      // Delegate to existing panel handlers
      return;
    }

    // Book button
    if (this.game.bookOpen) {
      this.game.bookOpen = false;
      return;
    }

    // Inventory button
    const invBtnX = W - 80, invBtnY = H - 330;
    if (x >= invBtnX - 30 && x <= invBtnX + 30 && y >= invBtnY - 30 && y <= invBtnY + 30) {
      this.game.inventoryOpen = !this.game.inventoryOpen;
      if (this.game.inventoryOpen) this.game._openInventoryPanel?.();
      else this.game.inventoryPanelHtml?.close();
      return;
    }

    // Action button
    const ax = W - 80, ay = H - 80;
    if (Math.hypot(x - ax, y - ay) < 56) {
      this.handleAction();
      return;
    }

    // Joystick zone
    if (x < W / 2 && y > H * 0.55) {
      this.joystickActive = true;
      this.joystickTouchId = e.pointerId;
      this.joystickStartX = x;
      this.joystickStartY = y;
      this.game.player?.onJoystickStart?.(e.pointerId, x, y);
      e.preventDefault();
      return;
    }

    // Stake aiming
    if (this.game.combat?.stake?.phase === "aiming") {
      this.game.combat.throwStakeTo(gx, gy);
      return;
    }

    // Placement mode
    if (this.game.crafting?.placementMode) {
      const iso = this.game.screenToIso?.(gx, gy) ?? { col: Math.floor(gx), row: Math.floor(gy) };
      if (this.game.crafting.isPlacementValid(Math.floor(iso.col), Math.floor(iso.row))) {
        void this.game.crafting.placeObject(Math.floor(iso.col) + 0.5, Math.floor(iso.row) + 0.5);
      }
      return;
    }

    // Stake button
    const stakeX = W - 80, stakeY = H - 170;
    if (Math.hypot(x - stakeX, y - stakeY) < 36) {
      this.game.combat?.toggleStakeAim?.();
      return;
    }

    // Click on cow
    const nearestCow = this.game.combat?.nearestWanderingCow?.();
    if (nearestCow && this.game.combat.herdCows().length < this.game.player.effectiveHerdCapacity) {
      this.game.combat?.startLasso?.(nearestCow);
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (this.touchScrollActive && e.pointerId === this.touchScrollId) {
      const deltaY = this.touchScrollLastY - e.clientY;
      this.touchScrollLastY = e.clientY;
      if (this.touchScrollTarget === "shop") {
        this.shopBuyScroll = Math.max(0, this.shopBuyScroll + deltaY);
      } else if (this.touchScrollTarget === "inventory") {
        this.inventoryScroll = Math.max(0, this.inventoryScroll + deltaY);
      }
      e.preventDefault();
      return;
    }

    if (this.joystickActive && e.pointerId === this.joystickTouchId) {
      this.game.player?.onJoystickMove?.(e.pointerId, e.clientX, e.clientY);
      e.preventDefault();
    }

    // Track mouse tile
    const iso = this.game.screenToIso?.(e.clientX / this.game.zoom, e.clientY / this.game.zoom);
    if (iso) {
      this.game.mouseTileCol = Math.floor(iso.col);
      this.game.mouseTileRow = Math.floor(iso.row);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerId === this.touchScrollId) {
      this.touchScrollActive = false;
      this.touchScrollTarget = null;
    }
    if (e.pointerId === this.joystickTouchId) {
      this.joystickActive = false;
      this.game.player?.onJoystickEnd?.(e.pointerId);
    }
  }

  private onWheel(e: WheelEvent) {
    if (this.game.shopOpen && this.game.shopTab === "buy") {
      const area = (this.game as any).shopBuyContentArea;
      if (area && e.clientX >= area.x && e.clientX <= area.x + area.w && e.clientY >= area.y && e.clientY <= area.y + area.h) {
        this.shopBuyScroll = Math.max(0, this.shopBuyScroll + e.deltaY);
        e.preventDefault();
      }
    }
  }

  private handleEscape() {
    if (document.getElementById("_settings_panel")) {
      document.getElementById("_settings_panel")?.remove();
      return;
    }
    if (this.game.crafting?.placementMode) {
      this.game.crafting.placementMode = null;
      return;
    }
    if (this.game.inventoryOpen) {
      this.game.inventoryOpen = false;
      this.game.inventoryPanelHtml?.close();
      return;
    }
    if (this.game.shopOpen) {
      this.game.shopOpen = false;
      this.game.shopPanelHtml?.close();
      return;
    }
    if (this.game.combat?.stake?.phase === "aiming") {
      this.game.combat.stake.phase = "idle";
      return;
    }
    this.game.toggleBook?.();
  }

  private handleAction() {
    if (this.game.vendorDialog?.active) {
      // Skip dialog
      return;
    }
    if (this.game.crafting?.benchHubOpen) {
      this.game.crafting.benchHubOpen = false;
      this.game.benchHubPanelHtml?.close?.();
      this.game.crafting.activeBench = null;
      return;
    }
    if (this.game.combat?.isAtBase?.() && this.game.combat.herdCows().length > 0) {
      this.game.combat.depositCows();
      return;
    }
    if (this.isAtVendor()) {
      this.game.shopOpen = true;
      this.game._openShopPanel?.();
      return;
    }
    const nearBench = this.game.crafting?.nearestBench?.();
    if (nearBench) {
      this.game.crafting.activeBench = nearBench;
      this.game.crafting.benchHubOpen = true;
      this.game._openBenchPanel?.();
      return;
    }
    const nearTree = this.game.resources?.nearestChoppableTree?.();
    if (nearTree && this.game.resources?.hasMachado?.()) {
      this.game.resources.startChop(nearTree.col, nearTree.row);
      return;
    }
    const nearBoulder = this.game.resources?.nearestBoulder?.();
    if (nearBoulder) {
      this.game.resources.startHarvest(nearBoulder.col, nearBoulder.row);
      return;
    }
  }

  private isAtVendor() {
    return Math.hypot(this.game.player.col - VENDOR_COL, this.game.player.row - VENDOR_ROW) <= VENDOR_INTERACT_DIST;
  }

  private toggleBook() {
    this.game.bookOpen = !this.game.bookOpen;
    if (this.game.bookOpen) {
      this.game.shopOpen = false;
      this.game.shopPanelHtml?.close?.();
      this.game.bookPage = 0;
      this.game.bookPageTarget = 0;
      this.game.bookPageAnimT = 1;
      this.game.bookTab = "vacas";
    }
  }

  render() {
    const { ctx, canvas } = this.game;
    const W = canvas.width, H = canvas.height;

    this.renderStatsPanel();
    this.renderOnlinePanel(W, H);
    this.renderButtons(W, H);
    this.renderChat(W, H);

    if (this.game.isAdmin) this.renderAdmin(W, H);

    // Mobile controls
    if (W < 600) {
      this.renderMobileControls();
    }

    // Desktop hints
    if (W > 720) {
      drawPanel(ctx, W - 220, 90, 210, 80, 3);
      ctx.fillStyle = "#C8A870";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("WASD / Setas = mover", W - 115, 115);
      ctx.fillText("E / Espaço = ação   B = Livro   M = Música", W - 115, 132);
      ctx.fillText("Q = Estaca (cruzar rio)", W - 115, 149);
    }
  }

  private renderStatsPanel() {
    renderStatsPanel({
      ctx: this.game.ctx,
      statsMinimized: this.game.statsMinimized,
      myColor: this.game.myColor,
      myName: this.game.myName,
      herdCount: this.game.combat?.herdCows?.()?.length ?? 0,
      basedCount: this.game.basedCount,
      wanderingCount: 0,
      timePeriod: this.game.timeManager?.period ?? "manha",
      nightFade: this.game.timeManager?.nightFade ?? 0,
      coins: this.game.coins,
      moneyIcon: this.game.icons?.moneyIcon,
      leiteTimer: this.game.inventory?.leiteTimer ?? 0,
      time: this.game.gameTime,
      hasOwnedItems: false,
    });
  }

  private renderOnlinePanel(W: number, H: number) {
    const players = [
      { color: this.game.myColor, name: this.game.myName + " (você)", isMe: true },
      ...Array.from(this.game.remotePlayerEntities.values()).map((entity: any) => {
        const data = this.game.worldState?.get(entity, require("../components").RemotePlayerData);
        return { color: data?.color ?? "#888", name: data?.name ?? "?", isMe: false };
      }),
    ];
    renderOnlinePanel({ ctx: this.game.ctx, statsMinimized: this.game.statsMinimized, players });
  }

  private renderButtons(W: number, H: number) {
    const { ctx } = this.game;

    // Settings
    const settingsX = W - 120, settingsY = 50;
    drawPixelBtn(ctx, settingsX - 24, settingsY - 24, 48, 48, "normal");
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚙", settingsX, settingsY);

    // Book
    const bookCX = W - 50, bookCY = 50;
    drawPixelBtn(ctx, bookCX - 34, bookCY - 34, 68, 68, "normal");
    ctx.drawImage(this.game.icons?.bookIcon, bookCX - 16, bookCY - 16, 32, 32);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LIVRO", bookCX, bookCY + 24);

    // Inventory
    const invCX = W - 80, invCY = H - 330;
    const invActive = this.game.inventoryOpen;
    drawPixelBtn(ctx, invCX - 30, invCY - 30, 60, 60, invActive ? "active" : "normal");
    ctx.drawImage(this.game.icons?.trunkIcon, invCX - 16, invCY - 16, 32, 32);
    ctx.textAlign = "center";
    ctx.fillStyle = invActive ? "#FFD700" : "#C8A870";
    ctx.font = "bold 9px sans-serif";
  }

  private renderChat(W: number, H: number) {
    if (this.game.chatPanel?.isOpen) return;
    this.chatHistoryScroll = renderChat({
      ctx: this.game.ctx,
      canvas: { width: W, height: H },
      chatOpen: false,
      chatMessages: this.game.chatMessages,
      chatHistoryScroll: this.chatHistoryScroll,
    }) ?? 0;
  }

  private renderAdmin(W: number, H: number) {
    renderAdminOverlay({
      ctx: this.game.ctx,
      canvas: { width: W, height: H },
      adminGodMode: this.game.admin?.godMode ?? false,
      adminForcePeriod: this.game.admin?.forcePeriod ?? null,
      adminCmdResult: this.game.admin?.cmdResult ?? "",
      adminCmdResultTimer: this.game.admin?.cmdResultTimer ?? 0,
      adminCmdOpen: this.game.admin?.cmdOpen ?? false,
      shopOpen: this.game.shopOpen,
      bookOpen: this.game.bookOpen,
      inventoryOpen: this.game.inventoryOpen,
    });
  }

  private renderMobileControls() {
    // Delegate to existing mobile controls renderer
    this.game.mobileControlsRenderer?.render?.({
      ctx: this.game.ctx,
      canvas: this.game.canvas,
      joystick: { active: this.joystickActive, touchId: this.joystickTouchId, startX: this.joystickStartX, startY: this.joystickStartY, dx: this.joystickDx, dy: this.joystickDy },
      chop: this.game.resources?.chop,
      lasso: this.game.combat?.lasso,
      stake: this.game.combat?.stake,
      chatOpen: this.game.chatOpen,
      benchHubOpen: this.game.crafting?.benchHubOpen,
      shopOpen: this.game.shopOpen,
      icons: this.game.icons,
      nearestWanderingCow: () => this.game.combat?.nearestWandering?.() ?? null,
      isAtBase: () => this.game.combat?.isAtBase?.() ?? false,
      isAtVendor: () => this.isAtVendor(),
      nearestBench: () => this.game.crafting?.nearestBench?.() ?? null,
      nearestChoppableTree: () => this.game.resources?.nearestChoppableTree?.() ?? null,
      nearestBoulder: () => this.game.resources?.nearestBoulder?.() ?? null,
      herdCows: () => this.game.combat?.herdCows?.() ?? [],
      playerPos: this.game.player,
    });
  }

  drawBench(obj: any) {
    const { ctx } = this.game;
    const { x, y } = this.game.isoToScreen(obj.col, obj.row);
    const isComm = obj.type === "bancada_comunitaria";

    const hw = 22, hh = 11, tableH = 16;
    ctx.save();
    ctx.translate(x, y - 18);
    ctx.fillStyle = isComm ? "#7a4e28" : "#5a3818";
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh + tableH); ctx.lineTo(0, tableH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = isComm ? "#5a3818" : "#3e2810";
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(hw, hh); ctx.lineTo(hw, hh + tableH); ctx.lineTo(0, tableH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = isComm ? "#c4884f" : "#9a6a3a";
    ctx.beginPath();
    ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = isComm ? "#FFD700" : obj.ownerColor;
    ctx.fillText(isComm ? "👥 " + obj.owner : obj.owner, x, y - 56);
    ctx.restore();
  }
}
