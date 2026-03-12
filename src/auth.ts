// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface UserData {
  token: string;
  username: string;
  color: string;
  basedCount: number;
  discovered: string[];
  capturedByType: Record<string, number>;
  basedCows: string[]; // IDs dos tipos de vaca na base
  coins: number;
  inventory: Record<string, number>; // itemId → level
}

const TOKEN_KEY = "cowboy_token";

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

/** Tenta auto-login pelo token salvo; se falhar, exibe tela de login. */
export async function initAuth(): Promise<UserData> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    const data = await verifyToken(stored);
    if (data) return data;
  }
  return showLoginScreen();
}

// ─── Verificar token existente ────────────────────────────────────────────────

async function verifyToken(token: string): Promise<UserData | null> {
  try {
    const res = await fetch("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    const d = (await res.json()) as UserData;
    d.token = token;
    d.basedCows ??= [];
    return d;
  } catch {
    return null;
  }
}

// ─── Tela de login ────────────────────────────────────────────────────────────

function showLoginScreen(): Promise<UserData> {
  return new Promise((resolve) => {
    document.body.appendChild(buildOverlay(resolve));
  });
}

function buildOverlay(resolve: (d: UserData) => void): HTMLElement {
  const ov = document.createElement("div");
  ov.style.cssText = [
    "position:fixed;inset:0;z-index:200",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.55);backdrop-filter:blur(3px)",
  ].join(";");

  ov.innerHTML = `
<div id="_ap" style="
  width:300px;padding:28px 24px;
  background:#2a1606;border:4px solid #9b7e57;
  box-shadow:0 0 0 2px #836344,0 8px 32px rgba(0,0,0,.85);
  color:#FFE0A0;font-family:sans-serif;text-align:center
">
  <div style="font-size:38px;margin-bottom:6px"></div>
  <h2 style="margin:0 0 18px;color:#FFD700;font-size:20px;letter-spacing:1px">Jogo do Vaqueiro</h2>

  <div style="display:flex;border:2px solid #9b7e57;margin-bottom:16px">
    <button id="_tl" style="flex:1;padding:8px;border:none;cursor:pointer;
      background:#9b6218;color:#FFD700;font-weight:bold;font-size:12px">Entrar</button>
    <button id="_tr" style="flex:1;padding:8px;border:none;cursor:pointer;
      background:#3a2208;color:#C8A870;font-size:12px">Registrar</button>
  </div>

  <div style="text-align:left;margin-bottom:10px">
    <label style="font-size:11px;color:#C8A870;display:block;margin-bottom:3px">Usuário</label>
    <input id="_u" type="text" maxlength="20" autocomplete="username"
      style="width:100%;padding:7px 9px;box-sizing:border-box;
        background:#1a0a02;border:2px solid #9b7e57;color:#FFE0A0;
        font-size:13px;outline:none" />
  </div>

  <div style="text-align:left;margin-bottom:18px">
    <label style="font-size:11px;color:#C8A870;display:block;margin-bottom:3px">Senha</label>
    <input id="_p" type="password" maxlength="64" autocomplete="current-password"
      style="width:100%;padding:7px 9px;box-sizing:border-box;
        background:#1a0a02;border:2px solid #9b7e57;color:#FFE0A0;
        font-size:13px;outline:none" />
  </div>

  <button id="_sb" style="
    width:100%;padding:11px;border:3px solid #e0a840;
    background:#9b6218;color:#FFD700;font-size:14px;font-weight:bold;
    cursor:pointer;letter-spacing:1px">ENTRAR</button>

  <div id="_err" style="margin-top:12px;min-height:18px;color:#FF5533;font-size:12px"></div>
</div>`;

  let mode: "login" | "register" = "login";

  const tl = ov.querySelector("#_tl") as HTMLButtonElement;
  const tr = ov.querySelector("#_tr") as HTMLButtonElement;
  const sb = ov.querySelector("#_sb") as HTMLButtonElement;
  const ui = ov.querySelector("#_u") as HTMLInputElement;
  const pi = ov.querySelector("#_p") as HTMLInputElement;
  const err = ov.querySelector("#_err") as HTMLElement;

  const setMode = (m: typeof mode) => {
    mode = m;
    const A = "#9b6218",
      I = "#3a2208",
      AC = "#FFD700",
      IC = "#C8A870";
    tl.style.background = m === "login" ? A : I;
    tl.style.color = m === "login" ? AC : IC;
    tr.style.background = m === "register" ? A : I;
    tr.style.color = m === "register" ? AC : IC;
    sb.textContent = m === "login" ? "ENTRAR" : "REGISTRAR";
    err.textContent = "";
  };

  tl.addEventListener("click", () => setMode("login"));
  tr.addEventListener("click", () => setMode("register"));

  const submit = async () => {
    const username = ui.value.trim();
    const password = pi.value;
    if (!username || !password) {
      err.textContent = "Preencha usuário e senha.";
      return;
    }
    sb.disabled = true;
    sb.textContent = mode === "login" ? "Entrando…" : "Registrando…";
    err.textContent = "";
    try {
      const res = await fetch(`/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as UserData & { error?: string };
      data.basedCows ??= [];
      if (!res.ok || data.error) {
        err.textContent = data.error ?? "Erro desconhecido.";
        sb.disabled = false;
        sb.textContent = mode === "login" ? "ENTRAR" : "REGISTRAR";
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      ov.remove();
      resolve(data);
    } catch {
      err.textContent = "Erro de conexão.";
      sb.disabled = false;
      sb.textContent = mode === "login" ? "ENTRAR" : "REGISTRAR";
    }
  };

  sb.addEventListener("click", submit);
  pi.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  ui.addEventListener("keydown", (e) => {
    if (e.key === "Enter") pi.focus();
  });
  setTimeout(() => ui.focus(), 50);
  return ov;
}

// ─── Salvar estado ─────────────────────────────────────────────────────────────

export async function saveGameState(
  token: string,
  basedCount: number,
  discovered: string[],
  capturedByType: Record<string, number>,
  basedCowTypes: string[],
  coins: number,
  inventory: Record<string, number>,
): Promise<void> {
  try {
    await fetch("/auth/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, basedCount, discovered, capturedByType, basedCowTypes, coins, inventory }),
      keepalive: true, // garante entrega mesmo se a página fechar durante o request
    });
  } catch {
    /* silencioso */
  }
}
