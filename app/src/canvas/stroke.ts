import { CANVAS_H, CANVAS_W } from '../constants';
import type { Point, Rect, ToolId } from '../types';
import { ctxOf, makeCanvas } from './rasters';
import { hexToRgb } from './color';

/**
 * A stroke is painted at full alpha onto a scratch canvas and only composited
 * onto the layer once, on release. That keeps opacity uniform along the stroke
 * instead of building up at every join and overlap, and it makes the eraser a
 * single destination-out pass.
 */
export class StrokeSession {
  readonly scratch: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tool: ToolId = 'pencil';
  private size = 8;
  private color = '#000000';
  private pts: Point[] = [];
  private carry = 0;
  /** Centre-front x to mirror across, or null. Set by mirror mode (spec §3). */
  private mirrorX: number | null = null;
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  active = false;

  constructor() {
    this.scratch = makeCanvas();
    this.ctx = ctxOf(this.scratch);
  }

  get isErasing() {
    return this.tool === 'eraser';
  }

  begin(
    tool: ToolId,
    size: number,
    color: string,
    p: Point,
    pressure: number,
    mirrorX: number | null = null,
  ) {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.tool = tool;
    this.size = size;
    this.color = tool === 'eraser' ? '#000000' : color;
    this.mirrorX = mirrorX;
    this.pts = [];
    this.carry = 0;
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
    this.active = true;
    this.extend(p, pressure);
  }

  /** Add a point and paint everything up to it. */
  extend(p: Point, pressure: number) {
    if (!this.active) return;
    const w = this.widthFor(pressure);
    const pts = this.pts;
    pts.push(p);
    this.grow(p, w);

    if (this.tool === 'soft') {
      const dots = pts.length === 1 ? this.planDabs(p, p, w) : this.planDabs(pts[pts.length - 2], p, w);
      this.bothSides(() => {
        for (const d of dots) this.dab(d.x, d.y, w);
      });
      return;
    }

    if (pts.length === 1) {
      // A tap should leave a dot, not nothing.
      this.bothSides(() => {
        this.ctx.fillStyle = this.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
        this.ctx.fill();
      });
      return;
    }

    // Midpoint smoothing: curve through the previous point, ending halfway to
    // the new one. Removes the faceted look of a raw polyline.
    this.bothSides(() => {
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = w;
      this.ctx.beginPath();
      if (pts.length === 2) {
        this.ctx.moveTo(pts[0].x, pts[0].y);
        this.ctx.lineTo(mid(pts[0], pts[1]).x, mid(pts[0], pts[1]).y);
      } else {
        const a = pts[pts.length - 3];
        const b = pts[pts.length - 2];
        const c = pts[pts.length - 1];
        const m1 = mid(a, b);
        const m2 = mid(b, c);
        this.ctx.moveTo(m1.x, m1.y);
        this.ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
      }
      this.ctx.stroke();
    });
  }

  /**
   * Mirror mode paints the same operations again, flipped about centre front.
   * Doing it with a transform rather than mirrored coordinates keeps one copy
   * of the drawing logic and mirrors gradients correctly too.
   */
  private bothSides(paint: () => void) {
    paint();
    if (this.mirrorX === null) return;
    this.ctx.save();
    this.ctx.setTransform(-1, 0, 0, 1, this.mirrorX * 2, 0);
    paint();
    this.ctx.restore();
  }

  /** Close the path to the final point so the stroke does not stop short. */
  private finishTail() {
    const pts = this.pts;
    if (this.tool === 'soft' || pts.length < 2) return;
    const b = pts[pts.length - 2];
    const c = pts[pts.length - 1];
    this.bothSides(() => {
      this.ctx.strokeStyle = this.color;
      this.ctx.lineWidth = Math.max(1, this.size);
      this.ctx.beginPath();
      this.ctx.moveTo(mid(b, c).x, mid(b, c).y);
      this.ctx.lineTo(c.x, c.y);
      this.ctx.stroke();
    });
  }

  /**
   * Soft brush: evenly spaced radial-gradient dabs. Spacing is measured along
   * the path, so density does not change with how fast the hand moves.
   */
  private planDabs(from: Point, to: Point, w: number): Point[] {
    const spacing = Math.max(1, w * 0.1);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) {
      this.carry = 0;
      return [to];
    }

    const out: Point[] = [];
    let d = spacing - this.carry;
    if (d <= 0) d = spacing;
    while (d <= dist) {
      const t = d / dist;
      out.push({ x: from.x + dx * t, y: from.y + dy * t });
      d += spacing;
    }
    this.carry = dist - (d - spacing);
    return out;
  }

  private dab(x: number, y: number, w: number) {
    const { r, g, b } = hexToRgb(this.color);
    const grad = this.ctx.createRadialGradient(x, y, 0, x, y, w / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.16)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.09)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(x, y, w / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private widthFor(pressure: number): number {
    // Pens report real pressure; mouse and touch report 0 or a flat 0.5.
    const usable = pressure > 0 && pressure !== 0.5;
    const factor = usable ? 0.35 + pressure * 0.65 : 1;
    return Math.max(1, this.size * factor);
  }

  private grow(p: Point, w: number) {
    const pad = w / 2 + 2;
    this.minY = Math.min(this.minY, p.y - pad);
    this.maxY = Math.max(this.maxY, p.y + pad);
    const xs = this.mirrorX === null ? [p.x] : [p.x, this.mirrorX * 2 - p.x];
    for (const x of xs) {
      this.minX = Math.min(this.minX, x - pad);
      this.maxX = Math.max(this.maxX, x + pad);
    }
  }

  /** Touched area, clamped to the canvas. Null when nothing landed on it. */
  dirtyRect(): Rect | null {
    const x = Math.max(0, Math.floor(this.minX));
    const y = Math.max(0, Math.floor(this.minY));
    const w = Math.min(CANVAS_W, Math.ceil(this.maxX)) - x;
    const h = Math.min(CANVAS_H, Math.ceil(this.maxY)) - y;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  }

  /** Paint the finished stroke onto a target canvas at the given opacity. */
  compositeOnto(target: HTMLCanvasElement, opacity: number) {
    const ctx = ctxOf(target);
    ctx.save();
    ctx.globalAlpha = opacity;
    if (this.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(this.scratch, 0, 0);
    ctx.restore();
  }

  end() {
    this.finishTail();
    this.active = false;
  }
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
