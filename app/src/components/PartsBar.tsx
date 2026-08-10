import { useState } from 'react';
import type { Region } from '../types';
import { useStudio } from '../state/store';
import { Dialog } from './Dialog';
import { FabricBar } from './FabricBar';

export function BottomBar() {
  const open = useStudio((s) => s.panels.parts);
  const togglePanel = useStudio((s) => s.togglePanel);
  const tab = useStudio((s) => s.bottomTab);
  const setTab = useStudio((s) => s.setBottomTab);
  const zones = useStudio((s) => s.fabricZones);
  const regions = useStudio((s) => s.regions);

  return (
    <footer className={`parts-bar${open ? '' : ' collapsed'}`}>
      <div className="bottom-tabs">
        <button
          type="button"
          className="rail-toggle inline"
          onClick={() => togglePanel('parts')}
          title={open ? 'Hide' : 'Show'}
        >
          {open ? '⌄' : '⌃'}
        </button>
        <button
          type="button"
          className={`tab${tab === 'parts' ? ' active' : ''}`}
          onClick={() => setTab('parts')}
        >
          Parts <em>{regions.length}</em>
        </button>
        <button
          type="button"
          className={`tab${tab === 'fabric' ? ' active' : ''}`}
          onClick={() => setTab('fabric')}
        >
          Fabric zones <em>{zones.length}</em>
        </button>
      </div>

      {open && (tab === 'parts' ? <PartsBar /> : <FabricBar />)}
    </footer>
  );
}

function PartsBar() {
  const layers = useStudio((s) => s.layers);
  const activeLayerId = useStudio((s) => s.activeLayerId);
  const regions = useStudio((s) => s.regions);
  const editTarget = useStudio((s) => s.editTarget);
  const selectTarget = useStudio((s) => s.selectTarget);
  const startPart = useStudio((s) => s.startPart);
  const drawingPart = useStudio((s) => s.drawingPart);
  const cancelPart = useStudio((s) => s.cancelPart);
  const snapToGuides = useStudio((s) => s.snapToGuides);
  const toggleSnap = useStudio((s) => s.toggleSnap);
  const showBoundaries = useStudio((s) => s.showBoundaries);
  const toggleBoundaries = useStudio((s) => s.toggleBoundaries);

  const layer = layers.find((l) => l.id === activeLayerId);
  const mine = regions.filter((r) => r.layerId === activeLayerId);
  const elsewhere = regions.length - mine.length;

  return (
    <>
      <div className="parts-head">
        <div className="parts-title">
          <span>
            in <strong>{layer?.name ?? '—'}</strong>
            {elsewhere > 0 && ` · ${elsewhere} more on other layers`}
          </span>
        </div>

        <div className="parts-actions">
          <label className="check-row small">
            <input type="checkbox" checked={showBoundaries} onChange={toggleBoundaries} />
            <span>Show boundaries</span>
          </label>
          <label className="check-row small">
            <input type="checkbox" checked={snapToGuides} onChange={toggleSnap} />
            <span>Snap to guides</span>
          </label>
          <button
            type="button"
            className={`btn ${drawingPart ? 'danger' : 'primary'}`}
            onClick={() => (drawingPart ? cancelPart() : startPart())}
          >
            {drawingPart ? 'Cancel' : '+ Create part'}
          </button>
        </div>
      </div>

      <div className="parts-strip">
        <button
          type="button"
          className={`target-card${editTarget.kind === 'layer' ? ' active' : ''}`}
          onClick={() => selectTarget({ kind: 'layer', id: activeLayerId })}
          title="Draw on the layer itself, outside every part"
        >
          <span className="target-name">{layer?.name ?? 'Layer'}</span>
          <span className="target-note">everything outside the parts</span>
        </button>

        {mine.length === 0 ? (
          <p className="parts-empty">
            Draw a boundary around any area and name it whatever makes sense — “collar”, “left
            sleeve”, “that bit around the hip”. Whatever is inside becomes its first version, and
            you can keep saving alternatives and switch between them.
          </p>
        ) : (
          mine.map((r) => <PartCard key={r.id} region={r} />)
        )}
      </div>

      <NamePartDialog />
    </>
  );
}

