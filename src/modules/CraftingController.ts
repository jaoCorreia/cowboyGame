import { type PlacedObject } from "../network";
import { SHOP_ITEMS } from "../items";

export class CraftingController {
  public activeBench: PlacedObject | null = null;
  public placementMode: string | null = null;

  constructor(private game: any) {}

  get inventoryItems() {
    return this.game.inventory.items;
  }

  get coins() {
    return this.game.coins;
  }

  get benchHubOpen() {
    return this.game.benchHubOpen;
  }

  set benchHubOpen(v: boolean) {
    this.game.benchHubOpen = v;
  }

  startPlacement(item: any) {
    this.placementMode = item.id;
    this.game.inventoryOpen = false;
    this.game.inventoryPanelHtml?.close();
  }

  isPlacementValid(tileCol: number, tileRow: number): boolean {
    const tile = this.game.map[tileRow]?.[tileCol];
    if (!tile) return false;
    if (tile.type === "water" || tile.type === "base") return false;
    if (tile.decoration !== "none") return false;
    const col = tileCol + 0.5, row = tileRow + 0.5;
    if (this.game.placedObjects.some((o: PlacedObject) => Math.abs(o.col - col) < 1 && Math.abs(o.row - row) < 1)) return false;
    if (this.placementMode === "bancada_comunitaria" && this.game.placedObjects.some((o: PlacedObject) => o.type === "bancada_comunitaria" && o.owner === this.game.myName)) return false;
    return true;
  }

  async placeObject(col: number, row: number) {
    const type = this.placementMode;
    if (!type || !this.game.myToken) return;
    this.placementMode = null;

    const res = await fetch("/objects/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.game.myToken, type, col, row }),
    });
    if (!res.ok) return;

    const data = (await res.json()) as { id: string; inventory: Record<string, number> };
    this.game.inventory.items = new Map(Object.entries(data.inventory));

    if (type === "bancada_individual") {
      this.game.placedObjects.push({ id: data.id, type, owner: this.game.myName, ownerColor: this.game.myColor, col, row });
    }
  }

  async pickupBench(obj: PlacedObject) {
    if (!this.game.myToken) return;
    const res = await fetch(`/objects/${obj.id}?token=${encodeURIComponent(this.game.myToken)}`, { method: "DELETE" });
    if (!res.ok) return;

    const cur = this.game.inventory.items.get(obj.type) ?? 0;
    const item = SHOP_ITEMS.find((it) => it.id === obj.type);
    if (item) this.game.inventory.items.set(obj.type, Math.min(cur + 1, item.maxLevel));

    this.game.placedObjects = this.game.placedObjects.filter((o: PlacedObject) => o.id !== obj.id);
    this.benchHubOpen = false;
    this.game.benchHubPanelHtml?.close();
    this.activeBench = null;
    this.game.network?.sendSave?.(
      this.game.basedCount, [...this.game.discovered], [...this.game.discoveredNPCs],
      Object.fromEntries(this.game.capturedByType),
      this.game.combat.basedCows().map((c: any) => c.type.id),
      this.game.coins, Object.fromEntries(this.game.inventory.items)
    );
  }

  async loadPlacedObjects() {
    if (!this.game.myToken) return;
    try {
      const res = await fetch(`/objects?token=${encodeURIComponent(this.game.myToken)}`);
      if (!res.ok) return;
      const data = (await res.json()) as PlacedObject[];
      for (const obj of data) {
        if (!this.game.placedObjects.find((o: PlacedObject) => o.id === obj.id)) {
          this.game.placedObjects.push(obj);
        }
      }
    } catch { /* ignore */ }
  }

  craftMachado() {
    const stone = this.inventoryItems.get("stone") ?? 0;
    if (stone < 5 || this.coins < 50) return;
    if (this.slotCount() >= MAX_INVENTORY_SLOTS) return;
    this.inventoryItems.set("stone", stone - 5);
    if ((this.inventoryItems.get("stone") ?? 0) === 0) this.inventoryItems.delete("stone");
    this.game.coins -= 50;
    this.inventoryItems.set("machado", 1);
  }

  slotCount(): number {
    return this.game.inventory.slotCount?.() ?? this.game.inventory.items.size;
  }

  nearestBench(): PlacedObject | null {
    const BENCH_INTERACT_DIST = 2;
    let best: PlacedObject | null = null;
    let bd = Infinity;
    for (const obj of this.game.placedObjects) {
      const d = Math.hypot(this.game.player.col - obj.col, this.game.player.row - obj.row);
      if (d < BENCH_INTERACT_DIST && d < bd) {
        bd = d;
        best = obj;
      }
    }
    return best;
  }
}

const MAX_INVENTORY_SLOTS = 50;
