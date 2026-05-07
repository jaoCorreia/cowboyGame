import { type GameItem, SHOP_ITEMS } from "../items";

export type TradeState = "idle" | "selecting" | "waiting" | "incoming" | "result";

export class TradeController {
  public state: TradeState = "idle";
  public offerItem: GameItem | null = null;
  public offerLevel = 0;
  public incoming: { fromId: string; fromName: string; fromColor: string; item: GameItem; level: number } | null = null;
  public resultMsg = "";
  public resultTimer = 0;

  constructor(private game: any) {}

  startOffer(item: GameItem) {
    this.offerItem = item;
    this.offerLevel = this.game.inventory.items.get(item.id) ?? 1;
    this.state = "selecting";
  }

  confirmOffer(playerId: string) {
    if (!this.offerItem) return;
    this.game.network?.sendTradeOffer?.(playerId, this.offerItem.id, this.offerLevel);
    this.state = "waiting";
  }

  acceptIncoming() {
    if (!this.incoming) return;
    const { fromId, item, level } = this.incoming;
    const cur = this.game.inventory.items.get(item.id) ?? 0;
    this.game.inventory.items.set(item.id, Math.min(cur + level, item.maxLevel));
    this.game.network?.sendTradeAccept?.(fromId);
    this.resultMsg = `✅ Recebeu ${item.name} Lv${level}!`;
    this.state = "result";
    this.resultTimer = 2.5;
    this.incoming = null;
    this.game.network?.sendSave?.(
      this.game.basedCount, [...this.game.discovered], [...this.game.discoveredNPCs],
      Object.fromEntries(this.game.capturedByType),
      this.game.combat.basedCows().map((c: any) => c.type.id),
      this.game.coins, Object.fromEntries(this.game.inventory.items)
    );
  }

  declineIncoming() {
    if (!this.incoming) return;
    this.game.network?.sendTradeDecline?.(this.incoming.fromId);
    this.incoming = null;
    this.state = "idle";
  }

  cancel() {
    this.state = "idle";
    this.offerItem = null;
    this.incoming = null;
  }

  update(dt: number) {
    if (this.state === "result" && this.resultTimer > 0) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.state = "idle";
        this.game._refreshInventoryPanel?.();
      }
    }
  }

  onIncomingOffer(offer: any) {
    const item = SHOP_ITEMS.find((it) => it.id === offer.itemId);
    if (!item) return;
    this.incoming = { ...offer, item };
    this.state = "incoming";
    this.game.inventoryOpen = true;
    this.game._openInventoryPanel?.();
  }
}
