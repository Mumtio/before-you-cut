import { Limiter, sleep, withRetry } from './limiter.js';

const BASE = process.env.YOUCAM_API_BASE || 'https://yce-api-01.makeupar.com';
const KEY = process.env.YOUCAM_API_KEY || '';

export const hasKey = () => KEY.trim().length > 0;

const limiter = new Limiter();

/** Units are only spent on a task that succeeds, so that is the only place we count. */
export const usage = { unitsSpent: 0, tasksSucceeded: 0, tasksFailed: 0, requests: 0 };

/**
 * Features do not all cost the same, so the running total comes from the API's
 * own price list rather than an assumption of one unit per call.
 */
const featureCost = new Map();

export async function loadFeatureCosts() {
  try {
    const res = await call('/s2s/v2.0/credit/feature-cost');
    for (const sku of res?.result?.skus ?? []) {
      const feature = String(sku.run_task_url ?? '').split('/task/')[1];
      if (feature) featureCost.set(feature, Number(sku.amount) || 1);
    }
    return Object.fromEntries(featureCost);
  } catch {
    return {};
  }
}

export const costOf = (feature) => featureCost.get(feature) ?? 1;
export const costTable = () => Object.fromEntries(featureCost);

export function stats() {
  return { ...usage, ...limiter.stats() };
}

class ApiError extends Error {
  constructor(message, { status, body, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

async function call(path, { method = 'GET', body } = {}) {
  if (!hasKey()) throw new ApiError('No API key configured on the server.', { status: 500 });

  return limiter.schedule(async () => {
    usage.requests++;
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${KEY}`,
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(`Could not reach the API: ${err.message}`, { retryable: true });
    }

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      throw new ApiError(`${method} ${path} failed (${res.status})`, {
        status: res.status,
        body: parsed,
        retryable: res.status === 429 || res.status >= 500,
      });
    }
    return parsed;
  });
}

/**
 * Step 1 and 2 of every operation. The file endpoint only reserves a slot and
 * hands back a pre-signed URL — the bytes go up separately, and skipping that
 * PUT is what produces the confusing 404s and 500s later on (spec §10).
 *
 * The spec describes the endpoint as /s2s/v2.0/file/{feature} while the current
 * docs show a bare /s2s/v2.0/file, so try the specific one and fall back.
 */
export async function uploadImage({ buffer, contentType, fileName, feature }) {
  const files = [{ content_type: contentType, file_name: fileName, file_size: buffer.length }];

  let response;
  try {
    response = await withRetry(() => call(`/s2s/v2.0/file/${feature}`, { method: 'POST', body: { files } }));
  } catch (err) {
    if (err.status !== 404) throw err;
    response = await withRetry(() => call('/s2s/v2.0/file', { method: 'POST', body: { files } }));
  }

  const entry = response?.data?.files?.[0] ?? response?.result?.files?.[0];
  const upload = entry?.requests?.[0];
  if (!entry?.file_id || !upload?.url) {
    throw new ApiError('File endpoint returned no upload target.', { body: response });
  }

  await withRetry(async () => {
    let res;
    try {
      res = await fetch(upload.url, {
        method: upload.method || 'PUT',
        headers: upload.headers || { 'Content-Type': contentType },
        body: buffer,
      });
    } catch (err) {
      throw new ApiError(`Upload failed: ${err.message}`, { retryable: true });
    }
    if (!res.ok) {
      throw new ApiError(`Upload rejected (${res.status})`, {
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      });
    }
  });

  // Kept as a string, always. These ids contain '/' and '+' and parsing one as
  // a number silently corrupts it.
  return String(entry.file_id);
}

export async function createTask(feature, body) {
  const res = await withRetry(() => call(`/s2s/v2.0/task/${feature}`, { method: 'POST', body }));
  const taskId = res?.data?.task_id ?? res?.result?.task_id;
  if (!taskId) throw new ApiError('Task endpoint returned no task id.', { body: res });
  return String(taskId);
}

/**
 * Poll until the task finishes. Stopping early and checking later returns an
 * invalid-task error even though the work succeeded — and the units are gone
 * either way (spec §10).
 */
export async function awaitTask(feature, taskId, { onStage, timeoutMs = 180_000 } = {}) {
  const started = Date.now();
  let delay = 1200;

  while (Date.now() - started < timeoutMs) {
    await sleep(delay);
    delay = Math.min(delay * 1.25, 4000);

    const res = await withRetry(() =>
      call(`/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`),
    );
    const data = res?.data ?? res?.result ?? {};
    const status = String(data.task_status ?? data.status ?? '').toLowerCase();

    onStage?.(status || 'running');

    if (status === 'success') {
      usage.tasksSucceeded++;
      usage.unitsSpent += costOf(feature);
      const url = data.results?.url ?? data.results?.[0]?.url ?? data.result?.url;
      if (!url) throw new ApiError('Task succeeded but returned no image.', { body: res });
      return { url, dstId: data.dst_id ? String(data.dst_id) : null, raw: data };
    }
    if (status === 'error' || status === 'failed') {
      usage.tasksFailed++;
      throw new ApiError(data.error || 'The task failed.', { body: res });
    }
  }
  throw new ApiError('The task did not finish in time.');
}

export { ApiError };
