/**
 * Singleton music manager — lives outside Game instances so it survives
 * preview → real game transitions and login screen.
 */

type TrackName = "main" | "second" | "night";

let audio: Record<TrackName, HTMLAudioElement> | null = null;
let enabled = true;
let current: TrackName | null = null;
let dayIndex = 0;       // alternates 0=main / 1=second each loop
let nightMode = false;
let changing = false;   // guard against ended-cascade during track switch

function make(file: string): HTMLAudioElement {
  const a = new Audio("/sounds/soundtrack/" + file);
  a.loop = false;
  a.volume = 0.32;
  return a;
}

function playTrack(name: TrackName) {
  if (!audio || !enabled) return;
  changing = true;
  for (const t of ["main", "second", "night"] as TrackName[]) {
    audio[t].pause();
    audio[t].currentTime = 0;
  }
  current = name;
  audio[name].play().catch(() => { /* autoplay blocked */ });
  // Small timeout so ended-events from the pause above are ignored
  setTimeout(() => { changing = false; }, 80);
}

function onEnded() {
  if (changing || !enabled) return;
  if (nightMode) {
    playTrack("night");
  } else {
    dayIndex = 1 - dayIndex;
    playTrack(dayIndex === 0 ? "main" : "second");
  }
}

/** Call once from main.ts — idempotent */
export function initMusic() {
  if (audio) return; // already initialised
  audio = { main: make("main.ogg"), second: make("second.ogg"), night: make("night.ogg") };
  audio.main.addEventListener("ended",   onEnded);
  audio.second.addEventListener("ended", onEnded);
  audio.night.addEventListener("ended",  onEnded);

  // Start on first user gesture (browser autoplay policy)
  const startOnce = () => {
    if (!enabled || current !== null) return;
    playTrack(nightMode ? "night" : "main");
    window.removeEventListener("pointerdown", startOnce);
    window.removeEventListener("keydown",     startOnce);
  };
  window.addEventListener("pointerdown", startOnce);
  window.addEventListener("keydown",     startOnce);
}

export function setNightMode(isNight: boolean) {
  if (nightMode === isNight) return;
  nightMode = isNight;
  if (current === null) return; // not started yet
  playTrack(nightMode ? "night" : (dayIndex === 0 ? "main" : "second"));
}

export function toggleMusic(): boolean {
  enabled = !enabled;
  if (!audio) return enabled;
  if (!enabled) {
    for (const t of ["main", "second", "night"] as TrackName[]) audio[t].pause();
  } else {
    current = null; // force restart
    playTrack(nightMode ? "night" : (dayIndex === 0 ? "main" : "second"));
  }
  return enabled;
}

export function isMusicEnabled(): boolean { return enabled; }
