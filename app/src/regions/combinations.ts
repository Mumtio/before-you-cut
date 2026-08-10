import { CANVAS_H, CANVAS_W } from '../constants';
import { flatten } from '../canvas/compositor';
import { ctxOf, makeCanvas } from '../canvas/rasters';
import { contentBounds } from '../project/exportFlat';
import type { Combination, LayerMeta, Region } from '../types';

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

/**
 * One combination as a flat drawing. No API, no network — this is the step
 * where most options get eliminated by eye, before anything is spent.
 */
export function renderCombination(
  layers: LayerMeta[],
  regions: Region[],
  combination: Combination,
): string {
  const full = makeCanvas(CANVAS_W, CANVAS_H);
  flatten(layers, regions, full, combination);

  const thumb = makeCanvas(THUMB_W, THUMB_H);
  const ctx = ctxOf(thumb);
  ctx.fillStyle = '#f7f5f2';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const box = contentBounds(full) ?? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  const scale = Math.min(THUMB_W / box.w, THUMB_H / box.h) * 0.9;
  const dw = box.w * scale;
  const dh = box.h * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, box.x, box.y, box.w, box.h, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
  return thumb.toDataURL('image/png');
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
