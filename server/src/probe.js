/**
 * Checks the key against the live API without spending a unit: units are only
 * consumed by a task that succeeds, and this only does the file handshake.
 *   npm run probe
 */
import { hasKey, uploadImage } from './youcam.js';

if (!hasKey()) {
  console.error('No YOUCAM_API_KEY in server/.env');
  process.exit(1);
}

// A 1x1 PNG is enough to exercise the reserve-then-PUT handshake.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

try {
  const fileId = await uploadImage({
    buffer: png,
    contentType: 'image/png',
    fileName: 'probe.png',
    feature: 'cloth',
  });
  console.log('Key works. Upload handshake completed.');
  console.log('file_id:', fileId.slice(0, 24) + '…');
  console.log('No units spent — no task was created.');
} catch (err) {
  console.error('Probe failed:', err.message);
  if (err.status) console.error('HTTP', err.status);
  if (err.body) console.error('Response:', JSON.stringify(err.body).slice(0, 800));
  process.exit(1);
}
