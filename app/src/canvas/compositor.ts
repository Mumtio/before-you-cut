import { CANVAS_H, CANVAS_W } from '../constants';
import type { EditTarget, LayerMeta, Point, Region, View } from '../types';
import { baseKey, variantKey, workKey } from './keys';
import { ctxOf, getRaster, makeCanvas } from './rasters';
import { openPathOf, pathOf } from '../regions/geometry';

/** The stroke in progress, shown wherever its target sits in the stack. */
export interface Overlay {
  key: string;
  canvas: HTMLCanvasElement;
  erasing: boolean;
  opacity: number;
}

export interface SceneOptions {
  display: HTMLCanvasElement;
  dpr: number;
  view: View;
  layers: LayerMeta[]; // bottom -> top
  regions: Region[];
  editTarget: EditTarget;
  overlay: Overlay | null;
  merge: HTMLCanvasElement; // scratch, canvas-sized
  /** Body template and guide lines (spec §3), always beneath, never exported. */
  underlay?: (ctx: CanvasRenderingContext2D, scale: number) => void;
  lasso?: Point[] | null;
  showBoundaries?: boolean;
  /** Painted fabric masks, shown as a coloured wash over the artwork (spec §7). */
  washes?: { key: string; color: string }[];
  background?: string;
  paper?: string;
}

let washScratch: HTMLCanvasElement | null = null;

function drawWashes(
  ctx: CanvasRenderingContext2D,
  washes: { key: string; color: string }[],
  srcFor: (key: string) => HTMLCanvasElement,
) {
  if (!washScratch) washScratch = makeCanvas(CANVAS_W, CANVAS_H);
  const scratch = washScratch;
  const sctx = ctxOf(scratch);

  for (const wash of washes) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    sctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    sctx.drawImage(srcFor(wash.key), 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = wash.color;
    sctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.globalAlpha = 0.42;
    ctx.drawImage(scratch, 0, 0);
    ctx.globalAlpha = 1;
  }
}

/**
 * A layer is a base raster plus its parts (spec §5). Draw the base, then each
 * part clipped to its boundary showing whichever version is active.
 *
 * The one exception is the part being edited: it is drawn unclipped, so strokes
 * are allowed to spill over the boundary while the hand is moving. They get
 * clipped when the version is saved, not before.
 */
function drawLayerContent(
  ctx: CanvasRenderingContext2D,
  layer: LayerMeta,
  regions: Region[],
  editTarget: EditTarget,
  srcFor: (key: string) => HTMLCanvasElement,
  live: boolean,
) {
  ctx.drawImage(srcFor(baseKey(layer.id)), 0, 0);

  for (const r of regions) {
    const editing = live && editTarget.kind === 'region' && editTarget.id === r.id;
    if (editing) {
      ctx.drawImage(srcFor(workKey(r.id)), 0, 0);
      continue;
    }
    ctx.save();
    ctx.clip(pathOf(r.points));
    ctx.drawImage(srcFor(variantKey(r.activeVariantId)), 0, 0);
    ctx.restore();
  }
}

export function renderScene(o: SceneOptions) {
  const { display, dpr, view, layers, regions, overlay, merge } = o;
  const ctx = ctxOf(display);
  const cssW = display.width / dpr;
  const cssH = display.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = o.background ?? '#101216';
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.tx, dpr * view.ty);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24 / view.scale;
  ctx.shadowOffsetY = 6 / view.scale;
  ctx.fillStyle = o.paper ?? '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();

  o.underlay?.(ctx, view.scale);

  // The live stroke has to sit at its target's place in the stack, under
  // everything above it — so merge the two before drawing.
  if (overlay) {
    const mctx = ctxOf(merge);
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    mctx.globalAlpha = 1;
    mctx.globalCompositeOperation = 'source-over';
    mctx.drawImage(getRaster(overlay.key), 0, 0);
    mctx.globalAlpha = overlay.opacity;
    if (overlay.erasing) mctx.globalCompositeOperation = 'destination-out';
    mctx.drawImage(overlay.canvas, 0, 0);
    mctx.globalAlpha = 1;
    mctx.globalCompositeOperation = 'source-over';
  }
  const srcFor = (key: string) => (overlay && overlay.key === key ? merge : getRaster(key));

  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    drawLayerContent(
      ctx,
      layer,
      regions.filter((r) => r.layerId === layer.id),
      o.editTarget,
      srcFor,
      true,
    );
  }
  ctx.globalAlpha = 1;

  if (o.washes?.length) drawWashes(ctx, o.washes, srcFor);
  if (o.showBoundaries) drawBoundaries(ctx, o);
  if (o.lasso && o.lasso.length > 1) drawLasso(ctx, o.lasso, view.scale);

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1 / view.scale;
  ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBoundaries(ctx: CanvasRenderingContext2D, o: SceneOptions) {
  const px = 1 / o.view.scale;
  const visible = new Set(o.layers.filter((l) => l.visible).map((l) => l.id));
  ctx.save();
  for (const r of o.regions) {
    if (!visible.has(r.layerId)) continue;
    const selected = o.editTarget.kind === 'region' && o.editTarget.id === r.id;
    const path = pathOf(r.points);
    if (selected) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(217,164,95,0.95)';
      ctx.lineWidth = 1.8 * px;
    } else {
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.strokeStyle = 'rgba(90,140,200,0.5)';
      ctx.lineWidth = 1.2 * px;
    }
    ctx.stroke(path);
  }
  ctx.restore();
}

/**
 * The boundary being drawn is a line, not a marquee: same smoothing as a brush
 * stroke, solid, following the hand. Only the chord that will close it is drawn
 * dashed, because that part is the app's doing rather than the designer's.
 */
function drawLasso(ctx: CanvasRenderingContext2D, pts: Point[], scale: number) {
  const px = 1 / scale;
  const first = pts[0];
  const last = pts[pts.length - 1];

  ctx.save();

  ctx.fillStyle = 'rgba(217,164,95,0.07)';
  ctx.fill(pathOf(pts));

  ctx.setLineDash([6 * px, 5 * px]);
  ctx.strokeStyle = 'rgba(217,164,95,0.45)';
  ctx.lineWidth = 1.2 * px;
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(first.x, first.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(217,164,95,0.98)';
  ctx.lineWidth = 2 * px;
  ctx.stroke(openPathOf(pts));

  // Where it started, so it is obvious what the line is closing back to.
  ctx.fillStyle = 'rgba(217,164,95,0.98)';
  ctx.beginPath();
  ctx.arc(first.x, first.y, 3 * px, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Flatten the visible layers, parts included — the flat garment for export.
 *
 * An optional combination overrides which version of each part is drawn, which
 * is what lets the combinations grid render dozens of alternatives without
 * disturbing the canvas. Pure local compositing, so it costs nothing (spec §5).
 */
export function flatten(
  layers: LayerMeta[],
  regions: Region[],
  into: HTMLCanvasElement,
  combination?: Record<string, string>,
) {
  const effective = combination
    ? regions.map((r) => ({ ...r, activeVariantId: combination[r.id] ?? r.activeVariantId }))
    : regions;
  const ctx = ctxOf(into);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, into.width, into.height);
  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    drawLayerContent(
      ctx,
      layer,
      effective.filter((r) => r.layerId === layer.id),
      { kind: 'layer', id: '' },
      getRaster,
      false,
    );
  }
  ctx.globalAlpha = 1;
}