function PartCard({ region }: { region: Region }) {
  const editTarget = useStudio((s) => s.editTarget);
  const selectTarget = useStudio((s) => s.selectTarget);
  const saveVersion = useStudio((s) => s.saveVersion);
  const setActiveVariant = useStudio((s) => s.setActiveVariant);
  const renameRegion = useStudio((s) => s.renameRegion);
  const removeRegion = useStudio((s) => s.removeRegion);
  const renameVariant = useStudio((s) => s.renameVariant);
  const removeVariant = useStudio((s) => s.removeVariant);

  const [editingName, setEditingName] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = editTarget.kind === 'region' && editTarget.id === region.id;

  const chooseVariant = (variantId: string) => {
    if (region.dirty && variantId !== region.activeVariantId) {
      setConfirmSwitch(variantId);
      return;
    }
    selectTarget({ kind: 'region', id: region.id });
    setActiveVariant(region.id, variantId);
  };

  return (
    <div className={`part-card${selected ? ' active' : ''}`}>
      <div className="part-head" onClick={() => selectTarget({ kind: 'region', id: region.id })}>
        {editingName ? (
          <input
            className="layer-name-input"
            autoFocus
            defaultValue={region.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameRegion(region.id, e.target.value);
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditingName(false);
            }}
          />
        ) : (
          <span
            className="part-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingName(true);
            }}
            title="Double-click to rename"
          >
            {region.name}
          </span>
        )}
        {region.dirty && <span className="dot" title="Unsaved changes" />}
        <button
          type="button"
          className="icon-btn"
          title="Remove this part — what is showing goes back into the layer"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
          </svg>
        </button>
      </div>

      <div className="variant-row">
        {region.variants.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`variant${v.id === region.activeVariantId ? ' active' : ''}`}
            onClick={() => chooseVariant(v.id)}
            onDoubleClick={() => {
              const name = window.prompt('Name this version', v.name);
              if (name !== null) renameVariant(region.id, v.id, name);
            }}
            title={`${v.name} — double-click to rename`}
          >
            <img src={v.thumb} alt={v.name} />
            <span>{v.name}</span>
            {region.variants.length > 1 && (
              <span
                className="variant-x"
                title="Delete this version"
                onClick={(e) => {
                  e.stopPropagation();
                  removeVariant(region.id, v.id);
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`btn small save-version${region.dirty ? ' primary' : ''}`}
        disabled={!region.dirty}
        title={
          region.dirty
            ? 'Keep what is inside the boundary as another version'
            : 'Change what is inside the boundary first'
        }
        onClick={() => saveVersion(region.id)}
      >
        Save this version
      </button>

      {confirmSwitch && (
        <Dialog title={`Unsaved work in “${region.name}”`} onClose={() => setConfirmSwitch(null)}>
          <p>
            What is inside this part has changed since the last version was saved. Switching now
            will replace it.
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setConfirmSwitch(null)}>
              Keep working
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setActiveVariant(region.id, confirmSwitch);
                setConfirmSwitch(null);
              }}
            >
              Discard and switch
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                saveVersion(region.id);
                setActiveVariant(region.id, confirmSwitch);
                setConfirmSwitch(null);
              }}
            >
              Save first, then switch
            </button>
          </div>
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog title={`Remove “${region.name}”?`} onClose={() => setConfirmDelete(false)}>
          <p>
            The version showing now goes back into the layer. The other{' '}
            {region.variants.length - 1 === 1
              ? 'version is'
              : `${region.variants.length - 1} versions are`}{' '}
            discarded.
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                removeRegion(region.id);
                setConfirmDelete(false);
              }}
            >
              Remove part
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function NamePartDialog() {
  const pendingPart = useStudio((s) => s.pendingPart);
  const confirmPart = useStudio((s) => s.confirmPart);
  const cancelPart = useStudio((s) => s.cancelPart);
  const [name, setName] = useState('');

  if (!pendingPart) return null;

  const submit = () => {
    confirmPart(name);
    setName('');
  };

  return (
    <Dialog title="What is this part?" onClose={cancelPart}>
      <p>
        Call it whatever makes sense to you. Nothing in the app reads this name — it is your label,
        not a category.
      </p>
      <input
        className="hex-input big"
        autoFocus
        value={name}
        placeholder="collar, left sleeve, that bit around the hip…"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={cancelPart}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={submit}>
          Create part
        </button>
      </div>
    </Dialog>
  );
}
