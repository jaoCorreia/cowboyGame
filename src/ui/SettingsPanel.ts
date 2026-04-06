import type { UserData } from "../auth";
import { linkEmail, logout } from "../auth";
import { isMusicEnabled, toggleMusic } from "../music";

const STYLE = {
  overlay: [
    "position:fixed;inset:0;z-index:300",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.6);backdrop-filter:blur(3px)",
  ].join(";"),
  panel: [
    "width:320px;max-height:90vh;overflow-y:auto",
    "background:#2a1606;border:4px solid #9b7e57",
    "box-shadow:0 0 0 2px #836344,0 8px 32px rgba(0,0,0,.85)",
    "color:#FFE0A0;font-family:sans-serif;padding:0",
    "box-sizing:border-box",
  ].join(";"),
  section: "padding:14px 20px;border-bottom:1px solid #4a3018",
  label: "font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px",
  btn: [
    "display:block;width:100%;padding:9px 12px;box-sizing:border-box",
    "background:#3a2208;border:2px solid #9b7e57;color:#FFE0A0",
    "font-size:12px;cursor:pointer;text-align:left;margin-bottom:6px",
  ].join(";"),
  btnPrimary: [
    "display:block;width:100%;padding:9px 12px;box-sizing:border-box",
    "background:#9b6218;border:2px solid #e0a840;color:#FFD700",
    "font-size:12px;font-weight:bold;cursor:pointer;text-align:center",
  ].join(";"),
  btnDanger: [
    "display:block;width:100%;padding:9px 12px;box-sizing:border-box",
    "background:#5a1010;border:2px solid #c04040;color:#FF8080",
    "font-size:12px;cursor:pointer;text-align:left",
  ].join(";"),
  input: [
    "width:100%;padding:7px 9px;box-sizing:border-box;margin-bottom:8px",
    "background:#1a0a02;border:2px solid #9b7e57;color:#FFE0A0",
    "font-size:12px;outline:none",
  ].join(";"),
};

function avatar(username: string, color: string, size = 56): string {
  const letter = username[0]?.toUpperCase() ?? "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
      font-family="sans-serif" font-size="${size * 0.44}" font-weight="bold" fill="#fff">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function openSubModal(id: string, content: string): void {
  document.getElementById(id)?.remove();
  const SUB_STYLE = [
    "position:fixed;inset:0;z-index:400",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,0.7)",
  ].join(";");
  const PANEL_STYLE = [
    "width:min(480px,calc(100vw - 32px));max-height:88vh;overflow-y:auto",
    "background:#2a1606;border:3px solid #9b7e57",
    "box-shadow:0 0 0 2px #4a3018,0 8px 32px rgba(0,0,0,.9)",
    "color:#FFE0A0;font-family:sans-serif;box-sizing:border-box",
    "scrollbar-width:thin;scrollbar-color:#4a3018 #1a0a02",
  ].join(";");
  const ov = document.createElement("div");
  ov.id = id;
  ov.style.cssText = SUB_STYLE;
  ov.innerHTML = `<div style="${PANEL_STYLE}">${content}</div>`;
  document.body.appendChild(ov);
  const closeBtn = ov.querySelector("#_sub_close") as HTMLButtonElement | null;
  closeBtn?.addEventListener("click", () => ov.remove());
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
}

