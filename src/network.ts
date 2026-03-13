export interface RemotePlayer {
  id: string;
  col: number;
  row: number;
  dirCol: number;
  dirRow: number;
  moving: boolean;
  color: string;
  name: string;
  herdCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
}

export interface ChatMessage {
  id: string;
  name: string;
  color: string;
  text: string;
}

export interface BasedCowBatch {
  id: string;
  color: string;
  cows: Array<{ col: number; row: number }>;
}

export interface TradeOffer {
  fromId: string;
  fromName: string;
  fromColor: string;
  itemId: string;
  level: number;
}

export interface PlacedObject {
  id: string;
  type: "bancada_individual" | "bancada_comunitaria";
  owner: string;
  ownerColor: string;
  col: number;
  row: number;
}

type MoveUpdate = Pick<
  RemotePlayer,
  "id" | "col" | "row" | "dirCol" | "dirRow" | "moving" | "herdCount"
>;

type Callbacks = {
  onInit(
    myId: string,
    myColor: string,
    myName: string,
    existing: RemotePlayer[],
  ): void;
  onJoin(player: RemotePlayer): void;
  onMove(update: MoveUpdate): void;
  onLeave(id: string): void;
  onChat?(msg: ChatMessage): void;
  onCowBased?(batch: BasedCowBatch): void;
  onKicked?(): void;
  onTradeOffer?(offer: TradeOffer): void;
  onTradeAccepted?(fromId: string): void;
  onTradeDeclined?(fromId: string): void;
  onObjectPlaced?(obj: PlacedObject): void;
  onObjectRemoved?(id: string): void;
  onTreeChopped?(pos: { col: number; row: number }): void;
  onTreeRegrown?(pos: { col: number; row: number }): void;
  onChoppedTreesInit?(trees: Array<{ col: number; row: number }>): void;
};

export class Network {
  private ws: WebSocket | null = null;
  private ready = false;

  connect(token: string, callbacks: Callbacks) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(
      `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`,
    );

    this.ws.onopen = () => {
      this.ready = true;
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        switch (msg.type) {
          case "init":
            callbacks.onInit(msg.id, msg.color, msg.name, msg.players);
            if (msg.basedCows && callbacks.onCowBased) {
              for (const batch of msg.basedCows) callbacks.onCowBased(batch);
            }
            if (msg.communityBenches && callbacks.onObjectPlaced) {
              for (const b of msg.communityBenches) {
                callbacks.onObjectPlaced({
                  id: b.id,
                  type: b.objectType,
                  owner: b.owner,
                  ownerColor: b.ownerColor,
                  col: b.col,
                  row: b.row,
                });
              }
            }
            if (msg.choppedTrees && callbacks.onChoppedTreesInit) {
              callbacks.onChoppedTreesInit(msg.choppedTrees);
            }
            break;
          case "join":
            callbacks.onJoin(msg.player);
            break;
          case "move":
            callbacks.onMove(msg);
            break;
          case "leave":
            callbacks.onLeave(msg.id);
            break;
          case "chat":
            callbacks.onChat?.({
              id: msg.id,
              name: msg.name,
              color: msg.color,
              text: msg.text,
            });
            break;
          case "cow_based":
            callbacks.onCowBased?.({
              id: msg.id,
              color: msg.color,
              cows: msg.cows,
            });
            break;
          case "kicked":
            callbacks.onKicked?.();
            break;
          case "trade_offer":
            callbacks.onTradeOffer?.({
              fromId: msg.fromId,
              fromName: msg.fromName,
              fromColor: msg.fromColor,
              itemId: msg.itemId,
              level: msg.level,
            });
            break;
          case "trade_accepted":
            callbacks.onTradeAccepted?.(msg.fromId);
            break;
          case "trade_declined":
            callbacks.onTradeDeclined?.(msg.fromId);
            break;
          case "object_placed":
            callbacks.onObjectPlaced?.({
              id: msg.id,
              type: msg.objectType,
              owner: msg.owner,
              ownerColor: msg.ownerColor,
              col: msg.col,
              row: msg.row,
            });
            break;
          case "object_removed":
            callbacks.onObjectRemoved?.(msg.id);
            break;
          case "tree_chop":
            callbacks.onTreeChopped?.({ col: msg.col, row: msg.row });
            break;
          case "tree_regrow":
            callbacks.onTreeRegrown?.({ col: msg.col, row: msg.row });
            break;
        }
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      this.ready = false;
    };
    this.ws.onerror = () => {
      this.ready = false;
    };
  }

  sendMove(
    col: number,
    row: number,
    dirCol: number,
    dirRow: number,
    moving: boolean,
    herdCount: number,
  ) {
    if (!this.ready || !this.ws) return;
    this.ws.send(
      JSON.stringify({
        type: "move",
        col,
        row,
        dirCol,
        dirRow,
        moving,
        herdCount,
      }),
    );
  }

  sendCowBased(typeIds: string[]) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "cow_based", typeIds }));
  }

  sendChat(text: string) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "chat", text }));
  }

  sendSave(
    basedCount: number,
    discovered: string[],
    discoveredNPCs: string[],
    capturedByType: Record<string, number>,
    basedCowTypes: string[],
    coins: number,
    inventory: Record<string, number>,
  ) {
    if (!this.ready || !this.ws) return;
    this.ws.send(
      JSON.stringify({
        type: "save",
        basedCount,
        discovered,
        discoveredNPCs,
        capturedByType,
        basedCowTypes,
        coins,
        inventory,
      }),
    );
  }

  sendTradeOffer(toId: string, itemId: string, level: number) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "trade_offer", toId, itemId, level }));
  }

  sendTradeAccept(fromId: string) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "trade_accept", fromId }));
  }

  sendTradeDecline(fromId: string) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "trade_decline", fromId }));
  }

  sendTreeChop(col: number, row: number) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "tree_chop", col, row }));
  }
}
