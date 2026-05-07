import { type GameItem, itemNextPrice } from "../items";
import { MAX_INVENTORY_SLOTS } from "../constants";

export class InventoryController {
  public items = new Map<string, number>();
  public leiteTimer = 0;

  constructor(private game: any) {}

  get itemIcons() {
    return (this.game as any).itemIcons ?? new Map<string, HTMLImageElement>();
  }

  buyItem(item: GameItem) {
    const level = this.items.get(item.id) ?? 0;
    if (level >= item.maxLevel) return;
    const price = itemNextPrice(item, level);
    if (this.game.coins < price) return;
    this.game.coins -= price;
    this.items.set(item.id, level + 1);
    this.saveCoinsLocally();
    this.game.network?.sendSave?.(
      this.game.basedCount, [...this.game.discovered], [...this.game.discoveredNPCs],
      Object.fromEntries(this.game.capturedByType),
      this.game.combat.basedCows().map((c: any) => c.type.id),
      this.game.coins, Object.fromEntries(this.items)
    );
  }

  dropItem(item: GameItem) {
    const cur = this.items.get(item.id) ?? 0;
    if (cur <= 0) return;
    if (cur <= 1) this.items.delete(item.id);
    else this.items.set(item.id, cur - 1);
    this.game.network?.sendSave?.(
      this.game.basedCount, [...this.game.discovered], [...this.game.discoveredNPCs],
      Object.fromEntries(this.game.capturedByType),
      this.game.combat.basedCows().map((c: any) => c.type.id),
      this.game.coins, Object.fromEntries(this.items)
    );
  }

  useConsumable(item: GameItem) {
    const qty = this.items.get(item.id) ?? 0;
    if (qty <= 0 || this.leiteTimer > 0) return;
    if (item.id === "leite_fluorescente") {
      this.leiteTimer = 5 * 60;
      const newQty = qty - 1;
      if (newQty <= 0) this.items.delete(item.id);
      else this.items.set(item.id, newQty);
    }
  }

  addResource(id: string, amount: number, maxStack: number): number {
    const current = this.items.get(id) ?? 0;
    if (current === 0 && this.slotCount() >= MAX_INVENTORY_SLOTS) return 0;
    const gained = Math.min(amount, maxStack - current);
    if (gained > 0) this.items.set(id, current + gained);
    return gained;
  }

  slotCount(): number {
    let count = 0;
    for (const [, qty] of this.items) {
      if (qty > 0) count++;
    }
    return count;
  }

  private saveCoinsLocally() {
    localStorage.setItem(`cowboy_coins_${this.game.myName}`, String(this.game.coins));
  }
}
