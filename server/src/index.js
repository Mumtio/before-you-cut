import express from 'express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_DIR, decodeDataUrl, keepResult } from './storage.js';
import {
  ApiError,
  awaitTask,
  costOf,
  costTable,
  createTask,
  hasKey,
  loadFeatureCosts,
  stats,
  uploadImage,
} from './youcam.js';

const app = express();
app.use(express.json({ limit: '30mb' }));

const PORT = Number(process.env.PORT || 8787);
const FEATURE = 'cloth';

/** Jobs live in memory; the images they produce live on disk. */
const jobs = new Map();

function setStage(id, stage, extra = {}) {
  const job = jobs.get(id);
  if (job) Object.assign(job, { stage, updatedAt: Date.now() }, extra);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, keyConfigured: hasKey(), feature: FEATURE });
});

app.get('/api/usage', (_req, res) => res.json({ ...stats(), costs: costTable() }));

app.use('/api/results', express.static(STORAGE_DIR, { maxAge: '1h' }));

/**
 * One try-on: the flat garment plus a model photo, all four API steps run
 * server-side so the key never leaves this process.
 */
app.post('/api/tryon', (req, res) => {
  if (!hasKey()) {
    res.status(503).json({ error: 'The server has no API key. Add YOUCAM_API_KEY to server/.env.' });
    return;
  }
  const { garment, model, garmentCategory = 'auto' } = req.body ?? {};
  if (!garment || !model) {
    res.status(400).json({ error: 'Both a garment image and a model photo are required.' });
    return;
  }

  const id = randomUUID();
  jobs.set(id, { id, stage: 'queued', createdAt: Date.now(), updatedAt: Date.now() });
  res.status(202).json({ jobId: id });

  void runTryOn(id, { garment, model, garmentCategory });
});

async function runTryOn(id, { garment, model, garmentCategory }) {
  try {
    const garmentFile = decodeDataUrl(garment);
    const modelFile = decodeDataUrl(model);

    setStage(id, 'uploading the model photo');
    const srcFileId = await uploadImage({
      buffer: modelFile.buffer,
      contentType: modelFile.contentType,
      fileName: `model-${id}.${modelFile.contentType.includes('png') ? 'png' : 'jpg'}`,
      feature: FEATURE,
    });

    setStage(id, 'uploading the garment');
    const refFileId = await uploadImage({
      buffer: garmentFile.buffer,
      contentType: garmentFile.contentType,
      fileName: `garment-${id}.png`,
      feature: FEATURE,
    });

    setStage(id, 'starting the try-on');
    const taskId = await createTask(FEATURE, {
      src_file_id: srcFileId,
      ref_file_id: refFileId,
      garment_category: garmentCategory,
    });
    setStage(id, 'working', { taskId });

    const result = await awaitTask(FEATURE, taskId, {
      onStage: (s) => setStage(id, s === 'success' ? 'downloading the result' : 'working'),
    });

    setStage(id, 'downloading the result');
    const stored = await keepResult(result.url, `tryon-${id}`);

    setStage(id, 'done', {
      status: 'done',
      resultUrl: `/api/results/${stored.filename}`,
      dstId: result.dstId,
      finishedAt: Date.now(),
    });
  } catch (err) {
    const detail = err instanceof ApiError && err.body ? JSON.stringify(err.body).slice(0, 600) : null;
    setStage(id, 'failed', { status: 'failed', error: err.message, detail });
    console.error(`[tryon ${id}]`, err.message, detail ?? '');
  }
}

/**
 * Turn the flat drawing into cloth, one fabric zone at a time.
 *
 * Each zone is a masked replacement: current image + that zone's mask + the
 * fabric description, with each result fed into the next call. It is one call
 * per zone, which is exactly why the zone count is kept small (spec §8).
 *
 * `method: "single"` does it in one image-to-image call instead — cheaper, and
 * the spec says to test rather than assume it respects the zones.
 */
app.post('/api/render', (req, res) => {
  if (!hasKey()) {
    res.status(503).json({ error: 'The server has no API key. Add YOUCAM_API_KEY to server/.env.' });
    return;
  }
  const { source, zones = [], baseFabricNote = '', method = 'zones' } = req.body ?? {};
  if (!source) {
    res.status(400).json({ error: 'No flat garment to render.' });
    return;
  }

  const id = randomUUID();
  jobs.set(id, { id, stage: 'queued', createdAt: Date.now(), updatedAt: Date.now() });
  res.status(202).json({
    jobId: id,
    estimatedUnits:
      method === 'single' ? costOf('image-to-image/youcam') : zones.length * costOf('obj-replace'),
  });

  void runRender(id, { source, zones, baseFabricNote, method });
});

