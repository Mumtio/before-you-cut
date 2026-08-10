import { useState } from 'react';
import { MAX_LAYERS } from '../constants';
import { useStudio } from '../state/store';

export function LayerPanel() {
  const layers = useStudio((s) => s.layers);
  const activeLayerId = useStudio((s) => s.activeLayerId);
  const setActiveLayer = useStudio((s) => s.setActiveLayer);
  const addLayer = useStudio((s) => s.addLayer);
  const removeLayer = useStudio((s) => s.removeLayer);
  const renameLayer = useStudio((s) => s.renameLayer);
  const toggleVisible = useStudio((s) => s.toggleVisible);
  const toggleLocked = useStudio((s) => s.toggleLocked);
  const setLayerOpacity = useStudio((s) => s.setLayerOpacity);
  const moveLayer = useStudio((s) => s.moveLayer);
  const clearLayer = useStudio((s) => s.clearLayer);

  const showBody = useStudio((s) => s.showBody);
  const showGuides = useStudio((s) => s.showGuides);
  const toggleBody = useStudio((s) => s.toggleBody);
  const toggleGuides = useStudio((s) => s.toggleGuides);

  const [editing, setEditing] = useState<string | null>(null);

  // Shown top-first, the way the eye reads a stack.
  const ordered = [...layers].reverse();

  return (
    <section className="panel grow">
      <h2 className="panel-title">
        Layers
        <button
          type="button"
          className="btn small"
          onClick={addLayer}
          disabled={layers.length >= MAX_LAYERS}
          title="Add a layer"
        >
          + Add
        </button>
      </h2>

      <div className="layer-list">
        {ordered.map((l) => {
          const active = l.id === activeLayerId;
          const index = layers.findIndex((x) => x.id === l.id);
          return (
            <div
              key={l.id}
              className={`layer${active ? ' active' : ''}${l.locked ? ' locked' : ''}`}
              onClick={() => setActiveLayer(l.id)}
            >
              <div className="layer-head">
                <button
                  type="button"
                  className={`icon-btn${l.visible ? '' : ' off'}`}
                  title={l.visible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisible(l.id);
                  }}
                >
                  {l.visible ? <EyeIcon /> : <EyeOffIcon />}
                </button>

                {editing === l.id ? (
                  <input
                    className="layer-name-input"
                    autoFocus
                    defaultValue={l.name}
                    onBlur={(e) => {
                      renameLayer(l.id, e.target.value.trim());
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="layer-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditing(l.id);
                    }}
                    title="Double-click to rename"
                  >
                    {l.name}
                  </span>
                )}

                <button
                  type="button"
                  className={`icon-btn${l.locked ? ' on' : ''}`}
                  title={l.locked ? 'Unlock' : 'Lock — keeps it visible but untouchable'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLocked(l.id);
                  }}
                >
                  {l.locked ? <LockIcon /> : <UnlockIcon />}
                </button>
              </div>

              {active && (
                <div className="layer-body">
                  <label className="slider-row tight">
                    <span>
                      Opacity <em>{Math.round(l.opacity * 100)}%</em>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(l.opacity * 100)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setLayerOpacity(l.id, Number(e.target.value) / 100)}
                    />
                  </label>
                  <div className="layer-actions">
                    <button
                      type="button"
                      className="btn tiny"
                      disabled={index >= layers.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(l.id, 1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn tiny"
                      disabled={index <= 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(l.id, -1);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn tiny"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearLayer(l.id);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn tiny danger"
                      disabled={layers.length <= 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(l.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Always at the bottom, always locked, never exported (spec §4). */}
        <SystemLayer name="Guides" on={showGuides} toggle={toggleGuides} />
        <SystemLayer name="Body" on={showBody} toggle={toggleBody} />
      </div>
    </section>
  );
}

function SystemLayer({ name, on, toggle }: { name: string; on: boolean; toggle: () => void }) {
  return (
    <div className="layer system" title="Underneath everything, locked, and left out of exports">
      <div className="layer-head">
        <button type="button" className={`icon-btn${on ? '' : ' off'}`} onClick={toggle}>
          {on ? <EyeIcon /> : <EyeOffIcon />}
        </button>
        <span className="layer-name">{name}</span>
        <span className="icon-btn static">
          <LockIcon />
        </span>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 4l16 16" />
      <path d="M6.5 7.2C3.9 8.9 2 12 2 12s4 6 10 6c1.6 0 3-.4 4.2-1" />
      <path d="M10 5.2A9.9 9.9 0 0112 5c6 0 10 6 10 6s-1.2 1.8-3.2 3.4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 017-2.6" />
    </svg>
  );
}
