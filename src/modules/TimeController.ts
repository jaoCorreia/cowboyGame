export class TimeController {
  private adminForcePeriod: "manha" | "tarde" | "noite" | null = null;
  private debugForcePeriod: "manha" | "tarde" | "noite" | null = null;

  constructor(private game: any) {}

  get realHourBRT(): number {
    const now = new Date();
    return ((now.getUTCHours() - 3 + 24) % 24) + now.getUTCMinutes() / 60;
  }

  get period(): "manha" | "tarde" | "noite" {
    if (this.adminForcePeriod !== null) return this.adminForcePeriod;
    if (this.debugForcePeriod !== null) return this.debugForcePeriod;
    const h = this.realHourBRT;
    if (h >= 18 || h < 6) return "noite";
    if (h < 12) return "manha";
    return "tarde";
  }

  get nightFade(): number {
    if (this.adminForcePeriod === "noite") return 1;
    if (this.adminForcePeriod !== null) return 0;
    if (this.debugForcePeriod === "noite") return 1;
    if (this.debugForcePeriod === "tarde" || this.debugForcePeriod === "manha") return 0;
    const h = this.realHourBRT;
    if (h >= 5.5 && h < 6.5) return 1 - (h - 5.5);
    if (h >= 6.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 18.5) return h - 17.5;
    return 1;
  }

  get isNight(): boolean {
    return this.period === "noite";
  }

  update(dt: number) {
    const prevIsNight = this.game.prevIsNight;
    const nowNight = this.isNight;

    if (prevIsNight && !nowNight) {
      const { CowAI, CowTypeComp } = require("../components");
      for (const [entity, , ai, tc] of this.game.worldState.query(this.game.ecsPosition, CowAI, CowTypeComp)) {
        if (tc.cowType.nightOnly && (ai.state === "wandering" || ai.state === "fleeing")) {
          this.game.worldState.destroy(entity);
        }
      }
    }
    if (!prevIsNight && nowNight) {
      for (let i = 0; i < 3; i++) {
        this.game.spawnCowEntity(this.game.nextCowId++, true);
      }
    }
    if (nowNight !== prevIsNight) {
      this.game.onPeriodChange?.();
    }
    this.game.prevIsNight = nowNight;
  }

  setAdminPeriod(period: "manha" | "tarde" | "noite" | null) {
    this.adminForcePeriod = period;
  }
}