function openCommandsModal(): void {
  const HEADER = [
    "display:flex;align-items:center;justify-content:space-between",
    "padding:12px 16px;background:#1a0a02;border-bottom:1px solid #4a3018",
  ].join(";");
  const CLOSE_BTN = "background:none;border:none;color:#9b7e57;font-size:20px;cursor:pointer;line-height:1;padding:0";
  const SECTION = "padding:12px 16px;border-bottom:1px solid #4a3018";
  const LABEL = "font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px";
  const ROW = "display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(74,48,24,0.3)";
  const KEY = "font-size:11px;padding:2px 8px;background:#1a0a02;border:1px solid #4a3018;color:#FFD700;border-radius:2px;font-family:monospace;white-space:nowrap";
  const DESC = "font-size:12px;color:#FFE0A0";

  const pcCommands = [
    ["W A S D", "Mover"],
    ["E / Espaço", "Interagir / Laçar"],
    ["I", "Inventário"],
    ["B", "Livro / Coleção"],
    ["T", "Iniciar troca"],
    ["Q", "Abrir bancada (próximo)"],
    ["Esc", "Fechar painel / cancelar"],
    ["Enter", "Abrir / enviar chat"],
  ];

  const mobileCommands = [
    ["Joystick", "Mover o personagem"],
    ["Botão Ação", "Interagir / Laçar / Depositar"],
    ["🎒", "Abrir inventário"],
    ["📖", "Abrir livro / coleção"],
    ["⚙", "Abrir configurações"],
  ];

  const pcRows = pcCommands.map(([k, d]) =>
    `<div style="${ROW}"><span style="${DESC}">${d}</span><span style="${KEY}">${k}</span></div>`
  ).join("");

  const mobileRows = mobileCommands.map(([k, d]) =>
    `<div style="${ROW}"><span style="${DESC}">${d}</span><span style="${KEY}">${k}</span></div>`
  ).join("");

  openSubModal("_commands_modal", `
    <div style="${HEADER}">
      <span style="color:#FFD700;font-size:15px;font-weight:bold;letter-spacing:1px">📋 Comandos</span>
      <button id="_sub_close" style="${CLOSE_BTN}">✕</button>
    </div>
    <div style="${SECTION}">
      <div style="${LABEL}">💻 Teclado (PC)</div>
      ${pcRows}
    </div>
    <div style="${SECTION}">
      <div style="${LABEL}">📱 Mobile</div>
      ${mobileRows}
    </div>
  `);
}

function openCreditsModal(): void {
  const HEADER = [
    "display:flex;align-items:center;justify-content:space-between",
    "padding:12px 16px;background:#1a0a02;border-bottom:1px solid #4a3018",
  ].join(";");
  const CLOSE_BTN = "background:none;border:none;color:#9b7e57;font-size:20px;cursor:pointer;line-height:1;padding:0";
  const SECTION = "padding:14px 16px;border-bottom:1px solid #4a3018";
  const ITEM = "margin-bottom:10px";
  const NAME = "font-size:13px;font-weight:bold;color:#FFD700";
  const SUB = "font-size:11px;color:#9b7e57;margin-top:2px";

  openSubModal("_credits_modal", `
    <div style="${HEADER}">
      <span style="color:#FFD700;font-size:15px;font-weight:bold;letter-spacing:1px">🎨 Créditos</span>
      <button id="_sub_close" style="${CLOSE_BTN}">✕</button>
    </div>
    <div style="${SECTION}">
      <div style="font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Desenvolvimento</div>
      <div style="${ITEM}">
        <div style="${NAME}">João Carlos</div>
        <div style="${SUB}">Game design, programação e arte</div>
      </div>
    </div>
    <div style="${SECTION}">
      <div style="font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Assets</div>
      <div style="${ITEM}">
        <div style="${NAME}">CraftPix.net</div>
        <div style="${SUB}">UI / HUD elements (Free RPG UI Pack)</div>
      </div>
      <div style="${ITEM}">
        <div style="${NAME}">OpenGameArt.org</div>
        <div style="${SUB}">Sprites e tilesets</div>
      </div>
    </div>
    <div style="${SECTION}">
      <div style="font-size:11px;color:#9b7e57;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Tecnologias</div>
      <div style="${ITEM}">
        <div style="${NAME}">Bun</div>
        <div style="${SUB}">Runtime e bundler</div>
      </div>
      <div style="${ITEM}">
        <div style="${NAME}">TypeScript + Canvas 2D</div>
        <div style="${SUB}">Lógica e renderização do jogo</div>
      </div>
      <div style="${ITEM}">
        <div style="${NAME}">MongoDB</div>
        <div style="${SUB}">Persistência de dados</div>
      </div>
    </div>
    <div style="padding:14px 16px;text-align:center;font-size:11px;color:#4a3018">
      🤠 Feito com carinho — Cowboy Game © 2025
    </div>
  `);
}

