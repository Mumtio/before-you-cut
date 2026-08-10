import { CANVAS_H, CANVAS_W } from '../constants';
import type { BodyGeometry } from '../body/model';
import { flatten } from '../canvas/compositor';
import { ctxOf, makeCanvas } from '../canvas/rasters';
import type { LayerMeta, Rect, Region } from '../types';

export interface FlatExport {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  /** Tight box around anything actually drawn — empty when nothing is. */
  content: Rect | null;
  /** How many pixels are actually drawn on, for judging how complete it is. */
  drawnPixels: number;
}

/**
 * The garment on its own (spec §8): body and guide layers left out, everything
 * else composited, transparent background. This is what goes to the API, and
 * it is also the version kept alongside any realistic render.
 */
export function exportFlat(layers: LayerMeta[], regions: Region[]): FlatExport {
  const canvas = makeCanvas(CANVAS_W, CANVAS_H);
  flatten(layers, regions, canvas);
  const { bounds, opaque } = contentStats(canvas);
  return { canvas, dataUrl: canvas.toDataURL('image/png'), content: bounds, drawnPixels: opaque };
}

/**
 * What share of the figure the drawing actually covers.
 *
 * A garment fills most of a body. A stray mark covers almost none of it, and
 * a render or a try-on given one will invent the rest — worth saying before a
 * unit is spent finding out.
 */
export function figureCoverage(flat: FlatExport, geo: BodyGeometry): number {
  const frame = figureFrame(geo);
  const area = Math.max(1, frame.w * frame.h);
  return flat.drawnPixels / area;
}

/**
 * The same flat garment, prepared for the try-on API: trimmed to what is
 * actually drawn and placed on white.
 *
 * Generative try-on is trained on product shots — a garment floating in a large
 * empty frame, on nothing, is not what it expects. The download stays
 * transparent and full-frame as the spec asks; this is only what goes over the
 * wire, and the app shows it so there is no guessing about what was sent.
 */
export type Framing = 'figure' | 'garment';

const API_W = 768;
const API_H = 1024;

/**
 * The frame the figure occupies: crown to ankle, full width.
 *
 * This is what carries garment length. Cropped to its own outline, a
 * knee-length dress and a floor-length gown are the same picture — both fill
 * their frame top to bottom. Framed against the body it was drawn on, a hem
 * that stops at the knee stops at the knee, and the try-on has something to go
 * on. The body itself is still never drawn (spec §8).
 */
export function figureFrame(geo: BodyGeometry): Rect {
  const pad = geo.unit * 0.35;
  const x = Math.max(0, geo.cx - geo.half.widest - pad);
  const y = Math.max(0, geo.y.headTop - pad);
  return {
    x,
    y,
    w: Math.min(CANVAS_W, geo.cx + geo.half.widest + pad) - x,
    h: Math.min(CANVAS_H, geo.y.ankle + pad) - y,
  };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * The flat garment prepared for the try-on API: on white, at a size their
 * minimum accepts. Generative try-on is trained on product shots — a garment on
 * a transparent background is not what it expects.
 *
 * The download stays transparent and full-frame as the spec asks; this is only
 * what goes over the wire, and the app shows it so there is no guessing.
 */
export function garmentForApi(
  flat: FlatExport,
  opts: { framing: Framing; geo?: BodyGeometry; margin?: number },
): string | null {
  if (!flat.content) return null;
  const margin = opts.margin ?? 0.05;

  const src =
    opts.framing === 'figure' && opts.geo
      ? union(figureFrame(opts.geo), flat.content)
      : flat.content;

  const out = makeCanvas(API_W, API_H);
  const ctx = ctxOf(out);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, API_W, API_H);
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.min((API_W * (1 - margin * 2)) / src.w, (API_H * (1 - margin * 2)) / src.h);
  const dw = src.w * scale;
  const dh = src.h * scale;
  ctx.drawImage(flat.canvas, src.x, src.y, src.w, src.h, (API_W - dw) / 2, (API_H - dh) / 2, dw, dh);
  return out.toDataURL('image/png');
}

/**
 * How much of the drawing is narrower than `radiusPx` across.
 *
 * Straps, ties and fine piping are the first things a generative try-on drops —
 * every test run of a dress with cap sleeves came back strapless (spec §14).
 * Eroding the drawn area and seeing how little survives is a cheap way to spot
 * that before spending a unit finding out.
 */
export function thinDetailRatio(canvas: HTMLCanvasElement, radiusPx = 7): number {
  const scale = 0.25;
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const small = makeCanvas(w, h);
  const ctx = ctxOf(small);
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const solid = new Uint8Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > 40) {
      solid[i] = 1;
      total++;
    }
  }
  if (!total) return 0;

  const r = Math.max(1, Math.round(radiusPx * scale));
  let survived = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid[y * w + x]) continue;
      let intact = true;
      for (let dy = -r; dy <= r && intact; dy++) {
        for (let dx = -r; dx <= r && intact; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !solid[ny * w + nx]) intact = false;
        }
      }
      if (intact) survived++;
    }
  }
  return 1 - survived / total;
}

export function contentBounds(canvas: HTMLCanvasElement): Rect | null {
  return contentStats(canvas).bounds;
}

function contentStats(canvas: HTMLCanvasElement): { bounds: Rect | null; opaque: number } {
  const { width: w, height: h } = canvas;
  const data = ctxOf(canvas).getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { bounds: null, opaque: 0 };
  return {
    bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    opaque,
  };
}

export function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadText(text: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return (name.trim() || 'sample-room').replace(/[^a-z0-9\-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase();
}
