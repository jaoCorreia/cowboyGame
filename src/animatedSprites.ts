/**
 * Registry for animated sprites (GIF frames decoded at load time).
 * Returns the correct OffscreenCanvas frame for the given game time.
 */

import { loadGifFrames, type GifFrame } from "./gifDecoder";

class AnimatedSprite {
  private totalDuration: number;

  constructor(private frames: GifFrame[]) {
    this.totalDuration = frames.reduce((s, f) => s + f.delay, 0);
  }

  getFrame(timeMs: number): OffscreenCanvas {
    if (this.frames.length === 1) return this.frames[0]!.canvas;
    const t = timeMs % this.totalDuration;
    let acc = 0;
    for (const f of this.frames) {
      acc += f.delay;
      if (t < acc) return f.canvas;
    }
    return this.frames[this.frames.length - 1]!.canvas;
  }

  get width()  { return this.frames[0]!.canvas.width; }
  get height() { return this.frames[0]!.canvas.height; }
}

type CacheEntry = AnimatedSprite | "loading" | "missing";

class AnimatedSpriteRegistry {
  private cache = new Map<string, CacheEntry>();

  /** Returns the current frame for the given sprite path and game time (ms), or null while loading. */
  get(path: string, timeMs: number): { canvas: OffscreenCanvas; w: number; h: number } | null {
    const entry = this.cache.get(path);
    if (entry instanceof AnimatedSprite) {
      return { canvas: entry.getFrame(timeMs), w: entry.width, h: entry.height };
    }
    if (entry === "loading" || entry === "missing") return null;

    // First request — kick off async decode
    this.cache.set(path, "loading");
    loadGifFrames("/sprites/" + path)
      .then(frames => {
        this.cache.set(path, frames.length > 0 ? new AnimatedSprite(frames) : "missing");
      })
      .catch(() => this.cache.set(path, "missing"));
    return null;
  }
}

export const animatedSprites = new AnimatedSpriteRegistry();
