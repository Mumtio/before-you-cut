import { CANVAS_H, CANVAS_W } from '../constants';
import { ctxOf, getRaster, makeCanvas } from '../canvas/rasters';
import type { Combination, FabricZone } from '../types';

/** Painted masks live in the same registry as every other bitmap. */
export const zoneKey = (id: string) => `zone:${id}`;
export const PENDING_KEY = 'zone:pending';

/** Distinct enough to tell apart as translucent washes over artwork. */
export const ZONE_COLORS = [
  '#38bdf8',
  '#f472b6',
  '#a3e635',
  '#fbbf24',
  '#c084fc',
  '#2dd4bf',
];

export function nextZoneColor(existing: FabricZone[]): string {
  const used = new Set(existing.map((z) => z.color));
  return ZONE_COLORS.find((c) => !used.has(c)) ?? ZONE_COLORS[existing.length % ZONE_COLORS.length];
}

/** True when the mask has any painted pixels at all. */
export function maskHasContent(key: string): boolean {
  const c = getRaster(key);
  const data = ctxOf(c).getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) return true;
  }
  return false;
}

/**
 * Last paint wins: pixels claimed by a new zone stop belonging to the old ones.
 * This is how selection tools normally behave, so it needs no explaining.
 */
export function subtractFromOthers(newKey: string, others: FabricZone[]) {
  const stamp = getRaster(newKey);
  for (const zone of others) {
    const ctx = ctxOf(getRaster(zoneKey(zone.id)));
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(stamp, 0, 0);
    ctx.restore();
  }
}

export function clearMask(key: string) {
  const c = getRaster(key);
  ctxOf(c).clearRect(0, 0, c.width, c.height);
}

export function copyMask(from: string, to: string) {
  const dst = getRaster(to);
  const ctx = ctxOf(dst);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.drawImage(getRaster(from), 0, 0);
}

/**
 * Black where the image should be left alone, white where the fabric should be
 * replaced — the shape a masked-replacement call expects.
 */
export function maskForApi(key: string, src: { x: number; y: number; w: number; h: number }, w: number, h: number): string {
  const out = makeCanvas(w, h);
  const ctx = ctxOf(out);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  const scale = Math.min(w / src.w, h / src.h);
  const dw = src.w * scale;
  const dh = src.h * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  // Draw the painted alpha, then flood it to solid white through itself.
  const shape = makeCanvas(w, h);
  const sctx = ctxOf(shape);
  sctx.drawImage(getRaster(key), src.x, src.y, src.w, src.h, dx, dy, dw, dh);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, w, h);

  ctx.drawImage(shape, 0, 0);
  return out.toDataURL('image/png');
}

/**
 * Where a zone sits on the garment, in words.
 *
 * The combined render sends no masks — only the fabric notes — so the model
 * decides for itself where "the sleeves" are, and it guesses wrong as often as
 * not. The painted mask knows exactly where the designer meant; this turns that
 * into the one thing a prompt can carry. Costs nothing: it is read off a canvas
 * that is already in memory.
 */
export function zoneWhere(key: string, garment: { x: number; y: number; w: number; h: number }): string {
  const c = getRaster(key);
  const data = ctxOf(c).getImageData(0, 0, c.width, c.height).data;

  let minX = c.width;
  let maxX = -1;
  let minY = c.height;
  let maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxY < 0) return '';

  // As fractions of the garment itself, so the answer does not change when the
  // same dress is drawn larger or higher up the canvas.
  const top = (minY - garment.y) / garment.h;
  const bottom = (maxY - garment.y) / garment.h;
  const mid = (top + bottom) / 2;

  const height =
    mid < 0.12 ? 'at the shoulders and straps'
    : mid < 0.3 ? 'across the bust and upper bodice'
    : mid < 0.45 ? 'around the waist'
    : mid < 0.62 ? 'over the hips'
    : mid < 0.85 ? 'down the skirt'
    : 'at the hem';

  // A band spanning most of the garment is not "at" anywhere in particular.
  if (bottom - top > 0.6) return 'over most of the garment';

  const left = (minX - garment.x) / garment.w;
  const right = (maxX - garment.x) / garment.w;
  const side =
    right < 0.45 ? ', on the left side'
    : left > 0.55 ? ', on the right side'
    : '';

  return height + side;
}

/** Zones painted against a different set of versions than the one showing. */
export function staleZones(zones: FabricZone[], current: Combination): FabricZone[] {
  return zones.filter((z) => {
    const keys = new Set([...Object.keys(z.paintedForCombination), ...Object.keys(current)]);
    for (const k of keys) {
      if (z.paintedForCombination[k] !== current[k]) return true;
    }
    return false;
  });
}
