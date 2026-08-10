import { useMemo } from 'react';
import {
  MAX_SHOWN,
  countCombinations,
  describe,
  enumerate,
  key,
  renderCombination,
} from '../regions/combinations';
import { useStudio } from '../state/store';

/**
 * Every version of every part, side by side, composited locally. Nothing here
 * touches the network — this is where most options get eliminated by eye,
 * before anything is spent on rendering (spec §5).
 */
export function Combinations() {
  const layers = useStudio((s) => s.layers);
  const regions = useStudio((s) => s.regions);
  const pixelVersion = useStudio((s) => s.pixelVersion);
  const shortlist = useStudio((s) => s.shortlist);
  const toggleShortlist = useStudio((s) => s.toggleShortlist);
  const clearShortlist = useStudio((s) => s.clearShortlist);
  const applyCombination = useStudio((s) => s.applyCombination);
  const currentCombination = useStudio((s) => s.currentCombination);
  const setScreen = useStudio((s) => s.setScreen);
  const say = useStudio((s) => s.say);

  const total = countCombinations(regions);
  const combos = useMemo(
    () => enumerate(regions, MAX_SHOWN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regions],
  );

  const thumbs = useMemo(
    () => combos.map((c) => ({ c, k: key(c), src: renderCombination(layers, regions, c) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combos, layers, regions, pixelVersion],
  );

  const currentKey = key(currentCombination());
  const shortlisted = new Set(shortlist.map(key));

  if (regions.length === 0) {
    return (
      <div className="combos empty">
        <div>
          <h2>Nothing to combine yet</h2>
          <p className="hint">
            Cut the design into parts and save a few versions of each. Every way they can go
            together will show up here as a flat drawing — free, and instant, because none of it
            touches the API.
          </p>
          <button type="button" className="btn primary" onClick={() => setScreen('studio')}>
            Back to the studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="combos">
      <header className="combos-head">
        <div>
          <h2>
            {total} combination{total === 1 ? '' : 's'}
            {total > MAX_SHOWN && <em> · showing the first {MAX_SHOWN}</em>}
          </h2>
          <p className="hint">
            {regions.map((r) => `${r.name} ×${r.variants.length}`).join(' · ')} — composited on this
            machine. Click one to put it on the canvas, star the ones worth keeping.
          </p>
        </div>
        <div className="parts-actions">
          {shortlist.length > 0 && (
            <>
              <span className="cost-note">
                <strong>{shortlist.length}</strong> kept
              </span>
              <button type="button" className="btn" onClick={clearShortlist}>
                Clear
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => setScreen('render')}>
            Render →
          </button>
        </div>
      </header>

      <div className="combo-grid">
        {thumbs.map(({ c, k, src }, i) => (
          <figure key={k} className={`combo${k === currentKey ? ' current' : ''}`}>
            <button
              type="button"
              onClick={() => {
                applyCombination(c);
                say('On the canvas.');
              }}
              title={describe(regions, c)}
            >
              <img src={src} alt={describe(regions, c)} />
            </button>
            <figcaption>
              <span>{i + 1}</span>
              <button
                type="button"
                className={`star${shortlisted.has(k) ? ' on' : ''}`}
                title={shortlisted.has(k) ? 'Remove from the shortlist' : 'Keep this one'}
                onClick={() => toggleShortlist(c)}
              >
                ★
              </button>
            </figcaption>
            <p className="combo-desc">{describe(regions, c)}</p>
          </figure>
        ))}
      </div>
    </div>
  );
}
