import { useCallback, useEffect, useRef, useState } from 'react';
import type { HSV } from '../canvas/color';
import { hexToHsv, hsvToHex, hsvToRgb } from '../canvas/color';
import { useStudio } from '../state/store';

const SIZE = 172;
const RADIUS = SIZE / 2 - 4;

export function ColorPicker() {
  const color = useStudio((s) => s.color);
  const setColor = useStudio((s) => s.setColor);
  const swatches = useStudio((s) => s.swatches);
  const addSwatch = useStudio((s) => s.addSwatch);
  const removeSwatch = useStudio((s) => s.removeSwatch);

  const wheelRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color));
  const [hexDraft, setHexDraft] = useState(color);

  // Follow the store when colour is set from elsewhere (a swatch, a shortcut).
  useEffect(() => {
    if (hsvToHex(hsv) !== color) setHsv(hexToHsv(color));
    setHexDraft(color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => {
    const c = wheelRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        const r = Math.hypot(dx, dy);
        const i = (y * SIZE + x) * 4;
        if (r > RADIUS + 1) continue;
        const h = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        // Drawn at full brightness whatever the current value — a wheel that
        // goes black when you pick a dark colour is unusable.
        const { r: rr, g, b } = hsvToRgb({ h, s: Math.min(1, r / RADIUS), v: 1 });
        d[i] = rr;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = r > RADIUS ? Math.round((RADIUS + 1 - r) * 255) : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const c = wheelRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const dx = clientX - rect.left - SIZE / 2;
      const dy = clientY - rect.top - SIZE / 2;
      const r = Math.min(RADIUS, Math.hypot(dx, dy));
      const h = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const next: HSV = { h: (h + 360) % 360, s: r / RADIUS, v: hsv.v };
      setHsv(next);
      setColor(hsvToHex(next));
    },
    [hsv.v, setColor],
  );

  const markerAngle = ((hsv.h - 90) * Math.PI) / 180;
  const markerX = SIZE / 2 + Math.cos(markerAngle) * hsv.s * RADIUS;
  const markerY = SIZE / 2 + Math.sin(markerAngle) * hsv.s * RADIUS;

  const applyHex = () => {
    const v = hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      setColor(hsvToHex(hexToHsv(v)));
    } else {
      setHexDraft(color);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel-title">Colour</h2>

      <div className="wheel-wrap" style={{ width: SIZE, height: SIZE }}>
        <canvas
          ref={wheelRef}
          width={SIZE}
          height={SIZE}
          className="wheel"
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => draggingRef.current && pick(e.clientX, e.clientY)}
          onPointerUp={(e) => {
            draggingRef.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />
        {/* Hints at the current brightness without hiding the hues. */}
        <span className="wheel-shade" style={{ opacity: (1 - hsv.v) * 0.55 }} />
        <span
          className="wheel-marker"
          style={{ left: markerX, top: markerY, background: color }}
        />
      </div>

      <label className="slider-row">
        <span>Brightness</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hsv.v * 100)}
          onChange={(e) => {
            const next = { ...hsv, v: Number(e.target.value) / 100 };
            setHsv(next);
            setColor(hsvToHex(next));
          }}
          style={{
            background: `linear-gradient(90deg, #000, ${hsvToHex({ h: hsv.h, s: hsv.s, v: 1 })})`,
          }}
        />
      </label>

      <div className="hex-row">
        <span className="hex-chip" style={{ background: color }} />
        <input
          className="hex-input"
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={applyHex}
          onKeyDown={(e) => e.key === 'Enter' && applyHex()}
          spellCheck={false}
        />
        <button type="button" className="btn small" onClick={() => addSwatch(color)}>
          Save
        </button>
      </div>

      <div className="swatches">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${c === color ? ' active' : ''}`}
            style={{ background: c }}
            title={`${c} — right-click to remove`}
            onClick={() => setColor(c)}
            onContextMenu={(e) => {
              e.preventDefault();
              removeSwatch(c);
            }}
          />
        ))}
      </div>
    </section>
  );
}
