import { useEffect, useMemo, useRef, useState } from 'react';
import { followJob, health, startTryOn, usage as fetchUsage } from '../api/client';
import type { Usage } from '../api/client';
import { computeBody } from '../body/model';
import { exportFlat, figureCoverage, garmentForApi, thinDetailRatio } from '../project/exportFlat';
import type { Framing } from '../project/exportFlat';
import { newId, useStudio } from '../state/store';
import type { ModelPhoto } from '../types';

/** The categories the cloth API accepts, in the designer's words. */
async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const CATEGORIES = [
  { id: 'auto', label: 'Work it out' },
  { id: 'full_body', label: 'A whole dress' },
  { id: 'upper_body', label: 'Top half' },
  { id: 'lower_body', label: 'Bottom half' },
  { id: 'outerwear', label: 'Outerwear' },
];

export function Fitting() {
  const layers = useStudio((s) => s.layers);
  const regions = useStudio((s) => s.regions);
  const pixelVersion = useStudio((s) => s.pixelVersion);
  const modelPhotos = useStudio((s) => s.modelPhotos);
  const addModelPhoto = useStudio((s) => s.addModelPhoto);
  const removeModelPhoto = useStudio((s) => s.removeModelPhoto);
  const tryOns = useStudio((s) => s.tryOns);
  const addTryOn = useStudio((s) => s.addTryOn);
  const patchTryOn = useStudio((s) => s.patchTryOn);
  const removeTryOn = useStudio((s) => s.removeTryOn);
  const garmentCategory = useStudio((s) => s.garmentCategory);
  const setGarmentCategory = useStudio((s) => s.setGarmentCategory);
  const say = useStudio((s) => s.say);
  const setScreen = useStudio((s) => s.setScreen);

  const sliders = useStudio((s) => s.sliders);
  const framing = useStudio((s) => s.framing);
  const setFraming = useStudio((s) => s.setFraming);
  const renders = useStudio((s) => s.renders);
  const tryOnSourceId = useStudio((s) => s.tryOnSourceId);
  const setTryOnSource = useStudio((s) => s.setTryOnSource);
  const setVerdict = useStudio((s) => s.setVerdict);
  const zones = useStudio((s) => s.fabricZones);
  const [selected, setSelected] = useState<string[]>([]);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const flat = useMemo(
    () => exportFlat(layers, regions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, regions, pixelVersion],
  );
  const geo = useMemo(() => computeBody(sliders), [sliders]);
  const flatGarment = useMemo(
    () => garmentForApi(flat, { framing, geo }),
    [flat, framing, geo],
  );
  const thinRatio = useMemo(
    () => (flat.content ? thinDetailRatio(flat.canvas) : 0),
    [flat],
  );
  const coverage = useMemo(() => figureCoverage(flat, geo), [flat, geo]);

  const ready = renders.filter((r) => r.status === 'done' && r.realisticImage);

  // Default to the newest render, because that is what rendering was for. The
  // flat design stays one click away — a render can reinterpret the drawing,
  // and the flat version is still a valid thing to put on a body (spec §8).
  useEffect(() => {
    if (tryOnSourceId === null && ready.length) setTryOnSource(ready[0].id);
  }, [tryOnSourceId, ready, setTryOnSource]);

  const chosen = ready.find((r) => r.id === tryOnSourceId);
  const garment = chosen ? chosen.realisticImage : flatGarment;

  useEffect(() => {
    health()
      .then((h) => setServerReady(h.keyConfigured))
      .catch(() => setServerReady(false));
    fetchUsage().then(setUsage).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selected.length && modelPhotos.length) setSelected([modelPhotos[0].id]);
  }, [modelPhotos, selected]);

  const toggleModel = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addPhotos = async (files: File[]) => {
    for (const file of files.slice(0, 6)) {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      addModelPhoto(file.name.replace(/\.[^.]+$/, ''), image);
    }
  };

  const run = async () => {
    if (!garment) return;
    const photos = modelPhotos.filter((m) => selected.includes(m.id));
    if (!photos.length) return;

    setBusy(true);
    try {
      // The backend already queues within the rate limit, so these can go out
      // together; each one is its own job and its own unit.
      const bytes = garment.startsWith('data:') ? garment : await toDataUrl(garment);
      await Promise.all(photos.map((p) => runOne(p, bytes)));
    } finally {
      setBusy(false);
      fetchUsage().then(setUsage).catch(() => undefined);
    }
  };

  const runOne = async (photo: ModelPhoto, bytes: string) => {
    const id = newId('tryon');
    addTryOn({
      id,
      modelPhotoId: photo.id,
      flatImage: bytes,
      resultImage: null,
      garmentCategory,
      status: 'working',
      stage: 'starting',
      verdict: null,
      note: '',
      createdAt: Date.now(),
    });

    try {
      const { jobId } = await startTryOn({ garment: bytes, model: photo.image, garmentCategory });
      const final = await followJob(jobId, (j) => patchTryOn(id, { stage: j.stage }));
      if (final.status === 'failed' || !final.resultUrl) {
        patchTryOn(id, { status: 'failed', stage: 'failed', error: final.error ?? 'It did not work.' });
        say(final.error ?? 'The try-on failed.');
      } else {
        patchTryOn(id, { status: 'done', stage: 'done', resultImage: final.resultUrl });
      }
      if (final.usage) setUsage(final.usage);
    } catch (err) {
      patchTryOn(id, { status: 'failed', stage: 'failed', error: (err as Error).message });
      say((err as Error).message);
    }
  };

  const canRun = Boolean(garment) && selected.length > 0 && serverReady === true && !busy;

  return (
    <div className="fitting">
      <div className="fitting-left">
        <section className="panel-card">
          <h2>Which version</h2>
          <div className="garment-preview">
            {garment ? <img src={garment} alt="The garment" /> : <span>Nothing drawn yet</span>}
          </div>

          {ready.length > 0 && (
            <>
              <div className="chip-row">
                <button
                  type="button"
                  className={`chip${chosen ? '' : ' active'}`}
                  onClick={() => setTryOnSource('flat')}
                >
                  The flat drawing
                </button>
                {ready.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`chip${chosen?.id === r.id ? ' active' : ''}`}
                    onClick={() => setTryOnSource(r.id)}
                  >
                    Rendered{ready.length > 1 ? ` ${ready.length - i}` : ''}
                  </button>
                ))}
              </div>
              <p className="hint">
                {chosen ? (
                  <>
                    Sending the rendered garment, so the fabric goes with it
                    {zones.length > 0 && `${zones.length === 1 ? ' — 1 zone' : ` — ${zones.length} zones`}`}.
                  </>
                ) : (
                  <>
                    Sending the flat drawing. Try-on works on drawings, but the fabric notes are
                    not part of one — render first if you want the cloth to come through.
                  </>
                )}
              </p>
            </>
          )}

          {ready.length === 0 && zones.length > 0 && (
            <p className="hint caution">
              You have {zones.length} fabric zone{zones.length === 1 ? '' : 's'} but nothing
              rendered yet. Try-on takes an image — the fabric notes only reach it through a
              render.{' '}
              <button type="button" className="linkish" onClick={() => setScreen('render')}>
                Make it real first
              </button>
              .
            </p>
          )}

          <div className="chip-row" hidden={Boolean(chosen)}>
            {(
              [
                ['figure', 'Keep the hem where I drew it'],
                ['garment', 'Just the garment'],
              ] as [Framing, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip${framing === id ? ' active' : ''}`}
                onClick={() => setFraming(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint" hidden={Boolean(chosen)}>
            {framing === 'figure' ? (
              <>Framed to the figure, keeping the garment’s proportions against a body.</>
            ) : (
              <>Cropped to the drawing itself, the way a product shot is framed.</>
            )}{' '}
            This exact image is what gets sent. The body and guide lines are never part of it. Both
            framings came back the right length in testing — if one comes back wrong, try the other.
          </p>

          {coverage < 0.08 && !chosen && (
            <p className="hint caution">
              This covers about {Math.round(coverage * 100)}% of the figure — too little to read as
              a garment, so the try-on will invent most of what it puts on the model. Draw the
              garment on the body first.
            </p>
          )}
          {thinRatio > 0.4 && !chosen && (
            <p className="hint caution">
              A lot of this design is very thin. Narrow straps, ties and fine piping often do not
              survive try-on — in testing, cap sleeves came back strapless. Drawing them heavier
              gives them a better chance.
            </p>
          )}
          {!garment && (
            <button type="button" className="btn" onClick={() => setScreen('studio')}>
              Back to the studio
            </button>
          )}
        </section>

        <section className="panel-card">
          <h2>What is it</h2>
          <div className="chip-row">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${garmentCategory === c.id ? ' active' : ''}`}
                onClick={() => setGarmentCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <h2>
            Model photos
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
              + Add
            </button>
          </h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              // Copy the list out first: clearing `value` empties `files`.
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void addPhotos(files);
            }}
          />

          {modelPhotos.length === 0 ? (
            <p className="hint">
              Add a photo of a real person. Pick ones with <strong>clear shoulders</strong>, arms
              away from the torso and a neutral stance — hair over the shoulders or crossed arms
              hide exactly the areas you are trying to judge.
            </p>
          ) : (
            <div className="model-row">
              {modelPhotos.map((m) => (
                <ModelCard
                  key={m.id}
                  photo={m}
                  selected={selected.includes(m.id)}
                  onSelect={() => toggleModel(m.id)}
                  onRemove={() => removeModelPhoto(m.id)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="run-row">
          <button type="button" className="btn primary big" disabled={!canRun} onClick={run}>
            {busy
              ? 'Trying it on…'
              : selected.length > 1
                ? `Try it on ${selected.length} people — ${selected.length} units`
                : 'Try it on'}
          </button>
          <div className="run-note">
            {serverReady === false && (
              <span className="warn">
                The server has no API key. Add <code>YOUCAM_API_KEY</code> to <code>server/.env</code>{' '}
                and run <code>npm start</code> in <code>server/</code>.
              </span>
            )}
            {serverReady === true && (
              <span>
                One try-on costs <strong>1 unit</strong> per person.
                {usage && ` ${usage.unitsSpent} spent so far this session.`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="fitting-right">
        <h2 className="results-title">
          Worn <span>{tryOns.length ? `${tryOns.length} result${tryOns.length > 1 ? 's' : ''}` : ''}</span>
        </h2>

        {tryOns.length === 0 && (
          <p className="hint empty-results">
            Results appear here next to the design that produced them.
          </p>
        )}

        <div className="results">
          {tryOns.map((t) => {
            const photo = modelPhotos.find((m) => m.id === t.modelPhotoId);
            return (
              <article key={t.id} className={`result ${t.status}`}>
                <div className="result-pair">
                  <figure>
                    <img src={t.flatImage} alt="The design" />
                    <figcaption>the design</figcaption>
                  </figure>
                  <figure>
                    {t.resultImage ? (
                      <img src={t.resultImage} alt="Worn" />
                    ) : (
                      <span className="result-stage">
                        {t.status === 'failed' ? 'failed' : t.stage}
                      </span>
                    )}
                    <figcaption>on {photo?.name ?? 'a model'}</figcaption>
                  </figure>
                </div>
                {t.error && <p className="result-error">{t.error}</p>}

                {t.status === 'done' && (
                  <div className="verdict-row">
                    <button
                      type="button"
                      className={`chip${t.verdict === 'works' ? ' yes' : ''}`}
                      onClick={() => setVerdict(t.id, t.verdict === 'works' ? null : 'works', t.note)}
                    >
                      Works
                    </button>
                    <button
                      type="button"
                      className={`chip${t.verdict === 'no' ? ' no' : ''}`}
                      onClick={() => setVerdict(t.id, t.verdict === 'no' ? null : 'no', t.note)}
                    >
                      Doesn’t
                    </button>
                    <input
                      className="verdict-note"
                      value={t.note}
                      placeholder="why — one line"
                      onChange={(e) => setVerdict(t.id, t.verdict, e.target.value)}
                    />
                  </div>
                )}

                <button type="button" className="btn tiny" onClick={() => removeTryOn(t.id)}>
                  Remove
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  photo,
  selected,
  onSelect,
  onRemove,
}: {
  photo: ModelPhoto;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={`model-card${selected ? ' active' : ''}`}>
      <button type="button" onClick={onSelect}>
        <img src={photo.image} alt={photo.name} />
        <span>{photo.name}</span>
      </button>
      <span className="variant-x" title="Remove" onClick={onRemove}>
        ×
      </span>
    </div>
  );
}
