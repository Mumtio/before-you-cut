import { useCallback, useEffect, useRef } from 'react';
import { CANVAS_H, CANVAS_W } from '../constants';
import { computeBody } from '../body/model';
import { drawUnderlay } from '../body/draw';
import { ctxOf } from '../canvas/rasters';
import { useStudio } from '../state/store';

/**
 * The body on its own, drawn at whatever size the container gives it. Used on
 * the setup screen, where the figure is the whole point.
 */
export function BodyPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliders = useStudio((s) => s.sliders);

  const draw = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const { width, height } = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const scale = Math.min(width / CANVAS_W, height / CANVAS_H) * 0.96;
    const tx = (width - CANVAS_W * scale) / 2;
    const ty = (height - CANVAS_H * scale) / 2;

    const ctx = ctxOf(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawUnderlay(ctx, computeBody(useStudio.getState().sliders), {
      scale,
      showBody: true,
      showGuides: true,
      bodyOpacity: 1,
      mirror: false,
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(draw, [draw, sliders]);

  return (
    <div className="body-preview" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
