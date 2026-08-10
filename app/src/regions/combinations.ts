import { CANVAS_H, CANVAS_W } from '../constants';
import { flatten } from '../canvas/compositor';
import { ctxOf, makeCanvas } from '../canvas/rasters';
import { contentBounds } from '../project/exportFlat';
import type { Combination, LayerMeta, Rect, Region } from '../types';

/** More than this on screen at once is not browsing, it is scrolling. */
export const MAX_SHOWN = 60;

export function countCombinations(regions: Region[]): number {
  return regions.reduce((n, r) => n * Math.max(1, r.variants.length), 1);
}

export function key(c: Combination): string {
  return Object.keys(c)
    .sort()
    .map((k) => `${k}:${c[k]}`)
    .join('|');
}

/** Every way the parts can be combined, in a stable order. */
export function enumerate(regions: Region[], limit = MAX_SHOWN): Combination[] {
  let out: Combination[] = [{}];
  for (const region of regions) {
    const next: Combination[] = [];
    for (const base of out) {
      for (const v of region.variants) {
        next.push({ ...base, [region.id]: v.id });
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    out = next;
  }
  return out.slice(0, limit);
}

const THUMB_W = 210;
const THUMB_H = 300;

export interface Thumb {
  combination: Combination;
  key: string;
  src: string;
  /** Nothing is drawn in this combination at all. */
  empty: boolean;
}

/**
 * Every combination as a flat drawing. No API, no network — this is the step
 * where most options get eliminated by eye, before anything is spent.
 *
 * All of them share one crop, taken from the union of what every combination
 * draws. Cropping each to its own content would scale them differently, so a
 * small change would fill the frame and a version that adds nothing would look
 * blank — which makes them impossible to compare, which is the whole point.
 */
export function renderCombinations(
  layers: LayerMeta[],
  regions: Region[],
  combos: Combination[],
): Thumb[] {
  const full = makeCanvas(CANVAS_W, CANVAS_H);

  let crop: Rect | null = null;
  const emptiness: boolean[] = [];
  for (const c of combos) {
    flatten(layers, regions, full, c);
    const box = contentBounds(full);
    emptiness.push(box === null);
    if (box) crop = crop ? union(crop, box) : box;
  }
  if (!crop) crop = { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };

  const thumb = makeCanvas(THUMB_W, THUMB_H);
  const ctx = ctxOf(thumb);
  const scale = Math.min(THUMB_W / crop.w, THUMB_H / crop.h) * 0.9;
  const dw = crop.w * scale;
  const dh = crop.h * scale;
  const dx = (THUMB_W - dw) / 2;
  const dy = (THUMB_H - dh) / 2;

  return combos.map((c, i) => {
    flatten(layers, regions, full, c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f7f5f2';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, crop.x, crop.y, crop.w, crop.h, dx, dy, dw, dh);
    return { combination: c, key: key(c), src: thumb.toDataURL('image/png'), empty: emptiness[i] };
  });
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** A readable description like “collar: Version 2 · hem: Version 1”. */
export function describe(regions: Region[], c: Combination): string {
  return regions
    .map((r) => {
      const v = r.variants.find((x) => x.id === c[r.id]);
      return v ? `${r.name}: ${v.name}` : null;
    })
    .filter(Boolean)
    .join(' · ');
}
