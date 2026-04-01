/**
 * Minimal GIF87a/89a decoder.
 * Extracts each frame as an OffscreenCanvas with its delay in milliseconds.
 */

export interface GifFrame {
  canvas: OffscreenCanvas;
  delay: number; // ms
}

export async function loadGifFrames(url: string): Promise<GifFrame[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  return decodeGif(new Uint8Array(await res.arrayBuffer()));
}

// ── Parser ────────────────────────────────────────────────────────────────────

function decodeGif(data: Uint8Array): GifFrame[] {
  // Shorthand: read byte at index, always a number (we control bounds)
  const b = (i: number): number => data[i] ?? 0;

  if (b(0) !== 0x47 || b(1) !== 0x49 || b(2) !== 0x46) return []; // "GIF"

  let p = 6; // skip "GIF8xa" header

  // Logical Screen Descriptor
  const screenW = b(p) | (b(p + 1) << 8); p += 2;
  const screenH = b(p) | (b(p + 1) << 8); p += 2;
  const packed0  = b(p++);
  p += 2; // background color index + pixel aspect ratio

  let globalPalette = new Uint8Array(0);
  if (packed0 >> 7) {
    const n = 2 << (packed0 & 7);
    globalPalette = data.slice(p, p + n * 3);
    p += n * 3;
  }

  const frames: GifFrame[] = [];
  const composite = new OffscreenCanvas(screenW, screenH);
  const compCtx   = composite.getContext("2d")!;

  // GCE state, reset after each frame
  let delay    = 100;
  let transIdx = -1;
  let disposal = 0;
  let prevImageData: ImageData | null = null;

  const skipBlocks = () => {
    while (b(p)) p += 1 + b(p);
    p++; // null terminator
  };

  const readBlocks = (): Uint8Array => {
    const parts: Uint8Array[] = [];
    while (b(p)) {
      const n = b(p++);
      parts.push(data.slice(p, p + n));
      p += n;
    }
    p++; // null terminator
    const total = parts.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of parts) { out.set(c, off); off += c.length; }
    return out;
  };

  while (p < data.length) {
    const block = b(p++);
    if (block === 0x3B) break; // Trailer

    if (block === 0x21) {
      // Extension block
      const label = b(p++);
      if (label === 0xF9) {
        // Graphic Control Extension
        p++;                                    // block size (always 4)
        const gce  = b(p++);
        disposal   = (gce >> 3) & 7;
        const hasT = gce & 1;
        delay      = (b(p) | (b(p + 1) << 8)) * 10; p += 2;
        transIdx   = hasT ? b(p) : -1; p++;
        p++;                                    // block terminator
      } else {
        skipBlocks();
      }
      continue;
    }

    if (block !== 0x2C) continue; // unexpected byte

    // Image Descriptor
    const left = b(p) | (b(p + 1) << 8); p += 2;
    const top  = b(p) | (b(p + 1) << 8); p += 2;
    const w    = b(p) | (b(p + 1) << 8); p += 2;
    const h    = b(p) | (b(p + 1) << 8); p += 2;
    const ip   = b(p++);

    const hasLCT     = ip >> 7;
    const interlaced = (ip >> 6) & 1;

    let palette = globalPalette;
    if (hasLCT) {
      const n = 2 << (ip & 7);
      palette = data.slice(p, p + n * 3);
      p += n * 3;
    }

    const minCode    = b(p++);
    const compressed = readBlocks();
    const raw        = lzwDecode(compressed, minCode);
    const pixels     = interlaced ? deinterlace(raw, w, h) : raw;

    // Save composite for disposal=3
    if (disposal === 3) {
      prevImageData = compCtx.getImageData(0, 0, screenW, screenH);
    }

    // Blit frame pixels onto composite canvas
    const imgData = compCtx.getImageData(0, 0, screenW, screenH);
    const d = imgData.data;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const pi = pixels[row * w + col] ?? 0;
        if (pi === transIdx) continue;
        const ci = pi * 3;
        const di = ((top + row) * screenW + (left + col)) * 4;
        d[di]     = palette[ci]     ?? 0;
        d[di + 1] = palette[ci + 1] ?? 0;
        d[di + 2] = palette[ci + 2] ?? 0;
        d[di + 3] = 255;
      }
    }
    compCtx.putImageData(imgData, 0, 0);

    // Snapshot composite as this frame
    const fc = new OffscreenCanvas(screenW, screenH);
    fc.getContext("2d")!.drawImage(composite, 0, 0);
    frames.push({ canvas: fc, delay: Math.max(delay, 20) });

    // Disposal
    if (disposal === 2) {
      compCtx.clearRect(left, top, w, h);
    } else if (disposal === 3 && prevImageData) {
      compCtx.putImageData(prevImageData, 0, 0);
    }

    // Reset GCE state
    delay = 100; transIdx = -1; disposal = 0; prevImageData = null;
  }

  return frames;
}

// ── LZW decompression ─────────────────────────────────────────────────────────

function lzwDecode(data: Uint8Array, minCode: number): Uint8Array {
  const b = (i: number): number => data[i] ?? 0;
  const clear = 1 << minCode;
  const eoi   = clear + 1;

  const dict      = new Array<Uint8Array>(4096);
  let codeSize    = minCode + 1;
  let nextCode    = eoi + 1;

  const reset = () => {
    for (let i = 0; i < clear; i++) dict[i] = new Uint8Array([i]);
    codeSize = minCode + 1;
    nextCode = eoi + 1;
  };
  reset();

  const output: number[] = [];
  let bitBuf = 0, bitsLeft = 0, bytePos = 0;

  const readCode = (): number => {
    while (bitsLeft < codeSize) {
      if (bytePos >= data.length) break;
      bitBuf |= b(bytePos++) << bitsLeft;
      bitsLeft += 8;
    }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize;
    bitsLeft -= codeSize;
    return code;
  };

  let prev: Uint8Array | null = null;

  while (bytePos <= data.length) {
    const code = readCode();
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi || code >= 4096) break;

    let entry: Uint8Array;
    if (code < nextCode && dict[code]) {
      entry = dict[code]!;
    } else if (prev && code === nextCode) {
      const arr = new Uint8Array(prev.length + 1);
      arr.set(prev); arr[prev.length] = prev[0] ?? 0;
      entry = arr;
    } else {
      break; // malformed
    }

    for (const v of entry) output.push(v);

    if (prev && nextCode < 4096) {
      const arr = new Uint8Array(prev.length + 1);
      arr.set(prev); arr[prev.length] = entry[0] ?? 0;
      dict[nextCode++] = arr;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }

  return new Uint8Array(output);
}

// ── Deinterlacing ─────────────────────────────────────────────────────────────

function deinterlace(src: Uint8Array, w: number, h: number): Uint8Array {
  const out    = new Uint8Array(w * h);
  const starts = [0, 4, 2, 1];
  const incs   = [8, 8, 4, 2];
  let srcRow   = 0;
  for (let pass = 0; pass < 4; pass++) {
    for (let row = starts[pass] ?? 0; row < h; row += incs[pass] ?? 1) {
      out.set(src.subarray(srcRow * w, (srcRow + 1) * w), row * w);
      srcRow++;
    }
  }
  return out;
}
