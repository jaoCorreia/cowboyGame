// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface UserData {
  token: string;
  username: string;
  color: string;
  basedCount: number;
  discovered: string[];
  discoveredNPCs: string[];
  capturedByType: Record<string, number>;
  basedCows: string[]; // IDs dos tipos de vaca na base
  coins: number;
  inventory: Record<string, number>; // itemId → level
  isAdmin?: boolean;
  // campos de perfil (opcionais, populados pelo /auth/profile)
  email?: string | null;
  hasPassword?: boolean;
  googleLinked?: boolean;
  githubLinked?: boolean;
}

const TOKEN_KEY = "cowboy_token";

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

/** Tenta auto-login pelo token salvo; se falhar, exibe tela de login. */
export async function initAuth(oauthError?: string): Promise<UserData> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    const data = await verifyToken(stored);
    if (data) return data;
  }
  return showLoginScreen(oauthError);
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

function showLoginScreen(oauthError?: string): Promise<UserData> {
  return new Promise((resolve) => {
    document.body.appendChild(buildOverlay(resolve, oauthError));
  });
}

const OAUTH_ERROR_MSGS: Record<string, string> = {
  oauth_cancelled: "Login cancelado.",
  oauth_state_invalid: "Sessão expirada. Tente novamente.",
  oauth_token_failed: "Erro ao autenticar com o provedor.",
  oauth_no_id_token: "Erro ao obter dados do Google.",
  oauth_no_access_token: "Erro ao obter token do GitHub.",
  link_invalido: "Link inválido.",
  link_expirado: "Link expirado. Solicite um novo.",
};

