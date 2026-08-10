import type { ReactNode } from 'react';
import type { ToolId } from '../types';
import { BRUSH_MAX, BRUSH_MIN } from '../constants';
import { useStudio } from '../state/store';

const TOOLS: { id: ToolId; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: 'pencil',
    label: 'Pencil',
    hint: 'Hard edge, for outlines · B',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" />
        <path d="M15 6l3 3" />
      </svg>
    ),
  },
  {
    id: 'soft',
    label: 'Soft brush',
    hint: 'Shading and volume · S',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" opacity="0.35" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    id: 'fill',
    label: 'Flat fill',
    hint: 'Fill an enclosed area · G',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M5 12l7-7 7 7-7 7-7-7z" />
        <path d="M19 15c1.5 2 1.5 4 0 4s-1.5-2 0-4z" />
      </svg>
    ),
  },
  {
    id: 'eraser',
    label: 'Eraser',
    hint: 'Take it back off · E',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M8 20H5l-2-3 9-11 6 5-8 9z" />
        <path d="M9 12l6 5" />
      </svg>
    ),
  },
  {
    id: 'hand',
    label: 'Move canvas',
    hint: 'Drag the canvas around · H',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M9 11V5.5a1.5 1.5 0 013 0V11" />
        <path d="M12 11V4.5a1.5 1.5 0 013 0V11" />
        <path d="M15 11.5V7a1.5 1.5 0 013 0v6.5a7 7 0 01-7 7h-1a6 6 0 01-4.6-2.2L4 15.5a1.6 1.6 0 012.3-2.2L9 15.5V6a1.5 1.5 0 013 0" />
      </svg>
    ),
  },
];

export function ToolPanel() {
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const size = useStudio((s) => s.size);
  const setSize = useStudio((s) => s.setSize);
  const opacity = useStudio((s) => s.opacity);
  const setOpacity = useStudio((s) => s.setOpacity);
  const color = useStudio((s) => s.color);

  return (
    <section className="panel">
      <h2 className="panel-title">Tools</h2>

      <div className="tool-grid">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool${tool === t.id ? ' active' : ''}`}
            onClick={() => setTool(t.id)}
            title={t.hint}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <label className="slider-row" hidden={tool === 'hand'}>
        <span>
          Size <em>{size}px</em>
        </span>
        <input
          type="range"
          min={BRUSH_MIN}
          max={BRUSH_MAX}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />
      </label>

      <label className="slider-row" hidden={tool === 'hand'}>
        <span>
          Opacity <em>{Math.round(opacity * 100)}%</em>
        </span>
        <input
          type="range"
          min={1}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => setOpacity(Number(e.target.value) / 100)}
        />
      </label>

      <div className="stroke-preview" hidden={tool === 'hand'}>
        <div
          className="stroke-dot"
          style={{
            width: Math.min(64, size),
            height: Math.min(64, size),
            opacity,
            background: color,
            filter: tool === 'soft' ? `blur(${Math.min(12, size / 4)}px)` : 'none',
          }}
        />
      </div>
    </section>
  );
}
