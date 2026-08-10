import type { Point, Rect } from '../types';
import { hexToRgb } from './color';
import { ctxOf, makeCanvas } from './rasters';

export interface FillPlan {
  rect: Rect;
  /** Colour already masked to the filled region, ready to composite. */
  stamp: HTMLCanvasElement;
}

/**
 * Flat fill. Builds a mask of the connected region by scanline flood, then
 * paints the colour through that mask so a semi-transparent fill blends with
 * what is underneath instead of replacing it.
 *
 * Planning and applying are separate so the caller can snapshot the affected
 * rectangle for undo before anything changes.
 */
export function planFill(
  target: HTMLCanvasElement,
  seed: Point,
  hex: string,
  tolerance = 32,
): FillPlan | null {
  const w = target.width;
  const h = target.height;
  const sx = Math.floor(seed.x);
  const sy = Math.floor(seed.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;

  const ctx = ctxOf(target);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  const at = (x: number, y: number) => (y * w + x) * 4;
  const s = at(sx, sy);
  const sr = px[s];
  const sg = px[s + 1];
  const sb = px[s + 2];
  const sa = px[s + 3];
  const tol = tolerance * tolerance * 4;

  const matches = (i: number) => {
    const dr = px[i] - sr;
    const dg = px[i + 1] - sg;
    const db = px[i + 2] - sb;
    const da = px[i + 3] - sa;
    // Transparent pixels differ mainly in alpha; weight it like a channel.
    return dr * dr + dg * dg + db * db + da * da <= tol;
  };

  const seen = new Uint8Array(w * h);
  const mask = new Uint8ClampedArray(w * h * 4);
  const stack: number[] = [sx, sy];

  let minX = sx;
  let minY = sy;
  let maxX = sx;
  let maxY = sy;
  let filled = 0;

  while (stack.length) {
    const y = stack.pop() as number;
    let x = stack.pop() as number;

    while (x >= 0 && !seen[y * w + x] && matches(at(x, y))) x--;
    x++;

    let spanUp = false;
    let spanDown = false;
    while (x < w && !seen[y * w + x] && matches(at(x, y))) {
      const flat = y * w + x;
      seen[flat] = 1;
      mask[flat * 4 + 3] = 255;
      filled++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (y > 0) {
        const up = matches(at(x, y - 1)) && !seen[(y - 1) * w + x];
        if (up && !spanUp) {
          stack.push(x, y - 1);
          spanUp = true;
        } else if (!up) spanUp = false;
      }
      if (y < h - 1) {
        const down = matches(at(x, y + 1)) && !seen[(y + 1) * w + x];
        if (down && !spanDown) {
          stack.push(x, y + 1);
          spanDown = true;
        } else if (!down) spanDown = false;
      }
      x++;
    }
  }

  if (!filled) return null;

  const rect: Rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };

  // Mask -> solid colour -> composite, so alpha blends normally.
  const stamp = makeCanvas(w, h);
  const sctx = ctxOf(stamp);
  sctx.putImageData(new ImageData(mask, w, h), 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  const { r, g, b } = hexToRgb(hex);
  sctx.fillStyle = `rgb(${r},${g},${b})`;
  sctx.fillRect(0, 0, w, h);

  return { rect, stamp };
}
