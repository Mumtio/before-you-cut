import { useStudio } from '../state/store';

/**
 * The studio only needs the things a designer changes *while drawing*:
 * how loud the body is, whether the guides show, and mirroring. Shape itself
 * is set on the setup screen.
 */
export function BodyPanel() {
  const setScreen = useStudio((s) => s.setScreen);
  const showBody = useStudio((s) => s.showBody);
  const showGuides = useStudio((s) => s.showGuides);
  const toggleBody = useStudio((s) => s.toggleBody);
  const toggleGuides = useStudio((s) => s.toggleGuides);
  const bodyOpacity = useStudio((s) => s.bodyOpacity);
  const setBodyOpacity = useStudio((s) => s.setBodyOpacity);
  const mirror = useStudio((s) => s.mirror);
  const toggleMirror = useStudio((s) => s.toggleMirror);

  return (
    <section className="panel">
      <h2 className="panel-title">
        Underneath
        <button
          type="button"
          className="btn small"
          onClick={() => setScreen('setup')}
          title="Back to the body setup screen"
        >
          Change body
        </button>
      </h2>

      <label className="check-row">
        <input type="checkbox" checked={showBody} onChange={toggleBody} />
        <span>Body template</span>
      </label>

      <label className="slider-row tight">
        <span>
          Body strength <em>{Math.round(bodyOpacity * 100)}%</em>
        </span>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(bodyOpacity * 100)}
          disabled={!showBody}
          onChange={(e) => setBodyOpacity(Number(e.target.value) / 100)}
        />
      </label>

      <label className="check-row">
        <input type="checkbox" checked={showGuides} onChange={toggleGuides} />
        <span>Guide lines</span>
      </label>

      <button
        type="button"
        className={`wide-toggle${mirror ? ' on' : ''}`}
        onClick={toggleMirror}
        title="Draw one side, get both (M)"
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3v18" strokeDasharray="3 3" />
          <path d="M9 7L4 12l5 5" />
          <path d="M15 7l5 5-5 5" />
        </svg>
        <span>Mirror across centre front</span>
        <em>{mirror ? 'On' : 'Off'}</em>
      </button>
    </section>
  );
}
