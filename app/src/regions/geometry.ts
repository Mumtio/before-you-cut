import { CANVAS_H, CANVAS_W } from '../constants';
import type { GuideLine } from '../body/model';
import type { Point, Rect } from '../types';

/** Drop points the hand produced faster than the shape needs. */
export function simplify(pts: Point[], minDist = 3): Point[] {
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) < minDist) out.pop();
  return out;
}

const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The line as it is being drawn: same midpoint-quadratic smoothing the brush
 * uses, so a boundary is drawn with exactly the feel of a normal stroke.
 */
export function openPathOf(pts: Point[]): Path2D {
  const path = new Path2D();
  if (!pts.length) return path;
  path.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) return path;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    path.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  const last = pts[pts.length - 1];
  path.lineTo(last.x, last.y);
  return path;
}

/** Closed, smoothed boundary. Midpoint quadratics keep freehand edges soft. */
export function pathOf(pts: Point[]): Path2D {
  const path = new Path2D();
  if (pts.length < 3) return path;

  const start = mid(pts[pts.length - 1], pts[0]);
  path.moveTo(start.x, start.y);
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i];
    const next = pts[(i + 1) % pts.length];
    const m = mid(c, next);
    path.quadraticCurveTo(c.x, c.y, m.x, m.y);
  }
  path.closePath();
  return path;
}

export function bboxOf(pts: Point[], pad = 2): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  return {
    x,
    y,
    w: Math.min(CANVAS_W, Math.ceil(maxX + pad)) - x,
    h: Math.min(CANVAS_H, Math.ceil(maxY + pad)) - y,
  };
}

export function area(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface Snap {
  point: Point;
  x: boolean;
  y: boolean;
}

/**
 * A drawing aid, not a rule: pull a boundary point onto a guide line when it is
 * already nearly there (spec §5 — snapping is optional and must not be needed
 * for correctness).
 */
export function snapToGuides(p: Point, guides: GuideLine[], tol: number): Snap {
  let { x, y } = p;
  let snappedX = false;
  let snappedY = false;
  let bestY = tol;
  let bestX = tol;

  for (const g of guides) {
    if (g.type === 'horizontal') {
      const d = Math.abs(p.y - g.position);
      if (d < bestY) {
        bestY = d;
        y = g.position;
        snappedY = true;
      }
    } else {
      const d = Math.abs(p.x - g.position);
      if (d < bestX) {
        bestX = d;
        x = g.position;
        snappedX = true;
      }
    }
  }
  return { point: { x, y }, x: snappedX, y: snappedY };
}
