import { Game } from "./game";
import { initAuth } from "./auth";
import { initMusic } from "./music";

const canvas = document.getElementById("game") as HTMLCanvasElement;

initMusic(); // starts on first user gesture, survives game restarts

const preview = new Game(canvas, null);
const userData = await initAuth();
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
