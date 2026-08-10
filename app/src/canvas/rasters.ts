import { CANVAS_H, CANVAS_W } from '../constants';

/**
 * Pixel data lives outside React. The store holds layer metadata only; the
 * actual bitmaps are kept here, keyed by layer id, and mutated in place.
 */
const rasters = new Map<string, HTMLCanvasElement>();

export function makeCanvas(w = CANVAS_W, h = CANVAS_H): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

export function getRaster(layerId: string): HTMLCanvasElement {
  let c = rasters.get(layerId);
  if (!c) {
    c = makeCanvas();
    rasters.set(layerId, c);
  }
  return c;
}

export function disposeRaster(layerId: string) {
  rasters.delete(layerId);
}

export function clearRaster(layerId: string) {
  const c = getRaster(layerId);
  ctxOf(c).clearRect(0, 0, c.width, c.height);
}

/** True when the layer has no visible pixels at all. */
export function isRasterEmpty(layerId: string): boolean {
  const c = getRaster(layerId);
  const data = ctxOf(c).getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}
