// Draws, cuts a part, reloads to prove the project came back, then checks the
// flat export excludes the body and guides.
//   node scripts/project.mjs outPrefix [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'proj';
const url = process.argv[3] ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  indexedDB.deleteDatabase('sampleroom');
  localStorage.removeItem('sampleroom.lastProject');
});
await page.reload({ waitUntil: 'networkidle' });

await page.getByRole('button', { name: 'Start drawing' }).click();
await page.waitForTimeout(400);

const box = await page.locator('.stage-canvas').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
async function drag(points, steps = 10) {
  const [head, ...rest] = points;
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

await page.locator('.project-name').fill('Spring shift');
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.hex-input').first().fill('#6b2737');
await page.locator('.hex-input').first().press('Enter');
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.5, 0.29), at(0.44, 0.32), at(0.43, 0.45), at(0.45, 0.6)]);
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.45, 0.6), at(0.42, 0.72), at(0.58, 0.72), at(0.55, 0.6)]);
await page.getByRole('button', { name: 'Flat fill' }).click();
await page.locator('.hex-input').first().fill('#9c4257');
await page.locator('.hex-input').first().press('Enter');
await page.mouse.click(...Object.values(at(0.5, 0.5)));

await page.getByRole('button', { name: 'Create part' }).click();
await drag([at(0.44, 0.28), at(0.5, 0.26), at(0.56, 0.28), at(0.56, 0.36), at(0.44, 0.36), at(0.44, 0.28)], 6);
await page.waitForTimeout(250);
await page.locator('.dialog input').fill('neckline');
await page.locator('.dialog .btn.primary').click();

// Wait for autosave to land.
await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === 'Saved', {
  timeout: 15000,
});
console.log('autosave: Saved');

// --- reload, and see whether it all came back ---------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const restored = await page.evaluate(() => ({
  name: document.querySelector('.project-name')?.value,
  parts: document.querySelectorAll('.part-card').length,
  variants: document.querySelectorAll('.variant').length,
  onStudio: !!document.querySelector('.stage-canvas'),
}));
console.log('after reload:', JSON.stringify(restored));
await page.screenshot({ path: `${prefix}-1-restored.png` });

// --- flat export --------------------------------------------------------
await page.getByRole('button', { name: 'Flat export' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${prefix}-2-flat.png` });

// Body and guides must not be in it: check the exported PNG's pixels.
const check = await page.evaluate(async () => {
  const img = document.querySelector('.flat-preview img');
  if (!img) return { empty: true };
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1300;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 900, 1300);
  const d = ctx.getImageData(0, 0, 900, 1300).data;
  let opaque = 0;
  // A spot on the body's leg, well below the hem, and one on a guide line.
  const sample = (x, y) => d[(y * 900 + x) * 4 + 3];
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
  return { opaque, legPixel: sample(450, 1150), guidePixel: sample(120, 470) };
});
console.log('flat png:', JSON.stringify(check));

await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('wrote ' + prefix + '-{1,2}.png');
