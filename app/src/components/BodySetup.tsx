import { SLIDER_LABELS, TEMPLATES } from '../body/model';
import { useStudio } from '../state/store';
import { BodyPreview } from './BodyPreview';

export function BodySetup() {
  const templateId = useStudio((s) => s.templateId);
  const setTemplate = useStudio((s) => s.setTemplate);
  const sliders = useStudio((s) => s.sliders);
  const setSlider = useStudio((s) => s.setSlider);
  const resetSliders = useStudio((s) => s.resetSliders);
  const setScreen = useStudio((s) => s.setScreen);

  const template = TEMPLATES.find((t) => t.id === templateId);

  return (
    <div className="setup">
      <div className="setup-controls">
        <header className="setup-head">
          <p className="step">Step one</p>
          <h2>Set up the body</h2>
          <p className="setup-note">
            This is the figure you will draw against. It is generated here on your machine and
            never sent anywhere — move the sliders as much as you like, it costs nothing.
          </p>
        </header>

        <div className="setup-block">
          <h3>Start from a shape</h3>
          <div className="template-cards">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`template-card${t.id === templateId ? ' active' : ''}`}
                onClick={() => setTemplate(t.id)}
              >
                <strong>{t.name}</strong>
                <span>{t.note}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-block">
          <h3>
            Adjust it
            <button type="button" className="btn small" onClick={resetSliders}>
              Back to {template?.name ?? 'template'}
            </button>
          </h3>
          <div className="body-sliders">
            {SLIDER_LABELS.map(({ key, label }) => (
              <label key={key} className="slider-row tight">
                <span>
                  {label} <em>{Math.round(sliders[key] * 100)}</em>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sliders[key] * 100)}
                  onChange={(e) => setSlider(key, Number(e.target.value) / 100)}
                />
              </label>
            ))}
          </div>
        </div>

        <button type="button" className="btn primary big" onClick={() => setScreen('studio')}>
          Start drawing →
        </button>
        <p className="setup-foot">
          You can come back and change the body at any time. Guide lines and body strength are
          adjustable while you draw.
        </p>
      </div>

      <div className="setup-stage">
        <BodyPreview />
        <p className="setup-caption">
          Guide lines sit at shoulder, bust, waist, hip and knee, plus centre front. They move with
          the sliders and are never part of an export.
        </p>
      </div>
    </div>
  );
}
