const CAKE_COL = 12;
const CAKE_ROW = 7;
const CAKE_INTERACT_DIST = 2.5;
const BIRTHDAY_MONTH = 3;
const BIRTHDAY_DAY_START = 10;
const BIRTHDAY_DAY_END = 31;

const PARABENS_MESSAGES = [
  "Que seus laços sejam eternamente certeiros e seu rebanho sempre lendário! 🐄🤠",
  "Que a vida te dê sempre mais do que o melhor bolo do sertão pode prometer! 🌵🎉",
  "Que cada dia seja uma nova vaca rara pra adicionar na sua coleção! 🌟🎂",
  "Que seus pastos sejam verdes, seu rebanho imenso e seus boletos inexistentes! 🤣🎊",
  "Que o horizonte seja sempre o começo de uma nova aventura, vaqueiro! 🌅🐂",
];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; life: number; maxLife: number; size: number;
}

export class EventController {
  public birthdayForceState: "on" | "off" | null = null;
  public birthdaySentParabens = false;
  public birthdayParabensCount = 0;
  public birthdayDialogOpen = false;
  public cakeBobbingTimer = 0;
  public particles: Particle[] = [];
  public eventPopupDismissed = false;
  public eventPopupTimer = 10;
  public starterPackDismissed = false;
  public starterPackBuyBtn = { x: 0, y: 0, w: 0, h: 0 };
  public starterPackCloseBtn = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private game: any) {
    this.eventPopupDismissed = !!sessionStorage.getItem("cowboy_bday_popup_seen");
    this.starterPackDismissed = !!localStorage.getItem("cowboy_starter_v1");
    this.birthdaySentParabens = !!localStorage.getItem("cowboy_parabens_2025");
  }

  get isBirthdayActive(): boolean {
    if (this.birthdayForceState === "off") return false;
    if (this.birthdayForceState === "on") return true;
    const now = new Date();
    const m = now.getMonth() + 1, d = now.getDate();
    return m === BIRTHDAY_MONTH && d >= BIRTHDAY_DAY_START && d <= BIRTHDAY_DAY_END;
  }

  isAtCake(): boolean {
    return Math.hypot(this.game.player.col - CAKE_COL, this.game.player.row - CAKE_ROW) <= CAKE_INTERACT_DIST;
  }

  sendParabens() {
    if (this.birthdaySentParabens) return;
    this.birthdaySentParabens = true;
    localStorage.setItem("cowboy_parabens_2025", "1");
    const randomMsg = PARABENS_MESSAGES[Math.floor(Math.random() * PARABENS_MESSAGES.length)]!;
    const fullMsg = `🎂 ${this.game.myName} deseja: Feliz Aniversário ao criador! ${randomMsg}`;
    this.game.network?.sendChat?.(fullMsg);
    this.game.network?.sendBirthdayParabens?.();
    this.birthdayDialogOpen = false;
    this.spawnConfetti();
  }

  private spawnConfetti() {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const colors = ["#FF6B6B", "#FFD700", "#6BCB77", "#4D96FF", "#FF6BD6", "#FFA07A", "#C77DFF", "#00F5D4"];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      this.particles.push({
        x: W / 2 + (Math.random() - 0.5) * 60,
        y: H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        life: 1,
        maxLife: 0.8 + Math.random() * 1.5,
        size: 3 + Math.random() * 4,
      });
    }
  }

  update(dt: number) {
    this.cakeBobbingTimer += dt;

    if (!this.eventPopupDismissed && this.isBirthdayActive) {
      this.eventPopupTimer -= dt;
      if (this.eventPopupTimer <= 0) {
        this.eventPopupDismissed = true;
        sessionStorage.setItem("cowboy_bday_popup_seen", "1");
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  drawParticles(game: any) {
    const { ctx } = game;
    for (const p of this.particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
