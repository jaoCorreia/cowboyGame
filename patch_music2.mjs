import { readFileSync, writeFileSync } from "fs";
let src = readFileSync("src/game.ts", "utf8");

// 1. Add music module import
src = src.replace(
  `import { sprites } from "./sprites";`,
  `import { sprites } from "./sprites";\nimport { toggleMusic, isMusicEnabled, setNightMode } from "./music";`
);
console.log("music import added");

// 2. Remove music fields
src = src.replace(`\n  private musicEnabled = true;\n  private dayTrackIndex = 0; // 0=main, 1=second — alternates each loop\n  private musicAudio: { main: HTMLAudioElement; second: HTMLAudioElement; night: HTMLAudioElement } | null = null;\n  private musicCurrent: "main" | "second" | "night" | null = null;`, "");
console.log("music fields removed");

// 3. Remove initMusic() call from constructor
src = src.replace(`\n    this.initMusic();`, "");
console.log("initMusic constructor call removed");

// 4. Replace onPeriodChange to use setNightMode
const oldPeriod = `  private onPeriodChange() {
    if (!this.musicEnabled || !this.musicAudio) return;
    if (this.isNight) {
      this.playTrack("night");
    } else {
      // Resume day cycle from whichever track is next
      this.playTrack(this.dayTrackIndex === 0 ? "main" : "second");
    }
  }`;
const newPeriod = `  private onPeriodChange() {
    setNightMode(this.isNight);
  }`;
if (src.includes(oldPeriod)) { src = src.replace(oldPeriod, newPeriod); console.log("onPeriodChange updated"); }
else console.log("WARNING: onPeriodChange not found");

// 5. Replace toggleMusic to use module
const oldToggle = `  private toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicAudio) return;
    if (!this.musicEnabled) {
      for (const t of ["main", "second", "night"] as const)
        this.musicAudio[t].pause();
    } else {
      this.playTrack(this.isNight ? "night" : (this.dayTrackIndex === 0 ? "main" : "second"));
    }
  }`;
const newToggle = `  private toggleMusic() {
    toggleMusic();
  }`;
if (src.includes(oldToggle)) { src = src.replace(oldToggle, newToggle); console.log("toggleMusic updated"); }
else console.log("WARNING: toggleMusic not found");

// 6. Replace renderMusicButton to use isMusicEnabled()
src = src.replace(
  /this\.musicEnabled \? "normal" : "pressed"/g,
  `isMusicEnabled() ? "normal" : "pressed"`
);
src = src.replace(
  /this\.musicEnabled \? "🎵" : "🔇"/g,
  `isMusicEnabled() ? "🎵" : "🔇"`
);
src = src.replace(
  /this\.musicEnabled \? "#FFD700" : "#888"/g,
  `isMusicEnabled() ? "#FFD700" : "#888"`
);
console.log("renderMusicButton updated");

// 7. Remove initMusic, playTrack, onTrackEnded methods entirely
const methodsToRemove = [
  /\n  private initMusic\(\) \{[\s\S]*?\n  \}\n(?=\n  private playTrack)/,
  /\n  private playTrack\(name: "main" \| "second" \| "night"\) \{[\s\S]*?\n  \}\n(?=\n  private onTrackEnded)/,
  /\n  private onTrackEnded\(\) \{[\s\S]*?\n  \}\n(?=\n  private onPeriodChange)/,
];
for (const re of methodsToRemove) {
  if (re.test(src)) { src = src.replace(re, "\n"); console.log("removed method"); }
  else console.log("WARNING: method not found for", re.source.slice(0, 40));
}

writeFileSync("src/game.ts", src);
console.log("Done, size:", src.length);
