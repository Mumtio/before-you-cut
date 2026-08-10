import { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W, MAX_SCALE, MIN_SCALE } from '../constants';
import type { Point, Rect, View } from '../types';
import { renderScene } from '../canvas/compositor';
import { ctxOf, getRaster, makeCanvas } from '../canvas/rasters';
import { targetKey } from '../canvas/keys';
import { pushEntry, snapshot } from '../canvas/history';
import { StrokeSession } from '../canvas/stroke';
import { planFill } from '../canvas/fill';
import { computeBody } from '../body/model';
import { drawUnderlay } from '../body/draw';
import { simplify, snapToGuides } from '../regions/geometry';
import { excludeRegions } from '../regions/ops';
import { PENDING_KEY, zoneKey } from '../fabric/zones';
import { useStudio } from '../state/store';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function CanvasStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const sessionRef = useRef<StrokeSession | null>(null);
  const mergeRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const spaceRef = useRef(false);
  const modeRef = useRef<'idle' | 'draw' | 'pan' | 'lasso'>('idle');
  const lassoRef = useRef<Point[]>([]);

  const [zoomPct, setZoomPct] = useState(100);
  const [panReady, setPanReady] = useState(false);

  const layers = useStudio((s) => s.layers);
  const regions = useStudio((s) => s.regions);
  const editTarget = useStudio((s) => s.editTarget);
  const drawingPart = useStudio((s) => s.drawingPart);
  const paintingZone = useStudio((s) => s.paintingZone);
  const zonePending = useStudio((s) => s.zonePending);
  const fabricZones = useStudio((s) => s.fabricZones);
  const bottomTab = useStudio((s) => s.bottomTab);
  const showBoundaries = useStudio((s) => s.showBoundaries);
  const pixelVersion = useStudio((s) => s.pixelVersion);
  const tool = useStudio((s) => s.tool);
  const size = useStudio((s) => s.size);
  const sliders = useStudio((s) => s.sliders);
  const showBody = useStudio((s) => s.showBody);
  const showGuides = useStudio((s) => s.showGuides);
  const bodyOpacity = useStudio((s) => s.bodyOpacity);
  const mirror = useStudio((s) => s.mirror);

  if (!sessionRef.current) sessionRef.current = new StrokeSession();
  if (!mergeRef.current) mergeRef.current = makeCanvas();

  const draw = useCallback(() => {
    const display = canvasRef.current;
    const merge = mergeRef.current;
    if (!display || !merge) return;
    const st = useStudio.getState();
    const sess = sessionRef.current;
    const geo = computeBody(st.sliders);
    renderScene({
      display,
      dpr: window.devicePixelRatio || 1,
      view: viewRef.current,
      layers: st.layers,
      regions: st.regions,
      editTarget: st.editTarget,
      merge,
      showBoundaries: st.showBoundaries && !st.paintingZone,
      lasso: modeRef.current === 'lasso' ? lassoRef.current : null,
      washes:
        st.bottomTab === 'fabric' || st.paintingZone || st.zonePending
          ? [
              ...st.fabricZones.map((z) => ({ key: zoneKey(z.id), color: z.color })),
              ...(st.paintingZone || st.zonePending
                ? [{ key: PENDING_KEY, color: '#ffffff' }]
                : []),
            ]
          : [],
      underlay: (c, scale) =>
        drawUnderlay(c, geo, {
          scale,
          showBody: st.showBody,
          showGuides: st.showGuides,
          bodyOpacity: st.bodyOpacity,
          mirror: st.mirror,
        }),
      overlay:
        sess && sess.active
          ? {
              key: targetKey(st.editTarget),
              canvas: sess.scratch,
              erasing: sess.isErasing,
              opacity: st.opacity,
            }
          : null,
    });
  }, []);

  const request = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { width, height } = wrap.getBoundingClientRect();
    const scale = Math.min(width / CANVAS_W, height / CANVAS_H) * 0.92;
    viewRef.current = {
      scale,
      tx: (width - CANVAS_W * scale) / 2,
      ty: (height - CANVAS_H * scale) / 2,
    };
    setZoomPct(Math.round(scale * 100));
    request();
  }, [request]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const display = canvasRef.current;
    if (!wrap || !display) return;
    let first = true;
    let prevW = 0;
    let prevH = 0;
    const ro = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      display.width = Math.max(1, Math.round(width * dpr));
      display.height = Math.max(1, Math.round(height * dpr));
      display.style.width = `${width}px`;
      display.style.height = `${height}px`;
      if (first) {
        first = false;
        fit();
      } else {
        // Collapsing a panel gives the stage more room on one side. Take half
        // of it, so the drawing stays where the eye left it instead of
        // appearing to jump sideways.
        viewRef.current = {
          ...viewRef.current,
          tx: viewRef.current.tx + (width - prevW) / 2,
          ty: viewRef.current.ty + (height - prevH) / 2,
        };
        request();
      }
      prevW = width;
      prevH = height;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, request]);

  useEffect(() => {
    request();
  }, [
    layers,
    regions,
    editTarget,
    showBoundaries,
    pixelVersion,
    sliders,
    showBody,
    showGuides,
    bodyOpacity,
    mirror,
    paintingZone,
    zonePending,
    fabricZones,
    bottomTab,
    request,
  ]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && useStudio.getState().drawingPart) {
        modeRef.current = 'idle';
        lassoRef.current = [];
        useStudio.getState().cancelPart();
        request();
        return;
      }
      if (e.code === 'Space' && !spaceRef.current) {
        const el = e.target as HTMLElement | null;
        if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
        spaceRef.current = true;
        setPanReady(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setPanReady(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [request]);

  const toDoc = useCallback((clientX: number, clientY: number): Point => {
    const display = canvasRef.current;
    if (!display) return { x: 0, y: 0 };
    const r = display.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.tx) / v.scale, y: (clientY - r.top - v.ty) / v.scale };
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const display = canvasRef.current;
      if (!display) return;
      const r = display.getBoundingClientRect();
      const v = viewRef.current;
      const next = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const sx = clientX - r.left;
      const sy = clientY - r.top;
      viewRef.current = {
        scale: next,
        tx: sx - (sx - v.tx) * (next / v.scale),
        ty: sy - (sy - v.ty) * (next / v.scale),
      };
      setZoomPct(Math.round(next * 100));
      request();
    },
    [request],
  );

  const zoomCentre = useCallback(
    (factor: number) => {
      const display = canvasRef.current;
      if (!display) return;
      const r = display.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    },
    [zoomAt],
  );

  useEffect(() => {
    const display = canvasRef.current;
    if (!display) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) {
        const v = viewRef.current;
        viewRef.current = { ...v, ty: v.ty - e.deltaY };
        request();
        return;
      }
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    display.addEventListener('wheel', onWheel, { passive: false });
    return () => display.removeEventListener('wheel', onWheel);
  }, [request, zoomAt]);

  const moveCursorRing = useCallback((clientX: number, clientY: number) => {
    const ring = cursorRef.current;
    const display = canvasRef.current;
    if (!ring || !display) return;
    const r = display.getBoundingClientRect();
    const d = Math.max(6, useStudio.getState().size * viewRef.current.scale);
    ring.style.width = `${d}px`;
    ring.style.height = `${d}px`;
    ring.style.transform = `translate(${clientX - r.left - d / 2}px, ${clientY - r.top - d / 2}px)`;
  }, []);

  /** Boundary points get a light pull onto nearby guide lines. */
  const lassoPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const st = useStudio.getState();
      const p = toDoc(clientX, clientY);
      if (!st.snapToGuides) return p;
      const tol = 10 / viewRef.current.scale;
      return snapToGuides(p, computeBody(st.sliders).guides, tol).point;
    },
    [toDoc],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useStudio.getState();
    // Several ways in, because the one people reach for first varies: a tool,
    // the space bar, either of the buttons a brush is not using.
    const wantsPan =
      st.tool === 'hand' || e.button === 1 || e.button === 2 || spaceRef.current || e.altKey;

    if (wantsPan) {
      modeRef.current = 'pan';
      panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    // Painting a fabric zone goes to the selection mask, not to any layer —
    // masks are not part of the artwork and never live on one.
    if (st.paintingZone) {
      modeRef.current = 'draw';
      e.currentTarget.setPointerCapture(e.pointerId);
      sessionRef.current!.begin(
        st.tool === 'eraser' ? 'eraser' : 'pencil',
        st.size,
        '#ffffff',
        toDoc(e.clientX, e.clientY),
        e.pressure,
        st.mirror ? CANVAS_W / 2 : null,
      );
      request();
      return;
    }

    if (st.drawingPart) {
      modeRef.current = 'lasso';
      lassoRef.current = [lassoPoint(e.clientX, e.clientY)];
      e.currentTarget.setPointerCapture(e.pointerId);
      request();
      return;
    }

    const layer = st.layers.find((l) => l.id === st.activeLayerId);
    if (!layer) return;
    if (layer.locked) {
      st.say(`"${layer.name}" is locked. Unlock it to draw.`);
      return;
    }
    if (!layer.visible) {
      st.say(`"${layer.name}" is hidden. Show it to draw.`);
      return;
    }

    const key = targetKey(st.editTarget);
    const p = toDoc(e.clientX, e.clientY);

    if (st.tool === 'fill') {
      const raster = getRaster(key);
      const seeds = st.mirror ? [p, { x: CANVAS_W - p.x, y: p.y }] : [p];
      const plans = seeds
        .map((seed) => planFill(raster, seed, st.color))
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (!plans.length) return;

      const rect = plans.reduce((acc, cur) => union(acc, cur.rect), plans[0].rect);
      const before = snapshot(key, rect);
      const ctx = ctxOf(raster);
      ctx.save();
      ctx.globalAlpha = st.opacity;
      for (const plan of plans) ctx.drawImage(plan.stamp, 0, 0);
      ctx.restore();
      pushEntry(key, rect, before, 'Fill');
      st.markDirty();
      st.touchPixels();
      return;
    }

    modeRef.current = 'draw';
    e.currentTarget.setPointerCapture(e.pointerId);
    sessionRef.current!.begin(
      st.tool,
      st.size,
      st.color,
      p,
      e.pressure,
      st.mirror ? CANVAS_W / 2 : null,
    );
    request();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    moveCursorRing(e.clientX, e.clientY);

    if (modeRef.current === 'pan' && panRef.current) {
      const p = panRef.current;
      viewRef.current = { ...viewRef.current, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) };
      request();
      return;
    }

    // Coalesced events recover the points the browser batched away, which is
    // the difference between a smooth curve and a chain of straight segments.
    // A boundary is captured exactly like a stroke, for the same reason.
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function'
      ? e.nativeEvent.getCoalescedEvents()
      : [e.nativeEvent];
    const points = events.length ? events : [e.nativeEvent];

    if (modeRef.current === 'lasso') {
      const pts = lassoRef.current;
      const minStep = 1.2 / viewRef.current.scale;
      for (const ev of points) {
        const p = lassoPoint(ev.clientX, ev.clientY);
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > minStep) pts.push(p);
      }
      request();
      return;
    }

    if (modeRef.current !== 'draw') return;
    const sess = sessionRef.current!;
    for (const ev of points) {
      sess.extend(toDoc(ev.clientX, ev.clientY), ev.pressure);
    }
    request();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const release = () => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone
      }
    };

    if (modeRef.current === 'pan') {
      modeRef.current = 'idle';
      panRef.current = null;
      release();
      return;
    }

    if (modeRef.current === 'lasso') {
      modeRef.current = 'idle';
      const pts = simplify(lassoRef.current, 2);
      lassoRef.current = [];
      release();
      request();
      useStudio.getState().proposePart(pts);
      return;
    }

    if (modeRef.current !== 'draw') return;
    modeRef.current = 'idle';

    const st = useStudio.getState();
    const sess = sessionRef.current!;
    sess.end();
    const rect = sess.dirtyRect();

    if (st.paintingZone) {
      if (rect) {
        const before = snapshot(PENDING_KEY, rect);
        sess.compositeOnto(getRaster(PENDING_KEY), 1);
        pushEntry(PENDING_KEY, rect, before, 'Select');
      }
      release();
      st.touchPixels();
      return;
    }

    if (rect) {
      const key = targetKey(st.editTarget);
      // Pixels inside a part belong to that part, never to the layer under it.
      if (st.editTarget.kind === 'layer') {
        excludeRegions(
          sess.scratch,
          st.regions.filter((r) => r.layerId === st.editTarget.id).map((r) => r.points),
        );
      }
      const before = snapshot(key, rect);
      sess.compositeOnto(getRaster(key), st.opacity);
      pushEntry(key, rect, before, st.tool === 'eraser' ? 'Erase' : 'Stroke');
      st.markDirty();
    }
    release();
    st.touchPixels();
  };

  const handMode = tool === 'hand' || panReady;
  const showRing = tool !== 'fill' && tool !== 'hand' && !drawingPart;
  const cursor = drawingPart ? 'crosshair' : handMode ? 'grab' : showRing ? 'none' : 'crosshair';

  return (
    <div className={`stage${drawingPart ? ' cutting' : ''}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={() => {
          if (cursorRef.current) cursorRef.current.style.opacity = '0';
        }}
        onPointerEnter={() => {
          if (cursorRef.current) cursorRef.current.style.opacity = showRing ? '1' : '0';
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div
        ref={cursorRef}
        className="brush-ring"
        style={{ opacity: showRing ? 1 : 0, width: size, height: size }}
      />

      {drawingPart && (
        <div className="stage-banner">
          Draw a closed boundary around the area you want to swap — <kbd>Esc</kbd> to cancel
        </div>
      )}
      {paintingZone && (
        <div className="stage-banner">
          Paint over the area made of one fabric · the eraser takes it back off
        </div>
      )}

      <div className="stage-hud">
        <button type="button" onClick={() => zoomCentre(1 / 1.25)} title="Zoom out">
          −
        </button>
        <button type="button" className="hud-zoom" onClick={fit} title="Fit to screen">
          {zoomPct}%
        </button>
        <button type="button" onClick={() => zoomCentre(1.25)} title="Zoom in">
          +
        </button>
      </div>

      <div className="stage-hint">
        Move it: the <strong>hand tool</strong>, right-drag, or hold <kbd>space</kbd> · scroll to zoom
      </div>
    </div>
  );
}
