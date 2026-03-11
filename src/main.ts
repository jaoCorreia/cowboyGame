import { Game } from "./game";
import { initAuth } from "./auth";

const canvas = document.getElementById("game") as HTMLCanvasElement;

// Inicia o jogo em modo preview (sem rede) para aparecer atrás da tela de login
const preview = new Game(canvas, null);

const userData = await initAuth();

// Login concluído: destrói o preview e inicia o jogo de verdade
preview.destroy();
new Game(canvas, userData);
