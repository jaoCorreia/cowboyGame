import { Game } from "./game";
import { initAuth } from "./auth";
import { initMusic } from "./music";

const canvas = document.getElementById("game") as HTMLCanvasElement;

// Injeta token vindo de redirect OAuth ou magic link antes do initAuth
const _sessionParam = new URLSearchParams(location.search).get("session");
if (_sessionParam) {
  localStorage.setItem("cowboy_token", _sessionParam);
  history.replaceState(null, "", location.pathname);
}

// Exibe erros de OAuth na tela (ex: link expirado)
const _errorParam = new URLSearchParams(location.search).get("error");
if (_errorParam) {
  history.replaceState(null, "", location.pathname);
}

initMusic(); // starts on first user gesture, survives game restarts

const preview = new Game(canvas, null);
const userData = await initAuth(_errorParam ?? undefined);
preview.destroy();
const game = new Game(canvas, userData);

// Trata retorno do MercadoPago
const paymentParam = new URLSearchParams(location.search).get("payment");
if (paymentParam) {
  history.replaceState(null, "", location.pathname);
  if (paymentParam === "success") {
    // O servidor já creditou via webhook; o WS notificará via payment_success.
    // Mostramos mensagem no chat imediatamente para feedback visual.
    game.addSystemMessage("✅ Pagamento confirmado! Suas moedas serão creditadas em instantes.");
  } else if (paymentParam === "cancelled") {
    game.addSystemMessage("❌ Pagamento cancelado.");
  }
}
