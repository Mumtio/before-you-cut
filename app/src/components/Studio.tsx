import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import { BodyPanel } from './BodyPanel';
import { BodySetup } from './BodySetup';
import { CanvasStage } from './CanvasStage';
import { ColorPicker } from './ColorPicker';
import { Combinations } from './Combinations';
import { Fitting } from './Fitting';
import { Render } from './Render';
import { LayerPanel } from './LayerPanel';
import { BottomBar } from './PartsBar';
import { ToolPanel } from './ToolPanel';
import { TopBar } from './TopBar';
import { useProjectStorage } from '../project/useProjectStorage';
import { useStudio } from '../state/store';

export function Studio({ onHome }: { onHome: () => void }) {
  useHotkeys();
  useProjectStorage();
  const screen = useStudio((s) => s.screen);
  const panels = useStudio((s) => s.panels);
  const notice = useStudio((s) => s.notice);
  const say = useStudio((s) => s.say);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => say(null), 3200);
    return () => clearTimeout(t);
  }, [notice, say]);

  return (
    <div className="app">
      <TopBar onHome={onHome} />

      {screen === 'setup' ? (
        <BodySetup />
      ) : screen === 'fitting' ? (
        <Fitting />
      ) : screen === 'render' ? (
        <Render />
      ) : screen === 'combinations' ? (
        <Combinations />
      ) : (
        <>
          <main
            className="workspace"
            style={
              {
                '--left': panels.left ? '264px' : '34px',
                '--right': panels.right ? '236px' : '34px',
              } as CSSProperties
            }
          >
            <Rail side="left" label="Body &amp; layers" open={panels.left}>
              <BodyPanel />
              <LayerPanel />
            </Rail>

            <CanvasStage />

            <Rail side="right" label="Tools &amp; colour" open={panels.right}>
              <ToolPanel />
              <ColorPicker />
            </Rail>
          </main>
          <BottomBar />
        </>
      )}

      {notice && (
        <div className="notice" role="status" onClick={() => say(null)}>
          {notice}
        </div>
      )}
    </div>
  );
}

function Rail({
  side,
  label,
  open,
  children,
}: {
  side: 'left' | 'right';
  label: string;
  open: boolean;
  children: ReactNode;
}) {
  const togglePanel = useStudio((s) => s.togglePanel);
  const pointing = side === 'left' ? (open ? '‹' : '›') : open ? '›' : '‹';

  return (
    <aside className={`rail ${side}${open ? '' : ' collapsed'}`}>
      <button
        type="button"
        className="rail-toggle"
        onClick={() => togglePanel(side)}
        title={open ? `Hide ${label}` : `Show ${label}`}
        aria-expanded={open}
      >
        {pointing}
      </button>
      {open ? children : <span className="rail-stub">{label}</span>}
    </aside>
  );
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const s = useStudio.getState();
      if (s.screen !== 'studio' || s.pendingPart) return;
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redoActive();
        else s.undoActive();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redoActive();
        return;
      }
      if (meta) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          s.setTool('pencil');
          break;
        case 's':
          s.setTool('soft');
          break;
        case 'g':
          s.setTool('fill');
          break;
        case 'e':
          s.setTool('eraser');
          break;
        case 'h':
          s.setTool('hand');
          break;
        case 'm':
          s.toggleMirror();
          break;
        case 'p':
          if (s.drawingPart) s.cancelPart();
          else s.startPart();
          break;
        case '[':
          s.setSize(s.size - Math.max(1, Math.round(s.size * 0.15)));
          break;
        case ']':
          s.setSize(s.size + Math.max(1, Math.round(s.size * 0.15)));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
