import { useMemo, useState } from 'react';
import { followJob } from '../api/client';
import { staleZones } from '../fabric/zones';
import { computeBody } from '../body/model';
import { exportFlat, figureCoverage } from '../project/exportFlat';
import { prepareRender } from '../project/renderPrep';
import { newId, useStudio } from '../state/store';
import type { RenderResult } from '../types';

async function startRender(body: unknown) {
  const res = await fetch('/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { jobId?: string; error?: string; estimatedUnits?: number };
  if (!res.ok || !json.jobId) throw new Error(json.error ?? 'Could not start the render.');
  return json as { jobId: string; estimatedUnits: number };
}

export function Render() {
  const layers = useStudio((s) => s.layers);
  const regions = useStudio((s) => s.regions);
  const zones = useStudio((s) => s.fabricZones);
  const baseFabricNote = useStudio((s) => s.baseFabricNote);
  const updateZone = useStudio((s) => s.updateZone);
  const setBaseFabricNote = useStudio((s) => s.setBaseFabricNote);
  const renders = useStudio((s) => s.renders);
  const addRender = useStudio((s) => s.addRender);
  const patchRender = useStudio((s) => s.patchRender);
  const removeRender = useStudio((s) => s.removeRender);
  const setTryOnSource = useStudio((s) => s.setTryOnSource);
  const currentCombination = useStudio((s) => s.currentCombination);
  const setScreen = useStudio((s) => s.setScreen);
  const sliders = useStudio((s) => s.sliders);
  const say = useStudio((s) => s.say);
  const pixelVersion = useStudio((s) => s.pixelVersion);

  // Testing settled this: one image-to-image pass respected the zones and
  // produced real cloth, while one masked replacement per zone inpainted
  // artefacts. The spec said to test rather than assume — so this is the
  // default, and it is also the cheaper of the two (spec §8).
  const [method, setMethod] = useState<'zones' | 'single'>('single');
  const [busy, setBusy] = useState(false);

  const prepared = useMemo(
    () => prepareRender(layers, regions, zones, baseFabricNote),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, regions, zones, baseFabricNote, pixelVersion],
  );

  const coverage = useMemo(
    () => figureCoverage(exportFlat(layers, regions), computeBody(sliders)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, regions, pixelVersion, sliders],
  );

  const combination = currentCombination();
  const stale = staleZones(zones, combination);
  const cost = method === 'single' ? 1 : Math.max(1, zones.length);

  const run = async () => {
    if (!prepared) return;
    const id = newId('render');
    const record: RenderResult = {
      id,
      sourceCombination: combination,
      flatImage: prepared.source,
      realisticImage: null,
      method,
      status: 'working',
      stage: 'starting',
      units: 0,
      createdAt: Date.now(),
    };
    addRender(record);
    setBusy(true);
    try {
      const { jobId } = await startRender({
        source: prepared.source,
        zones: prepared.zones,
        baseFabricNote,
        method,
      });
      const final = await followJob(jobId, (j) =>
        patchRender(id, { stage: j.stage, realisticImage: j.resultUrl ?? null }),
      );
      if (final.status === 'failed') {
        // The server already has the API's own words for what went wrong. Losing
        // them here leaves nothing to act on but "it failed".
        const why = [final.error, final.detail].filter(Boolean).join(' — ');
        patchRender(id, { status: 'failed', stage: 'failed', error: why || 'The render failed.' });
        say(final.error ?? 'The render failed.');
      } else {
        patchRender(id, {
          status: 'done',
          stage: 'done',
          realisticImage: final.resultUrl ?? null,
        });
      }
    } catch (err) {
      patchRender(id, { status: 'failed', stage: 'failed', error: (err as Error).message });
      say((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fitting">
      <div className="fitting-left">
        <section className="panel-card">
          <h2>The flat design</h2>
          <div className="garment-preview">
            {prepared ? <img src={prepared.source} alt="Flat garment" /> : <span>Nothing drawn yet</span>}
          </div>
          {coverage < 0.08 && (
            <p className="hint caution">
              This covers about {Math.round(coverage * 100)}% of the figure — too little to read as
              a garment. The render will invent the rest of it. Draw the garment on the body first;
              a part on its own is not a design.
            </p>
          )}
        </section>

        <section className="panel-card">
          <h2>What it is made of</h2>
          {zones.length === 0 ? (
            <p className="hint">
              No fabric zones painted. The whole garment will be rendered in the note below.{' '}
              <button type="button" className="linkish" onClick={() => setScreen('studio')}>
                Paint some zones
              </button>{' '}
              if different parts use different cloth.
            </p>
          ) : (
            zones.map((z) => (
              <label key={z.id} className="zone-note-row">
                <span>
                  <span className="zone-swatch" style={{ background: z.color }} />
                  {z.name}
                </span>
                <textarea
                  value={z.fabricNote}
                  onChange={(e) => updateZone(z.id, { fabricNote: e.target.value })}
                />
              </label>
            ))
          )}
          <label className="zone-note-row">
            <span>Everything else</span>
            <textarea value={baseFabricNote} onChange={(e) => setBaseFabricNote(e.target.value)} />
          </label>
        </section>

        {stale.length > 0 && (
          <p className="zone-warning">
            {stale.length === 1 ? 'A zone was' : `${stale.length} zones were`} painted on a
            different set of versions. Repaint before rendering, or the masks will describe the
            wrong shapes.
          </p>
        )}

        <section className="panel-card">
          <h2>How to render it</h2>
          <div className="chip-row">
            <button
              type="button"
              className={`chip${method === 'single' ? ' active' : ''}`}
              onClick={() => setMethod('single')}
            >
              One call for the lot
            </button>
            <button
              type="button"
              className={`chip${method === 'zones' ? ' active' : ''}`}
              onClick={() => setMethod('zones')}
              disabled={zones.length === 0}
            >
              Zone by zone
            </button>
          </div>
          <p className="hint">
            {method === 'single' ? (
              <>
                One pass over the whole garment, carrying every fabric note in a single
                instruction.
              </>
            ) : (
              <>
                One masked replacement per zone, each result feeding the next — the approach that
                should give the most control. In testing it inpainted artefacts rather than cloth,
                so it is here to compare against, not to reach for first. {zones.length} zones ={' '}
                {zones.length} calls.
              </>
            )}
          </p>
        </section>

        <div className="run-row">
          <button
            type="button"
            className="btn primary big"
            disabled={!prepared || busy}
            onClick={run}
          >
            {busy ? 'Rendering…' : `Make it real — ${cost} unit${cost === 1 ? '' : 's'}`}
          </button>
          <div className="run-note">
            {method === 'zones' && zones.length > 3 && (
              <span className="warn">
                {zones.length} zones is {zones.length} calls. Three to five is a realistic dress.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="fitting-right">
        <h2 className="results-title">
          Rendered <span>{renders.length ? `${renders.length}` : ''}</span>
        </h2>
        {renders.length === 0 && (
          <p className="hint empty-results">
            Flat and realistic will show side by side. You choose which one goes forward to try-on.
          </p>
        )}
        <div className="results">
          {renders.map((r) => (
            <article key={r.id} className={`result ${r.status}`}>
              <div className="result-pair">
                <figure>
                  <img src={r.flatImage} alt="Flat" />
                  <figcaption>flat original</figcaption>
                </figure>
                <figure>
                  {r.realisticImage ? (
                    <img src={r.realisticImage} alt="Realistic" />
                  ) : (
                    <span className="result-stage">
                      {r.status === 'failed' ? 'failed' : r.stage}
                    </span>
                  )}
                  <figcaption>
                    as cloth · {r.method === 'zones' ? 'zone by zone' : 'one call'}
                  </figcaption>
                </figure>
              </div>
              {r.error && <p className="result-error">{r.error}</p>}
              <div className="dialog-actions start">
                <button type="button" className="btn tiny" onClick={() => removeRender(r.id)}>
                  Remove
                </button>
                <button
                  type="button"
                  className="btn tiny primary"
                  disabled={r.status !== 'done' || !r.realisticImage}
                  onClick={() => {
                    setTryOnSource(r.id);
                    setScreen('fitting');
                  }}
                >
                  Take it to try-on
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
