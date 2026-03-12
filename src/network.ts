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

type MoveUpdate = Pick<RemotePlayer,
  'id' | 'col' | 'row' | 'dirCol' | 'dirRow' | 'moving' | 'herdCount'
>;

type Callbacks = {
  onInit(myId: string, myColor: string, myName: string, existing: RemotePlayer[]): void;
  onJoin(player: RemotePlayer): void;
  onMove(update: MoveUpdate): void;
  onLeave(id: string): void;
  onChat?(msg: ChatMessage): void;
  onCowBased?(batch: BasedCowBatch): void;
};

export class Network {
  private ws: WebSocket | null = null;
  private ready = false;

  connect(token: string, callbacks: Callbacks) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    this.ws.onopen = () => { this.ready = true; };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        switch (msg.type) {
          case 'init':
            callbacks.onInit(msg.id, msg.color, msg.name, msg.players);
            // Dispara onCowBased para cada lote já existente no curral
            if (msg.basedCows && callbacks.onCowBased) {
              for (const batch of msg.basedCows) callbacks.onCowBased(batch);
            }
            break;
          case 'join':  callbacks.onJoin(msg.player); break;
          case 'move':  callbacks.onMove(msg); break;
          case 'leave': callbacks.onLeave(msg.id); break;
          case 'chat':  callbacks.onChat?.({ id: msg.id, name: msg.name, color: msg.color, text: msg.text }); break;
          case 'cow_based': callbacks.onCowBased?.({ id: msg.id, color: msg.color, cows: msg.cows }); break;
        }
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => { this.ready = false; };
    this.ws.onerror = () => { this.ready = false; };
  }

  sendMove(
    col: number, row: number,
    dirCol: number, dirRow: number,
    moving: boolean,
    herdCount: number,
  ) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'move', col, row, dirCol, dirRow, moving, herdCount }));
  }

  sendCowBased(typeIds: string[]) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'cow_based', typeIds }));
  }

  sendChat(text: string) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'chat', text }));
  }

  sendSave(basedCount: number, discovered: string[], capturedByType: Record<string, number>, basedCowTypes: string[], coins: number, inventory: Record<string, number>) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: 'save', basedCount, discovered, capturedByType, basedCowTypes, coins, inventory }));
  }
}
