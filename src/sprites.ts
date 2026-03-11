/**
 * Sprite registry — loads PNG sprites lazily.
 * Returns null while loading or if file doesn't exist (use canvas fallback).
 */

type SpriteState = HTMLImageElement | 'loading' | 'missing';

class SpriteRegistry {
  private cache = new Map<string, SpriteState>();

  /** Returns the image if loaded, null otherwise (triggers load on first call). */
  get(path: string): HTMLImageElement | null {
    const entry = this.cache.get(path);
    if (entry instanceof HTMLImageElement) return entry;
    if (entry === 'missing') return null;
    if (entry === 'loading') return null;

    // First request — kick off load
    this.cache.set(path, 'loading');
    const img = new Image();
    img.onload  = () => this.cache.set(path, img);
    img.onerror = () => this.cache.set(path, 'missing');
    img.src = '/sprites/' + path;
    return null;
  }
}

export const sprites = new SpriteRegistry();

