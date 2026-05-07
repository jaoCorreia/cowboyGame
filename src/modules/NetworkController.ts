import { Network, type RemotePlayer, type ChatMessage } from "../network";

export class NetworkController {
  private network?: Network;
  private moveSendTimer = 0;

  constructor(private game: any) {}

  connect() {
    if (this.game.isPreview || !this.game.userData) return;

    this.network = new Network();
    this.network.connect(this.game.myToken, {
      onInit: (id: string, _color: string, _name: string, existing: RemotePlayer[], birthdayCount: number) => {
        this.game.myId = id;
        this.game.events.birthdayParabensCount = birthdayCount;
        for (const p of existing) this.spawnRemotePlayer(p);
      },
      onJoin: (p: RemotePlayer) => this.spawnRemotePlayer(p),
      onMove: (u: any) => {
        const entity = this.game.remotePlayerEntities.get(u.id);
        if (entity !== undefined) {
          const pos = this.game.worldState.get(entity, this.game.ecsPosition);
          if (pos) { pos.col = u.col; pos.row = u.row; }
        }
      },
      onLeave: (id: string) => {
        const entity = this.game.remotePlayerEntities.get(id);
        if (entity !== undefined) {
          this.game.worldState.destroy(entity);
          this.game.remotePlayerEntities.delete(id);
        }
      },
      onCowBased: (batch: any) => {
        if (batch.id === this.game.myId) {
          const localBased = this.game.combat.basedCows().sort((a: any, b: any) => a.herdIndex - b.herdIndex);
          batch.cows.forEach((pos: any, i: number) => {
            if (localBased[i]) { localBased[i]!.col = pos.col; localBased[i]!.row = pos.row; }
          });
        } else {
          this.game.remoteCowsInBase.set(batch.id, { color: batch.color, cows: batch.cows });
        }
      },
      onChat: (msg: ChatMessage) => {
        this.game._pushChat?.({ ...msg, time: Date.now() });
      },
      onKicked: () => {
        localStorage.removeItem("cowboy_token");
        alert("Sua conta foi acessada em outro dispositivo. Você foi desconectado.");
        location.reload();
      },
      onTradeOffer: (offer: any) => {
        this.game.trade?.onIncomingOffer?.(offer);
      },
      onTradeAccepted: () => {
        if (this.game.trade?.offerItem) {
          const cur = this.game.inventory.items.get(this.game.trade.offerItem.id) ?? 0;
          if (cur <= 1) this.game.inventory.items.delete(this.game.trade.offerItem.id);
          else this.game.inventory.items.set(this.game.trade.offerItem.id, cur - 1);
        }
        this.game.trade!.state = "result";
        this.game.trade!.resultMsg = "✅ Troca realizada!";
        this.game.trade!.resultTimer = 2.5;
        this.game.trade!.offerItem = null;
        this.game._refreshInventoryPanel?.();
      },
      onTradeDeclined: () => {
        this.game.trade!.state = "result";
        this.game.trade!.resultMsg = "❌ Troca recusada.";
        this.game.trade!.resultTimer = 2.0;
        this.game.trade!.offerItem = null;
        this.game._refreshInventoryPanel?.();
      },
      onPaymentSuccess: (coins: number) => {
        this.game.coins += coins;
        this.game._pushChat?.({ id: "system", name: "⚙ Sistema", color: "#FFD700", text: `🎉 Pagamento recebido! +${coins} moedas`, time: Date.now() });
      },
    });

    this.game.crafting?.loadPlacedObjects?.();
  }

  update(dt: number) {
    if (!this.network || this.game.isPreview) return;
    this.moveSendTimer -= dt;
    if (this.moveSendTimer > 0) return;
    this.moveSendTimer = 0.1;
    this.sendMove(
      this.game.player.col,
      this.game.player.row,
      this.game.player.dirCol,
      this.game.player.dirRow,
      this.game.player.moving,
      this.game.combat?.herdCows?.().length ?? 0,
    );
  }

  destroy() {
    this.network?.disconnect();
    this.network = undefined;
  }

  private spawnRemotePlayer(p: RemotePlayer) {
    const existing = this.game.remotePlayerEntities.get(p.id);
    if (existing !== undefined) this.game.worldState.destroy(existing);

    const { RemotePlayerData, NetworkId, Position } = require("../components");
    const entity = this.game.worldState.create();
    const data = new RemotePlayerData();
    data.dirCol = p.dirCol;
    data.dirRow = p.dirRow;
    data.moving = p.moving;
    data.color = p.color;
    data.name = p.name;
    data.herdCount = p.herdCount;
    data.lastMessage = p.lastMessage;
    data.lastMessageTime = p.lastMessageTime;

    this.game.worldState.add(entity, new Position(p.col, p.row));
    this.game.worldState.add(entity, new NetworkId(p.id));
    this.game.worldState.add(entity, data);
    this.game.remotePlayerEntities.set(p.id, entity);
  }

  sendChat(text: string) {
    this.network?.sendChat(text);
  }

  sendMove(col: number, row: number, dirCol: number, dirRow: number, moving: boolean, herdCount: number) {
    this.network?.sendMove(col, row, dirCol, dirRow, moving, herdCount);
  }

  sendSave(basedCount: number, discovered: string[], discoveredNPCs: string[], capturedByType: Record<string, number>, basedCowTypes: string[], coins: number, inventory: Record<string, number>) {
    this.network?.sendSave(basedCount, discovered, discoveredNPCs, capturedByType, basedCowTypes, coins, inventory);
  }

  sendCowBased(types: string[]) {
    this.network?.sendCowBased(types);
  }

  sendTreeChop(col: number, row: number) {
    this.network?.sendTreeChop?.(col, row);
  }

  sendTradeOffer(playerId: string, itemId: string, level: number) {
    this.network?.sendTradeOffer?.(playerId, itemId, level);
  }

  sendTradeAccept(fromId: string) {
    this.network?.sendTradeAccept?.(fromId);
  }

  sendTradeDecline(fromId: string) {
    this.network?.sendTradeDecline?.(fromId);
  }

  sendBirthdayParabens() {
    this.network?.sendBirthdayParabens?.();
  }
}