function buildOverlay(resolve: (d: UserData) => void, oauthError?: string): HTMLElement {
  const ov = document.createElement("div");
  ov.style.cssText = [
    "position:fixed;inset:0;z-index:200",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.55);backdrop-filter:blur(3px)",
  ].join(";");

  const BTN_BASE = [
    "width:100%;padding:9px;box-sizing:border-box;margin-bottom:8px",
    "border:2px solid #9b7e57;cursor:pointer",
    "font-size:12px;font-weight:bold;letter-spacing:0.5px",
    "display:flex;align-items:center;justify-content:center;gap:8px",
  ].join(";");

  ov.innerHTML = `
<div id="_ap" style="
  width:300px;padding:28px 24px;
  background:#2a1606;border:4px solid #9b7e57;
  box-shadow:0 0 0 2px #836344,0 8px 32px rgba(0,0,0,.85);
  color:#FFE0A0;font-family:sans-serif;text-align:center;
  max-height:95vh;overflow-y:auto;box-sizing:border-box
">
  <div style="font-size:38px;margin-bottom:6px">🤠</div>
  <h2 style="margin:0 0 18px;color:#FFD700;font-size:20px;letter-spacing:1px">Jogo do Vaqueiro</h2>

  <!-- Tabs Entrar / Registrar -->
  <div id="_tabs" style="display:flex;border:2px solid #9b7e57;margin-bottom:14px">
    <button id="_tl" style="flex:1;padding:8px;border:none;cursor:pointer;
      background:#9b6218;color:#FFD700;font-weight:bold;font-size:12px">Entrar</button>
    <button id="_tr" style="flex:1;padding:8px;border:none;cursor:pointer;
      background:#3a2208;color:#C8A870;font-size:12px">Registrar</button>
  </div>

  <!-- Botões OAuth (ocultos no modo forgot) -->
  <div id="_oauth">
    <a id="_gg" href="/auth/google" style="${BTN_BASE};background:#1a3a6e;color:#e8f0fe;text-decoration:none">
      <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.4 30.2 0 24 0 14.7 0 6.8 5.4 2.9 13.3l7.8 6c1.8-5.4 6.9-9.8 13.3-9.8z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/><path fill="#FBBC05" d="M10.7 28.4A14.6 14.6 0 0 1 9.5 24c0-1.5.3-3 .7-4.4l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.2-6.4z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.4 0-11.8-4.3-13.7-10.1l-8.2 6.4C6.8 42.6 14.7 48 24 48z"/></svg>
      Entrar com Google
    </a>
    <a id="_gh" href="/auth/github" style="${BTN_BASE};background:#161b22;color:#e6edf3;text-decoration:none">
      <svg width="16" height="16" viewBox="0 0 98 96"><path fill="#e6edf3" d="M49 0C22 0 0 22 0 49c0 21.6 14 40 33.4 46.5 2.4.5 3.3-1.1 3.3-2.4v-8.5c-13.5 3-16.3-6.5-16.3-6.5-2.2-5.6-5.4-7.1-5.4-7.1-4.4-3 .3-3 .3-3 4.9.4 7.5 5 7.5 5 4.3 7.4 11.3 5.3 14.1 4 .4-3.1 1.7-5.3 3-6.5-10.8-1.2-22.1-5.4-22.1-24 0-5.3 1.9-9.6 5-13-.5-1.2-2.2-6.2.5-12.9 0 0 4.1-1.3 13.4 5 3.9-1.1 8-1.6 12.2-1.6 4.1 0 8.3.5 12.1 1.6 9.3-6.3 13.4-5 13.4-5 2.7 6.7 1 11.7.5 12.9 3.1 3.4 5 7.7 5 13 0 18.6-11.3 22.7-22.1 23.9 1.7 1.5 3.3 4.5 3.3 9v13.3c0 1.3.9 2.9 3.3 2.4C84 89 98 70.6 98 49 98 22 76 0 49 0z"/></svg>
      Entrar com GitHub
    </a>
    <div style="display:flex;align-items:center;gap:8px;margin:10px 0 12px">
      <div style="flex:1;height:1px;background:#9b7e57;opacity:.4"></div>
      <span style="font-size:11px;color:#9b7e57">ou</span>
      <div style="flex:1;height:1px;background:#9b7e57;opacity:.4"></div>
    </div>
  </div>

  <!-- Campo usuário / email -->
  <div style="text-align:left;margin-bottom:10px">
    <label id="_ul" style="font-size:11px;color:#C8A870;display:block;margin-bottom:3px">Usuário</label>
    <input id="_u" type="text" maxlength="40" autocomplete="username"
      style="width:100%;padding:7px 9px;box-sizing:border-box;
        background:#1a0a02;border:2px solid #9b7e57;color:#FFE0A0;
        font-size:13px;outline:none" />
  </div>

  <!-- Campo senha (oculto no modo forgot) -->
  <div id="_pw_wrap" style="text-align:left;margin-bottom:18px">
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

  <!-- Link esqueci senha (só no modo login) -->
  <div id="_fp_wrap" style="margin-top:10px">
    <button id="_fp" style="
      background:none;border:none;color:#C8A870;font-size:11px;
      cursor:pointer;text-decoration:underline;padding:0">
      Esqueci minha senha
    </button>
  </div>

  <div id="_err" style="margin-top:10px;min-height:18px;color:#FF5533;font-size:12px"></div>
  <div id="_ok" style="margin-top:10px;min-height:18px;color:#55c876;font-size:12px"></div>
</div>`;

  type Mode = "login" | "register" | "forgot";
  let mode: Mode = "login";

  const tl = ov.querySelector("#_tl") as HTMLButtonElement;
  const tr = ov.querySelector("#_tr") as HTMLButtonElement;
  const sb = ov.querySelector("#_sb") as HTMLButtonElement;
  const ui = ov.querySelector("#_u") as HTMLInputElement;
  const pi = ov.querySelector("#_p") as HTMLInputElement;
  const err = ov.querySelector("#_err") as HTMLElement;
  const ok = ov.querySelector("#_ok") as HTMLElement;
  const tabs = ov.querySelector("#_tabs") as HTMLElement;
  const oauthDiv = ov.querySelector("#_oauth") as HTMLElement;
  const pwWrap = ov.querySelector("#_pw_wrap") as HTMLElement;
  const fpWrap = ov.querySelector("#_fp_wrap") as HTMLElement;
  const fpBtn = ov.querySelector("#_fp") as HTMLButtonElement;
  const ulabel = ov.querySelector("#_ul") as HTMLLabelElement;

  if (oauthError) {
    err.textContent = OAUTH_ERROR_MSGS[oauthError] ?? "Erro de autenticação.";
  }

  const A = "#9b6218", I = "#3a2208", AC = "#FFD700", IC = "#C8A870";

  const setMode = (m: Mode) => {
    mode = m;
    err.textContent = "";
    ok.textContent = "";

    if (m === "forgot") {
      tabs.style.display = "none";
      oauthDiv.style.display = "none";
      pwWrap.style.display = "none";
      fpWrap.style.display = "none";
      ulabel.textContent = "Email cadastrado";
      ui.type = "email";
      ui.placeholder = "seu@email.com";
      sb.textContent = "ENVIAR LINK";
      sb.disabled = false;
      setTimeout(() => ui.focus(), 50);
      return;
    }

    tabs.style.display = "flex";
    oauthDiv.style.display = "block";
    pwWrap.style.display = "block";
    fpWrap.style.display = m === "login" ? "block" : "none";
    ulabel.textContent = "Usuário";
    ui.type = "text";
    ui.placeholder = "";
    tl.style.background = m === "login" ? A : I;
    tl.style.color = m === "login" ? AC : IC;
    tr.style.background = m === "register" ? A : I;
    tr.style.color = m === "register" ? AC : IC;
    sb.textContent = m === "login" ? "ENTRAR" : "REGISTRAR";
    sb.disabled = false;
    setTimeout(() => ui.focus(), 50);
  };

  tl.addEventListener("click", () => setMode("login"));
  tr.addEventListener("click", () => setMode("register"));
  fpBtn.addEventListener("click", () => setMode("forgot"));

  const submit = async () => {
    err.textContent = "";
    ok.textContent = "";

    if (mode === "forgot") {
      const email = ui.value.trim();
      if (!email || !email.includes("@")) {
        err.textContent = "Digite um email válido.";
        return;
      }
      sb.disabled = true;
      sb.textContent = "Enviando…";
      try {
        await fetch("/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        ok.textContent = "Se o email estiver cadastrado, você receberá um link em instantes.";
        sb.textContent = "REENVIAR";
        sb.disabled = false;
      } catch {
        err.textContent = "Erro de conexão.";
        sb.disabled = false;
        sb.textContent = "ENVIAR LINK";
      }
      return;
    }

    const username = ui.value.trim();
    const password = pi.value;
    if (!username || !password) {
      err.textContent = "Preencha usuário e senha.";
      return;
    }
    sb.disabled = true;
    sb.textContent = mode === "login" ? "Entrando…" : "Registrando…";
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
  pi.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  ui.addEventListener("keydown", (e) => { if (e.key === "Enter") mode === "forgot" ? submit() : pi.focus(); });
  setTimeout(() => ui.focus(), 50);
  return ov;
}

// ─── Comprar pacote premium ────────────────────────────────────────────────────

export async function buyPremium(token: string): Promise<void> {
  try {
    const res = await fetch("/mp/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const text = await res.text();
    let data: { url?: string; error?: string };
    try {
      data = JSON.parse(text) as { url?: string; error?: string };
    } catch {
      console.error("[MP] resposta não-JSON:", text);
      alert("Erro de servidor: " + text.slice(0, 200));
      return;
    }
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error ?? "Erro ao iniciar pagamento.");
    }
  } catch (err) {
    console.error("[MP] fetch error:", err);
    alert("Erro de conexão ao iniciar pagamento.");
  }
}

// ─── Vincular email ───────────────────────────────────────────────────────────

export async function linkEmail(token: string, email: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const res = await fetch("/auth/link-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email }),
    });
    return res.json() as Promise<{ ok?: boolean; error?: string }>;
  } catch {
    return { error: "Erro de conexão." };
  }
}

// ─── Logout ────────────────────────────────────────────────────────────────────

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

// ─── Salvar estado ─────────────────────────────────────────────────────────────

export async function saveGameState(
  token: string,
  basedCount: number,
  discovered: string[],
  discoveredNPCs: string[],
  capturedByType: Record<string, number>,
  basedCowTypes: string[],
  coins: number,
  inventory: Record<string, number>,
): Promise<void> {
  try {
    await fetch("/auth/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, basedCount, discovered, discoveredNPCs, capturedByType, basedCowTypes, coins, inventory }),
      keepalive: true, // garante entrega mesmo se a página fechar durante o request
    });
  } catch {
    /* silencioso */
  }
}
