export interface Usage {
  unitsSpent: number;
  tasksSucceeded: number;
  tasksFailed: number;
  requests: number;
  inWindow: number;
  queued: number;
  perWindow: number;
}

export interface Job {
  id: string;
  stage: string;
  status?: 'done' | 'failed';
  resultUrl?: string;
  error?: string;
  detail?: string;
  taskId?: string;
  usage?: Usage;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export function health() {
  return fetch('/api/health').then(json<{ ok: boolean; keyConfigured: boolean }>);
}

export function usage() {
  return fetch('/api/usage').then(json<Usage>);
}

export function startTryOn(input: { garment: string; model: string; garmentCategory: string }) {
  return fetch('/api/tryon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then(json<{ jobId: string }>);
}

export function job(id: string) {
  return fetch(`/api/jobs/${id}`).then(json<Job>);
}

/**
 * Follow a job to the end. The backend is already polling the API on its own
 * schedule; this is just the browser watching the backend.
 */
export async function followJob(id: string, onUpdate: (j: Job) => void): Promise<Job> {
  for (;;) {
    const current = await job(id);
    onUpdate(current);
    if (current.status === 'done' || current.status === 'failed') return current;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
