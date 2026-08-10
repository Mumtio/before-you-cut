import { useMemo, useState } from 'react';
import { CANVAS_H, CANVAS_W } from '../constants';
import { download, exportFlat, safeFilename } from '../project/exportFlat';
import { useStudio } from '../state/store';
import { Dialog } from './Dialog';

/**
 * The flat garment (spec §8): what the design looks like with the body and the
 * guide lines gone. Worth showing rather than just downloading — this exact
 * image is what gets sent to the API, and it is the version kept alongside any
 * realistic render.
 */
export function ExportDialog() {
  const layers = useStudio((s) => s.layers);
  const regions = useStudio((s) => s.regions);
  const pixelVersion = useStudio((s) => s.pixelVersion);
  const projectName = useStudio((s) => s.projectName);
  const [open, setOpen] = useState(false);

  const flat = useMemo(
    () => (open ? exportFlat(layers, regions) : null),
    // pixelVersion is what tells us the drawing changed underneath us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, layers, regions, pixelVersion],
  );

  const hiddenLayers = layers.filter((l) => !l.visible).length;

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)} title="The garment on its own">
        Flat export
      </button>

      {open && flat && (
        <Dialog title="The garment on its own" wide onClose={() => setOpen(false)}>
          <p>
            Body and guide lines left out, transparent background. This is the image that goes to
            try-on.
          </p>

          <div className="flat-preview">
            {flat.content ? (
              <img src={flat.dataUrl} alt="Flat garment" />
            ) : (
              <span className="flat-empty">Nothing drawn yet</span>
            )}
          </div>

          <dl className="flat-facts">
            <div>
              <dt>Image</dt>
              <dd>
                {CANVAS_W} × {CANVAS_H}
              </dd>
            </div>
            <div>
              <dt>Drawn area</dt>
              <dd>
                {flat.content ? `${flat.content.w} × ${flat.content.h}` : '—'}
              </dd>
            </div>
            <div>
              <dt>Layers included</dt>
              <dd>
                {layers.length - hiddenLayers} of {layers.length}
                {hiddenLayers > 0 && ` · ${hiddenLayers} hidden`}
              </dd>
            </div>
          </dl>

          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!flat.content}
              onClick={() => download(flat.dataUrl, `${safeFilename(projectName)}-flat.png`)}
            >
              Download PNG
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