async function runRender(id, { source, zones, baseFabricNote, method }) {
  try {
    let current = decodeDataUrl(source);
    let spent = 0;

    if (method === 'single' || zones.length === 0) {
      setStage(id, 'rendering the whole garment');
      const srcId = await uploadImage({
        buffer: current.buffer,
        contentType: current.contentType,
        fileName: `flat-${id}.png`,
        feature: 'image-to-image/youcam',
      });
      const prompt = buildCombinedPrompt(zones, baseFabricNote);
      const taskId = await createTask('image-to-image/youcam', {
        src_file_ids: [srcId],
        model: 'youcam-image-v2',
        prompt,
        negative_prompt: 'flat illustration, sketch, line art, low quality, distorted proportions',
      });
      const result = await awaitTask('image-to-image/youcam', taskId, {
        onStage: () => setStage(id, 'rendering the whole garment'),
      });
      spent += costOf('image-to-image/youcam');
      const stored = await keepResult(result.url, `render-${id}`);
      setStage(id, 'done', {
        status: 'done',
        resultUrl: `/api/results/${stored.filename}`,
        units: spent,
        finishedAt: Date.now(),
      });
      return;
    }

    for (const [i, zone] of zones.entries()) {
      setStage(id, `${zone.name || 'zone'} — ${i + 1} of ${zones.length}`);

      const srcId = await uploadImage({
        buffer: current.buffer,
        contentType: current.contentType,
        fileName: `render-${id}-${i}-src.png`,
        feature: 'obj-replace',
      });
      const mask = decodeDataUrl(zone.mask);
      const mskId = await uploadImage({
        buffer: mask.buffer,
        contentType: mask.contentType,
        fileName: `render-${id}-${i}-msk.png`,
        feature: 'obj-replace',
      });

      const taskId = await createTask('obj-replace', {
        src_file_id: srcId,
        msk_file_id: mskId,
        prompt: zonePrompt(zone.fabricNote),
      });
      const result = await awaitTask('obj-replace', taskId, {
        onStage: () => setStage(id, `${zone.name || 'zone'} — ${i + 1} of ${zones.length}`),
      });
      spent += costOf('obj-replace');

      // Each result becomes the input to the next zone.
      const stored = await keepResult(result.url, `render-${id}-step${i}`);
      const buffer = await readFile(path.join(STORAGE_DIR, stored.filename));
      current = { buffer, contentType: stored.contentType };

      setStage(id, `${i + 1} of ${zones.length} done`, {
        resultUrl: `/api/results/${stored.filename}`,
        units: spent,
      });
    }

    setStage(id, 'done', { status: 'done', units: spent, finishedAt: Date.now() });
  } catch (err) {
    const detail = err instanceof ApiError && err.body ? JSON.stringify(err.body).slice(0, 600) : null;
    setStage(id, 'failed', { status: 'failed', error: err.message, detail });
    console.error(`[render ${id}]`, err.message, detail ?? '');
  }
}

const zonePrompt = (note) =>
  `Photograph of this exact garment area rendered in real ${note}. Keep the same shape, seams and colour. Realistic fabric texture, drape and lighting.`;

function buildCombinedPrompt(zones, baseFabricNote) {
  // No masks go with this call, so where each fabric belongs has to be said in
  // words — a name on its own ("sleeves") leaves the model to guess, and it
  // guesses wrong. The position comes from the painted mask itself.
  const parts = zones
    .filter((z) => z.fabricNote)
    .map((z) => {
      const what = `${z.name || 'one area'} in ${z.fabricNote}`;
      return z.where ? `${what}, ${z.where}` : what;
    });
  const rest = baseFabricNote ? `the rest in ${baseFabricNote}` : '';
  const made = [...parts, rest].filter(Boolean).join('; ');
  return `Turn this flat fashion drawing into a photograph of the real garment, ${made}. Keep the exact shape, proportions, seams and colours of the drawing. Realistic fabric texture, drape and studio lighting, plain background.`.slice(
    0,
    800,
  );
}

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'No such job.' });
    return;
  }
  res.json({ ...job, usage: stats() });
});

app.listen(PORT, async () => {
  console.log(`Before You Cut server on http://localhost:${PORT}`);
  if (!hasKey()) {
    console.log('No API key — add YOUCAM_API_KEY to server/.env');
    return;
  }
  const costs = await loadFeatureCosts();
  const n = Object.keys(costs).length;
  console.log(
    n
      ? `API key loaded. Unit costs for ${n} features fetched (cloth ${costOf('cloth')}, obj-replace ${costOf('obj-replace')}).`
      : 'API key loaded. Could not fetch the price list; assuming 1 unit per call.',
  );
});