export function openSettingsPanel(userData: UserData, onMusicChange: () => void): void {
  // Remove painel anterior se existir
  document.getElementById("_settings_panel")?.remove();

  const ov = document.createElement("div");
  ov.id = "_settings_panel";
  ov.style.cssText = STYLE.overlay;

  ov.innerHTML = `
<div style="${STYLE.panel}">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#1a0a02">
    <span style="color:#FFD700;font-size:15px;font-weight:bold;letter-spacing:1px">⚙ Configurações</span>
    <button id="_sc" style="background:none;border:none;color:#9b7e57;font-size:20px;cursor:pointer;line-height:1">✕</button>
  </div>

  <!-- Perfil -->
  <div style="${STYLE.section}">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="position:relative;flex-shrink:0">
        <img id="_av" src="${avatar(userData.username, userData.color)}" width="56" height="56" style="border-radius:50%;border:2px solid #9b7e57;display:block"/>
        <label for="_av_input" title="Alterar foto" style="
          position:absolute;bottom:-2px;right:-2px;
          width:20px;height:20px;border-radius:50%;
          background:#9b6218;border:2px solid #e0a840;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;cursor:pointer;line-height:1
        ">📷</label>
        <input id="_av_input" type="file" accept="image/*" style="display:none"/>
      </div>
      <div>
        <div style="font-size:15px;font-weight:bold;color:#FFD700">${userData.username}</div>
        <div id="_email_display" style="font-size:11px;color:#9b7e57;margin-top:2px">carregando...</div>
        <div id="_av_msg" style="font-size:10px;min-height:14px;margin-top:2px"></div>
      </div>
    </div>
  </div>

  <!-- Preferências -->
  <div style="${STYLE.section}">
    <div style="${STYLE.label}">Preferências</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px">🎵 Música</span>
      <button id="_music_toggle" style="
        padding:5px 14px;border:2px solid #9b7e57;cursor:pointer;font-size:12px;font-weight:bold;
        background:${isMusicEnabled() ? "#3a6618" : "#3a2208"};
        color:${isMusicEnabled() ? "#7FFF00" : "#9b7e57"}
      ">${isMusicEnabled() ? "LIGADA" : "DESLIGADA"}</button>
    </div>
  </div>

  <!-- Contas vinculadas -->
  <div style="${STYLE.section}">
    <div style="${STYLE.label}">Contas vinculadas</div>
    <div id="_providers_section">
      <div style="color:#9b7e57;font-size:12px">carregando...</div>
    </div>
  </div>

  <!-- Segurança -->
  <div style="${STYLE.section}">
    <div style="${STYLE.label}">Segurança</div>
    <div id="_security_section">
      <button id="_change_pw_btn" style="${STYLE.btn}">🔑 Alterar senha</button>
      <button id="_link_email_btn" style="${STYLE.btn}">✉ Vincular / alterar email</button>
    </div>
    <div id="_change_pw_form" style="display:none;margin-top:8px">
      <input id="_curr_pw" type="password" placeholder="Senha atual (deixe vazio se OAuth)" style="${STYLE.input}"/>
      <input id="_new_pw" type="password" placeholder="Nova senha (mín. 4 caracteres)" style="${STYLE.input}"/>
      <input id="_new_pw2" type="password" placeholder="Confirmar nova senha" style="${STYLE.input}"/>
      <button id="_save_pw" style="${STYLE.btnPrimary}">SALVAR SENHA</button>
      <div id="_pw_msg" style="margin-top:6px;font-size:12px;min-height:16px"></div>
    </div>
    <div id="_link_email_form" style="display:none;margin-top:8px">
      <input id="_email_input" type="email" placeholder="seu@email.com" style="${STYLE.input}"/>
      <button id="_save_email" style="${STYLE.btnPrimary}">ENVIAR CONFIRMAÇÃO</button>
      <div id="_email_msg" style="margin-top:6px;font-size:12px;min-height:16px"></div>
    </div>
  </div>

  <!-- Ajuda -->
  <div style="${STYLE.section}">
    <div style="${STYLE.label}">Ajuda</div>
    <button id="_cmds_btn" style="${STYLE.btn}">📋 Comandos</button>
    <button id="_credits_btn" style="${STYLE.btn}">🎨 Créditos</button>
  </div>

  <!-- Logout -->
  <div style="padding:14px 20px">
    <button id="_logout_btn" style="${STYLE.btnDanger}">🚪 Sair da conta</button>
  </div>

</div>`;

  document.body.appendChild(ov);

  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#_sc")!.addEventListener("click", close);

  // ── Música ──────────────────────────────────────────────────────────────────
  const musicBtn = ov.querySelector("#_music_toggle") as HTMLButtonElement;
  musicBtn.addEventListener("click", () => {
    toggleMusic();
    const on = isMusicEnabled();
    musicBtn.textContent = on ? "LIGADA" : "DESLIGADA";
    musicBtn.style.background = on ? "#3a6618" : "#3a2208";
    musicBtn.style.color = on ? "#7FFF00" : "#9b7e57";
    onMusicChange();
  });

  // ── Alterar senha ───────────────────────────────────────────────────────────
  const changePwBtn = ov.querySelector("#_change_pw_btn") as HTMLButtonElement;
  const changePwForm = ov.querySelector("#_change_pw_form") as HTMLElement;
  const pwMsg = ov.querySelector("#_pw_msg") as HTMLElement;
  changePwBtn.addEventListener("click", () => {
    changePwForm.style.display = changePwForm.style.display === "none" ? "block" : "none";
  });
  ov.querySelector("#_save_pw")!.addEventListener("click", async () => {
    const curr = (ov.querySelector("#_curr_pw") as HTMLInputElement).value;
    const nw = (ov.querySelector("#_new_pw") as HTMLInputElement).value;
    const nw2 = (ov.querySelector("#_new_pw2") as HTMLInputElement).value;
    pwMsg.style.color = "#FF5533";
    if (nw !== nw2) { pwMsg.textContent = "As senhas não conferem."; return; }
    if (nw.length < 4) { pwMsg.textContent = "Mínimo 4 caracteres."; return; }
    const res = await fetch("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: userData.token, currentPassword: curr || undefined, newPassword: nw }),
    }).then(r => r.json()) as { ok?: boolean; error?: string };
    if (res.error) { pwMsg.textContent = res.error; return; }
    pwMsg.style.color = "#55c876";
    pwMsg.textContent = "Senha alterada com sucesso!";
    (ov.querySelector("#_curr_pw") as HTMLInputElement).value = "";
    (ov.querySelector("#_new_pw") as HTMLInputElement).value = "";
    (ov.querySelector("#_new_pw2") as HTMLInputElement).value = "";
  });

  // ── Vincular email ──────────────────────────────────────────────────────────
  const linkEmailBtn = ov.querySelector("#_link_email_btn") as HTMLButtonElement;
  const linkEmailForm = ov.querySelector("#_link_email_form") as HTMLElement;
  const emailMsg = ov.querySelector("#_email_msg") as HTMLElement;
  linkEmailBtn.addEventListener("click", () => {
    linkEmailForm.style.display = linkEmailForm.style.display === "none" ? "block" : "none";
  });
  ov.querySelector("#_save_email")!.addEventListener("click", async () => {
    const email = (ov.querySelector("#_email_input") as HTMLInputElement).value.trim();
    emailMsg.style.color = "#FF5533";
    if (!email.includes("@")) { emailMsg.textContent = "Email inválido."; return; }
    const res = await linkEmail(userData.token, email);
    if (res.error) { emailMsg.textContent = res.error; return; }
    emailMsg.style.color = "#55c876";
    emailMsg.textContent = "Confirmação enviada! Verifique seu email.";
    (ov.querySelector("#_email_display") as HTMLElement).textContent = email + " (verificação pendente)";
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  ov.querySelector("#_logout_btn")!.addEventListener("click", () => {
    if (confirm("Sair da conta?")) logout();
  });

  // ── Avatar upload ────────────────────────────────────────────────────────────
  const avInput = ov.querySelector("#_av_input") as HTMLInputElement;
  const avImg = ov.querySelector("#_av") as HTMLImageElement;
  const avMsg = ov.querySelector("#_av_msg") as HTMLElement;
  avInput.addEventListener("change", async () => {
    const file = avInput.files?.[0];
    if (!file) return;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = async () => {
      // Center-crop to square
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, 128, 128);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      avMsg.style.color = "#9b7e57";
      avMsg.textContent = "Enviando...";
      const res = await fetch("/auth/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: userData.token, dataUrl }),
      }).then(r => r.json()) as { ok?: boolean; error?: string };
      if (res.error) {
        avMsg.style.color = "#FF5533";
        avMsg.textContent = res.error;
      } else {
        avImg.src = dataUrl;
        avMsg.style.color = "#55c876";
        avMsg.textContent = "Foto atualizada!";
      }
    };
    img.src = URL.createObjectURL(file);
  });

  // ── Carregar perfil (provedores vinculados, email, avatar) ───────────────────
  fetch(`/auth/profile?token=${userData.token}`)
    .then(r => r.json())
    .then((profile: { email?: string | null; hasPassword?: boolean; googleLinked?: boolean; githubLinked?: boolean; avatarUrl?: string | null }) => {
      // Avatar
      if (profile.avatarUrl) avImg.src = profile.avatarUrl;

      // Email display
      const emailDisplay = ov.querySelector("#_email_display") as HTMLElement;
      emailDisplay.textContent = profile.email
        ? profile.email
        : "nenhum email vinculado";

      // Provedores
      const sec = ov.querySelector("#_providers_section") as HTMLElement;
      sec.innerHTML = "";

      const addProvider = (name: string, icon: string, linked: boolean, provider: "google" | "github") => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
        row.innerHTML = `
          <span style="font-size:13px">${icon} ${name}</span>
          <span id="_prov_${provider}_status" style="font-size:11px;color:${linked ? "#55c876" : "#9b7e57"}">
            ${linked ? "✓ vinculado" : "não vinculado"}
          </span>`;

        const actionBtn = document.createElement("button");
        if (linked) {
          actionBtn.textContent = "Desvincular";
          actionBtn.style.cssText = "padding:4px 10px;border:1px solid #c04040;background:#5a1010;color:#FF8080;font-size:11px;cursor:pointer";
          actionBtn.addEventListener("click", async () => {
            if (!confirm(`Desvincular ${name}?`)) return;
            const res = await fetch("/auth/unlink-provider", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: userData.token, provider }),
            }).then(r => r.json()) as { ok?: boolean; error?: string };
            if (res.error) { alert(res.error); return; }
            const status = ov.querySelector(`#_prov_${provider}_status`) as HTMLElement;
            status.textContent = "não vinculado";
            status.style.color = "#9b7e57";
            actionBtn.textContent = "Vincular";
            actionBtn.style.cssText = "padding:4px 10px;border:1px solid #9b7e57;background:#3a2208;color:#FFE0A0;font-size:11px;cursor:pointer";
            // Rebind para vincular
            actionBtn.onclick = () => startLink(provider);
          });
        } else {
          actionBtn.textContent = "Vincular";
          actionBtn.style.cssText = "padding:4px 10px;border:1px solid #9b7e57;background:#3a2208;color:#FFE0A0;font-size:11px;cursor:pointer";
          actionBtn.addEventListener("click", () => startLink(provider));
        }
        row.appendChild(actionBtn);
        sec.appendChild(row);
      };

      addProvider("Google", "🔵", !!profile.googleLinked, "google");
      addProvider("GitHub", "⚫", !!profile.githubLinked, "github");
    })
    .catch(() => {
      (ov.querySelector("#_providers_section") as HTMLElement).textContent = "Erro ao carregar.";
    });

  // ── Comandos ────────────────────────────────────────────────────────────────
  ov.querySelector("#_cmds_btn")!.addEventListener("click", () => {
    openCommandsModal();
  });

  // ── Créditos ────────────────────────────────────────────────────────────────
  ov.querySelector("#_credits_btn")!.addEventListener("click", () => {
    openCreditsModal();
  });

  // ── Link via popup ──────────────────────────────────────────────────────────
  function startLink(provider: "google" | "github") {
    const popup = window.open(
      `/auth/${provider}?link=${userData.token}`,
      "oauth_link",
      "width=520,height=620,menubar=no,toolbar=no,location=no",
    );
    if (!popup) { alert("Permita popups para vincular a conta."); return; }

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "linked") {
        window.removeEventListener("message", handler);
        popup.close();
        const status = ov.querySelector(`#_prov_${provider}_status`) as HTMLElement;
        if (status) { status.textContent = "✓ vinculado"; status.style.color = "#55c876"; }
      } else if (e.data?.type === "error") {
        window.removeEventListener("message", handler);
        alert("Erro ao vincular: " + (e.data.detail ?? ""));
      }
    };
    window.addEventListener("message", handler);
  }
}
