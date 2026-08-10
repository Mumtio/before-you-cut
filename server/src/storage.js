import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORAGE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'storage',
);

await mkdir(STORAGE_DIR, { recursive: true });

/**
 * Their download links expire in a couple of hours and uploads are dropped
 * after a day, so every result is pulled down the moment it exists (spec §10).
 * Nothing the designer expects to keep is left pointing at their URLs.
 */
export async function keepResult(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the result (${res.status})`);
  const type = res.headers.get('content-type') || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : 'jpg';
  const filename = `${name}.${ext}`;
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(path.join(STORAGE_DIR, filename), buffer);
  return { filename, bytes: buffer.length, contentType: type };
}

export function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl ?? '');
  if (!match) throw new Error('Expected a data URL');
  const [, contentType, isBase64, payload] = match;
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { buffer, contentType };
}
