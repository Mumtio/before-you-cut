import type { BodyGeometry, Cmd, Pt } from './model';

function emit(ctx: CanvasRenderingContext2D, cx: number, c: Cmd, s: number) {
  const X = (p: Pt) => cx + s * p.dx;
  if (c.c1 && c.c2) ctx.bezierCurveTo(X(c.c1), c.c1.y, X(c.c2), c.c2.y, X(c.to), c.to.y);
  else ctx.lineTo(X(c.to), c.to.y);
}

/** One closed outline: right half forward, then the same list mirrored and reversed. */
export function traceBody(ctx: CanvasRenderingContext2D, geo: BodyGeometry) {
  const { cx, start, cmds } = geo;
  ctx.beginPath();
  ctx.moveTo(cx + start.dx, start.y);
  for (const c of cmds) emit(ctx, cx, c, 1);

  const pts: Pt[] = [start, ...cmds.map((c) => c.to)];
  for (let i = cmds.length - 1; i >= 0; i--) {
    const c = cmds[i];
    emit(ctx, cx, { to: pts[i], c1: c.c2, c2: c.c1 }, -1);
  }
  ctx.closePath();
}

export interface UnderlayOptions {
  scale: number;
  showBody: boolean;
  showGuides: boolean;
  bodyOpacity: number;
  mirror: boolean;
}

export function drawUnderlay(ctx: CanvasRenderingContext2D, geo: BodyGeometry, o: UnderlayOptions) {
  if (o.showBody) drawBody(ctx, geo, o);
  if (o.showGuides) drawGuides(ctx, geo, o);
  else if (o.mirror) drawCentreFront(ctx, geo, o);
}

function drawBody(ctx: CanvasRenderingContext2D, geo: BodyGeometry, o: UnderlayOptions) {
  ctx.save();
  ctx.globalAlpha = o.bodyOpacity;

  traceBody(ctx, geo);
  const grad = ctx.createLinearGradient(geo.cx - geo.half.widest, 0, geo.cx + geo.half.widest, 0);
  grad.addColorStop(0, '#dcd5cb');
  grad.addColorStop(0.42, '#efeae3');
  grad.addColorStop(1, '#d6cec3');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(96, 88, 78, 0.5)';
  ctx.lineWidth = 1.4 / o.scale;
  ctx.stroke();

  ctx.restore();
}

function drawGuides(ctx: CanvasRenderingContext2D, geo: BodyGeometry, o: UnderlayOptions) {
  const px = 1 / o.scale;

  ctx.save();
  ctx.lineWidth = 1.1 * px;
  ctx.font = `${12 * px}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  const horizontals = geo.guides.filter((g) => g.type === 'horizontal');

  // Reserve room for the labels, then keep the lines symmetrical about centre
  // front. Without this the ends walk off the paper as the figure grows and the
  // labels get clipped by the canvas edge.
  const labelW = Math.max(...horizontals.map((g) => ctx.measureText(g.name).width));
  const gutter = labelW + 22 * px;
  const wanted = geo.half.widest + geo.unit * 1.25;
  const half = Math.max(geo.half.widest * 1.04, Math.min(geo.cx - gutter, wanted));
  const x0 = geo.cx - half;
  const x1 = geo.cx + half;

  for (const g of horizontals) {
    ctx.strokeStyle = 'rgba(190, 128, 46, 0.55)';
    ctx.setLineDash([7 * px, 6 * px]);
    ctx.beginPath();
    ctx.moveTo(x0, g.position);
    ctx.lineTo(x1, g.position);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(150, 98, 30, 0.85)';
    ctx.textAlign = 'right';
    ctx.fillText(g.name, x0 - 8 * px, g.position);
  }

  ctx.restore();
  drawCentreFront(ctx, geo, o);
}

function drawCentreFront(ctx: CanvasRenderingContext2D, geo: BodyGeometry, o: UnderlayOptions) {
  const px = 1 / o.scale;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(geo.cx, geo.y.headTop - geo.unit * 0.2);
  ctx.lineTo(geo.cx, geo.y.ankle + geo.unit * 0.3);
  if (o.mirror) {
    // Solid and brighter, because now it is doing something.
    ctx.strokeStyle = 'rgba(217, 164, 95, 0.95)';
    ctx.lineWidth = 1.4 * px;
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = 'rgba(190, 128, 46, 0.5)';
    ctx.lineWidth = 1.1 * px;
    ctx.setLineDash([7 * px, 6 * px]);
  }
  ctx.stroke();

  if (o.mirror) {
    ctx.setLineDash([]);
    ctx.font = `${11 * px}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(217, 164, 95, 0.95)';
    ctx.fillText('mirroring', geo.cx, geo.y.headTop - geo.unit * 0.32);
  }
  ctx.restore();
}
