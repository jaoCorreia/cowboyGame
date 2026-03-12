import { Game } from "./game";
import { initAuth } from "./auth";
import { initMusic } from "./music";

const canvas = document.getElementById("game") as HTMLCanvasElement;

initMusic(); // starts on first user gesture, survives game restarts

const preview = new Game(canvas, null);
const userData = await initAuth();
preview.destroy();
new Game(canvas, userData);
