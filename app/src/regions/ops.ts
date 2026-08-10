import { CANVAS_H, CANVAS_W } from '../constants';
import { ctxOf, getRaster, makeCanvas } from '../canvas/rasters';
import type { Point, Rect } from '../types';
import { bboxOf, pathOf, rectsOverlap } from './geometry';

const OVERLAP_SCALE = 0.25;

/**
 * Two parts on one layer must not overlap (spec §5). Rasterising both at
 * quarter size and looking for shared pixels handles concave, self-touching and
 * fully-contained shapes, which pure polygon maths would make fiddly.
 */
export function overlaps(a: Point[], b: Point[]): boolean {
  if (!rectsOverlap(bboxOf(a), bboxOf(b))) return false;

  const w = Math.ceil(CANVAS_W * OVERLAP_SCALE);
  const h = Math.ceil(CANVAS_H * OVERLAP_SCALE);
  const c = makeCanvas(w, h);
  const ctx = ctxOf(c);
  ctx.scale(OVERLAP_SCALE, OVERLAP_SCALE);

  ctx.fillStyle = '#fff';
  ctx.fill(pathOf(a));
  ctx.globalCompositeOperation = 'source-in';
  ctx.fill(pathOf(b));

  const data = ctxOf(c).getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) return true;
  }
  return false;
}

/** Everything inside the boundary, on its own, transparent elsewhere. */
export function clipToPath(src: HTMLCanvasElement, points: Point[]): HTMLCanvasElement {
  const out = makeCanvas();
  const ctx = ctxOf(out);
  ctx.save();
  ctx.clip(pathOf(points));
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  return out;
}

/** Take the pixels out of the layer, leaving that area transparent. */
export function eraseInside(target: HTMLCanvasElement, points: Point[]) {
  const ctx = ctxOf(target);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.fill(pathOf(points));
  ctx.restore();
}

export function copyInto(key: string, src: HTMLCanvasElement) {
  const dst = getRaster(key);
  const ctx = ctxOf(dst);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.drawImage(src, 0, 0);
}

/** True when two bitmaps differ — used to know if a part has unsaved work. */
export function differs(a: HTMLCanvasElement, b: HTMLCanvasElement, box: Rect): boolean {
  if (box.w <= 0 || box.h <= 0) return false;
  const da = ctxOf(a).getImageData(box.x, box.y, box.w, box.h).data;
  const db = ctxOf(b).getImageData(box.x, box.y, box.w, box.h).data;
  for (let i = 0; i < da.length; i += 4) {
    if (da[i + 3] !== db[i + 3] || da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
      return true;
    }
  }
  return false;
}

const THUMB_W = 96;
const THUMB_H = 124;

export function makeThumb(src: HTMLCanvasElement, bbox: Rect): string {
  const c = makeCanvas(THUMB_W, THUMB_H);
  const ctx = ctxOf(c);
  ctx.fillStyle = '#f7f5f2';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  if (bbox.w > 0 && bbox.h > 0) {
    const s = Math.min(THUMB_W / bbox.w, THUMB_H / bbox.h) * 0.9;
    const dw = bbox.w * s;
    const dh = bbox.h * s;
    ctx.drawImage(src, bbox.x, bbox.y, bbox.w, bbox.h, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
  }
  return c.toDataURL('image/png');
}

/** Strokes on a layer never belong inside a part — cut those pixels away. */
export function excludeRegions(scratch: HTMLCanvasElement, regionPoints: Point[][]) {
  if (!regionPoints.length) return;
  const ctx = ctxOf(scratch);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const pts of regionPoints) ctx.fill(pathOf(pts));
  ctx.restore();
}
