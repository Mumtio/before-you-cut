import { useEffect, useState } from 'react';
import { FABRIC_PRESETS } from '../fabric/presets';
import { staleZones } from '../fabric/zones';
import { useStudio } from '../state/store';
import type { FabricZone } from '../types';
import { Dialog } from './Dialog';

/** What one masked-replacement call costs, from the API's own price list. */
export const UNITS_PER_ZONE = 1;

export function FabricBar() {
  const zones = useStudio((s) => s.fabricZones);
  const baseFabricNote = useStudio((s) => s.baseFabricNote);
  const setBaseFabricNote = useStudio((s) => s.setBaseFabricNote);
  const paintingZone = useStudio((s) => s.paintingZone);
  const startZone = useStudio((s) => s.startZone);
  const cancelZone = useStudio((s) => s.cancelZone);
  const finishPainting = useStudio((s) => s.finishPainting);
  const regions = useStudio((s) => s.regions);
  const setScreen = useStudio((s) => s.setScreen);

  const combination: Record<string, string> = {};
  for (const r of regions) combination[r.id] = r.activeVariantId;
  const stale = staleZones(zones, combination);

  return (
    <>
      <div className="parts-head">
        <div className="parts-title">
          <span>
            Painted areas, not boundaries. A sheer overlay can cover a whole bodice and half a
            skirt regardless of where you cut your parts.
          </span>
        </div>
        <div className="parts-actions">
          <span className="cost-note" title="One call for the lot, whatever the zone count">
            {zones.length} zone{zones.length === 1 ? '' : 's'} · <strong>1 unit</strong> to render
            {zones.length > 1 && `, or ${zones.length * UNITS_PER_ZONE} zone by zone`}
          </span>
          <button
            type="button"
            className="btn"
            disabled={!zones.length}
            onClick={() => setScreen('render')}
          >
            Make it real →
          </button>
          {paintingZone ? (
            <>
              <button type="button" className="btn" onClick={cancelZone}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={finishPainting}>
                That’s the area
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={startZone}>
              + Paint an area
            </button>
          )}
        </div>
      </div>

      {stale.length > 0 && (
        <p className="zone-warning">
          {stale.length === 1 ? 'One zone was' : `${stale.length} zones were`} painted on a
          different set of versions. The masks may no longer match what is on the canvas — repaint
          them before rendering. Nothing has been moved automatically, because that goes wrong
          quietly.
        </p>
      )}

      <div className="parts-strip">
        <label className="base-note">
          <span>Everything else</span>
          <input
            value={baseFabricNote}
            placeholder="what the rest of it is made of"
            onChange={(e) => setBaseFabricNote(e.target.value)}
          />
        </label>

        {zones.length === 0 ? (
          <p className="parts-empty">
            Paint over an area of the dress and say what it is made of — “silk chiffon, semi-sheer,
            soft drape”, “structured cotton twill”. Three to five zones is a realistic dress; each
            one costs a call when you render.
          </p>
        ) : (
          zones.map((z) => <ZoneCard key={z.id} zone={z} stale={stale.includes(z)} />)
        )}
      </div>

      <ZoneDialog />
    </>
  );
}

function ZoneCard({ zone, stale }: { zone: FabricZone; stale: boolean }) {
  const editZone = useStudio((s) => s.editZone);
  const removeZone = useStudio((s) => s.removeZone);
  const updateZone = useStudio((s) => s.updateZone);

  return (
    <div className={`zone-card${stale ? ' stale' : ''}`}>
      <div className="zone-head">
        <span className="zone-swatch" style={{ background: zone.color }} />
        <input
          className="zone-name"
          value={zone.name}
          onChange={(e) => updateZone(zone.id, { name: e.target.value })}
        />
        <button type="button" className="icon-btn" title="Remove" onClick={() => removeZone(zone.id)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
          </svg>
        </button>
      </div>
      <textarea
        className="zone-note"
        value={zone.fabricNote}
        placeholder="what is it made of"
        onChange={(e) => updateZone(zone.id, { fabricNote: e.target.value })}
      />
      <button type="button" className="btn tiny" onClick={() => editZone(zone.id)}>
        Repaint the area
      </button>
    </div>
  );
}

function ZoneDialog() {
  const zonePending = useStudio((s) => s.zonePending);
  const editingZoneId = useStudio((s) => s.editingZoneId);
  const zones = useStudio((s) => s.fabricZones);
  const confirmZone = useStudio((s) => s.confirmZone);
  const cancelZone = useStudio((s) => s.cancelZone);

  const editing = zones.find((z) => z.id === editingZoneId);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (zonePending) {
      setName(editing?.name ?? '');
      setNote(editing?.fabricNote ?? '');
    }
  }, [zonePending, editing]);

  if (!zonePending) return null;

  return (
    <Dialog title="What is this made of?" onClose={cancelZone}>
      <p>
        Say it the way you would to a mill. Free text — the presets are only a starting point.
      </p>
      <input
        className="hex-input big"
        value={name}
        placeholder="a short name for the area, e.g. bodice"
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="zone-note big"
        autoFocus
        value={note}
        placeholder="silk chiffon, semi-sheer, soft drape"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="preset-row">
        {FABRIC_PRESETS.map((p) => (
          <button key={p} type="button" className="chip" onClick={() => setNote(p)}>
            {p.split(',')[0]}
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={cancelZone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!note.trim()}
          onClick={() => confirmZone(name, note)}
        >
          {editing ? 'Update zone' : 'Add zone'}
        </button>
      </div>
    </Dialog>
  );
}
