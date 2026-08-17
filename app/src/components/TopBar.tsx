import type { Screen } from '../state/store';
import { canRedoTarget, canUndoTarget, useStudio } from '../state/store';
import { ExportDialog } from './ExportDialog';
import { ProjectMenu } from './ProjectMenu';

const STEPS: { label: string; screen?: Screen }[] = [
  { label: 'Body', screen: 'setup' },
  { label: 'Studio', screen: 'studio' },
  { label: 'Combinations', screen: 'combinations' },
  { label: 'Render', screen: 'render' },
  { label: 'Fitting', screen: 'fitting' },
];

export function TopBar({ onHome }: { onHome: () => void }) {
  const screen = useStudio((s) => s.screen);
  const setScreen = useStudio((s) => s.setScreen);
  const activeLayerId = useStudio((s) => s.activeLayerId);
  const editTarget = useStudio((s) => s.editTarget);
  const regions = useStudio((s) => s.regions);
  const pixelVersion = useStudio((s) => s.pixelVersion);
  const undoActive = useStudio((s) => s.undoActive);
  const redoActive = useStudio((s) => s.redoActive);
  const layers = useStudio((s) => s.layers);

  // pixelVersion is read so the buttons re-evaluate after every change.
  void pixelVersion;
  const layer = layers.find((l) => l.id === activeLayerId);
  const region = editTarget.kind === 'region' ? regions.find((r) => r.id === editTarget.id) : undefined;

  return (
    <header className="topbar">
      <div className="brand">
        <button type="button" className="brand-mark" onClick={onHome} title="Back to the start">
          <img src="/logo.svg" alt="Before You Cut — back to the start" width={30} height={30} />
        </button>
        <div className="brand-text">
          <h1>Before You Cut</h1>
          <ProjectMenu />
        </div>
      </div>

      <nav className="topbar-mid">
        {STEPS.map((s) => (
          <button
            key={s.label}
            type="button"
            className={`crumb${s.screen === screen ? ' active' : ''}`}
            disabled={!s.screen}
            onClick={() => s.screen && setScreen(s.screen)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <ExportDialog />
        {screen === 'studio' && (
          <>
            <span className="active-layer" title="Undo history is kept per thing you draw on">
              Drawing on <strong>{region ? region.name : (layer?.name ?? '—')}</strong>
              {region && <em> · part of {layer?.name}</em>}
            </span>
            <button
              type="button"
              className="btn"
              onClick={undoActive}
              disabled={!canUndoTarget(editTarget)}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className="btn"
              onClick={redoActive}
              disabled={!canRedoTarget(editTarget)}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
            </button>
          </>
        )}
      </div>
    </header>
  );
}
