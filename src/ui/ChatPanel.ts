export interface ChatMsg {
  id: string;
  name: string;
  color: string;
  text: string;
  time: number;
}

export class ChatPanel {
  private el: HTMLElement;
  private msgList: HTMLElement;
  private input: HTMLInputElement;
  private _isOpen = false;
  private _onSend: ((text: string) => void) | null = null;
  private atBottom = true;

  constructor(initialMessages: ChatMsg[] = []) {
    const el = document.createElement("div");
    el.id = "_chat_panel";
    el.style.cssText = [
      "position:fixed;left:10px",
      "width:min(380px,calc(100vw - 20px))",
      "height:min(440px,calc(100dvh - 120px))",
      "bottom:95px",
      "display:none;flex-direction:column",
      "background:#2a1606",
      "border:3px solid #9b7e57",
      "box-shadow:0 0 0 2px #4a3018,0 6px 28px rgba(0,0,0,.85)",
      "z-index:50;font-family:sans-serif;box-sizing:border-box",
    ].join(";");

    el.innerHTML = `
<div style="
  display:flex;align-items:center;justify-content:space-between;
  padding:9px 14px;background:#1a0a02;
  border-bottom:1px solid #4a3018;flex-shrink:0
">
  <span style="color:#FFD700;font-size:13px;font-weight:bold;letter-spacing:1px">💬 Chat</span>
  <div style="display:flex;align-items:center;gap:10px">
    <span id="_chat_scroll_hint" style="color:#9b7e57;font-size:10px;display:none">▼ nova mensagem</span>
    <button id="_chat_close" style="
      background:none;border:none;color:#9b7e57;
      font-size:18px;cursor:pointer;line-height:1;padding:0
    ">✕</button>
  </div>
</div>

<div id="_chat_msgs" style="
  flex:1;overflow-y:auto;padding:10px 12px 4px;
  display:flex;flex-direction:column;gap:2px;
  scroll-behavior:smooth;
  scrollbar-width:thin;scrollbar-color:#4a3018 #1a0a02;
"></div>

<div style="
  padding:8px 10px;
  border-top:1px solid #4a3018;
  display:flex;gap:6px;flex-shrink:0;
  background:#1e0c02
">
  <input id="_chat_input" type="text" maxlength="200"
    placeholder="Mensagem... (Enter = enviar)"
    autocomplete="off"
    style="
      flex:1;padding:8px 10px;box-sizing:border-box;
      background:#130800;border:2px solid #9b7e57;
      color:#FFE0A0;font-size:12px;outline:none;
      border-radius:2px;
    "
  />
  <button id="_chat_send" style="
    padding:8px 13px;
    background:#9b6218;border:2px solid #e0a840;
    color:#FFD700;font-size:14px;cursor:pointer;
    flex-shrink:0;font-weight:bold;
  ">➤</button>
</div>`;

    document.body.appendChild(el);
    this.el = el;
    this.msgList = el.querySelector("#_chat_msgs")!;
    this.input = el.querySelector("#_chat_input")!;
    const scrollHint = el.querySelector("#_chat_scroll_hint") as HTMLElement;

    // ── Close ──────────────────────────────────────────────────────────────────
    el.querySelector("#_chat_close")!.addEventListener("click", () => this.close());

    // ── Send ───────────────────────────────────────────────────────────────────
    const send = () => {
      const text = this.input.value.trim();
      if (!text) return;
      this._onSend?.(text);
      this.input.value = "";
    };
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") send();
      else if (e.key === "Escape") this.close();
    });
    el.querySelector("#_chat_send")!.addEventListener("click", send);

    // ── Scroll tracking ────────────────────────────────────────────────────────
    this.msgList.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = this.msgList;
      this.atBottom = scrollHeight - scrollTop - clientHeight < 40;
      scrollHint.style.display = this.atBottom ? "none" : "block";
    });

    // ── Scroll hint → jump to bottom ──────────────────────────────────────────
    scrollHint.addEventListener("click", () => {
      this.msgList.scrollTop = this.msgList.scrollHeight;
      scrollHint.style.display = "none";
    });

    // Pre-populate with existing messages
    for (const m of initialMessages) this._appendRow(m);
    if (initialMessages.length) {
      this.msgList.scrollTop = this.msgList.scrollHeight;
    }
  }

  private _appendRow(msg: ChatMsg) {
    const isSystem = msg.name === "⚙ Sistema" || msg.id === "system";

    const row = document.createElement("div");
    row.style.cssText = [
      "display:flex;gap:7px;align-items:flex-start",
      "padding:4px 0;border-bottom:1px solid rgba(74,48,24,0.35)",
    ].join(";");

    // Dot de cor
    const dot = document.createElement("div");
    dot.style.cssText = `
      width:7px;height:7px;border-radius:50%;
      background:${msg.color};flex-shrink:0;margin-top:5px
    `;

    // Conteúdo
    const content = document.createElement("div");
    content.style.cssText = "flex:1;font-size:12px;line-height:1.5;word-break:break-word";

    if (isSystem) {
      content.style.color = "#FF8080";
      content.style.fontStyle = "italic";
      content.textContent = msg.text;
    } else {
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = `color:${msg.color};font-weight:bold`;
      nameSpan.textContent = msg.name + ": ";

      const textSpan = document.createElement("span");
      textSpan.style.color = "#FFE0A0";
      textSpan.textContent = msg.text;

      content.appendChild(nameSpan);
      content.appendChild(textSpan);
    }

    // Timestamp
    const ts = document.createElement("div");
    const d = new Date(msg.time);
    ts.style.cssText = "font-size:10px;color:#4a3018;flex-shrink:0;margin-top:3px;white-space:nowrap";
    ts.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    row.appendChild(dot);
    row.appendChild(content);
    row.appendChild(ts);
    this.msgList.appendChild(row);

    // Limite de 300 mensagens no DOM
    if (this.msgList.children.length > 300) {
      this.msgList.removeChild(this.msgList.firstChild!);
    }
  }

  addMessage(msg: ChatMsg) {
    this._appendRow(msg);
    if (this.atBottom) {
      requestAnimationFrame(() => {
        this.msgList.scrollTop = this.msgList.scrollHeight;
      });
    } else if (this._isOpen) {
      const hint = this.el.querySelector("#_chat_scroll_hint") as HTMLElement;
      hint.style.display = "block";
    }
  }

  open() {
    this._isOpen = true;
    this.el.style.display = "flex";
    requestAnimationFrame(() => {
      this.msgList.scrollTop = this.msgList.scrollHeight;
      this.atBottom = true;
      this.input.focus();
    });
  }

  close() {
    this._isOpen = false;
    this.el.style.display = "none";
  }

  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  get isOpen() { return this._isOpen; }

  onSend(cb: (text: string) => void) { this._onSend = cb; }

  destroy() { this.el.remove(); }
}
