import { useMemo } from 'react';
import {
  MAX_SHOWN,
  countCombinations,
  describe,
  enumerate,
  key,
  renderCombinations,
} from '../regions/combinations';
import { baseKey } from '../canvas/keys';
import { isRasterEmpty } from '../canvas/rasters';
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
    () => renderCombinations(layers, regions, combos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combos, layers, regions, pixelVersion],
  );

  const allEmpty = thumbs.length > 0 && thumbs.every((t) => t.empty);

  // Parts take their pixels out of the layer. If the layer was empty when the
  // boundary was drawn, there is nothing behind the versions and the grid looks
  // broken when it is only reporting an empty design.
  const nothingOutside = useMemo(
    () => layers.every((l) => isRasterEmpty(baseKey(l.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, pixelVersion],
  );

  const currentKey = key(currentCombination());
  const shortlisted = new Set(shortlist.map(key));

  if (regions.length === 0) {
    return (
      <div className="combos empty">
        <div>
          <h2>Nothing to combine yet</h2>
          <p className="hint">
            Cut the design into parts and save a few versions of each.
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
            machine, all at one crop so they can be compared. Click one to put it on the canvas,
            star the ones worth keeping.
          </p>
          {allEmpty ? (
            <p className="hint caution">
              Every one of these is empty. Nothing is drawn on the layer or in any version yet —
              draw something in the studio and they will fill in.
            </p>
          ) : nothingOutside ? (
            <p className="hint caution">
              Nothing is drawn outside the parts, so each of these is just the part on its own.
              Draw the rest of the garment in the studio and it will sit behind every version, with
              only the part changing between them.
            </p>
          ) : null}
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
        {thumbs.map(({ combination: c, key: k, src, empty }, i) => (
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
              {empty && <span className="combo-empty">nothing drawn</span>}
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
