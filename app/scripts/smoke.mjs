// Drives the real app with a real pointer: draws a stroke, turns mirror on,
// draws another, and screenshots the result.
//   node scripts/smoke.mjs out.png [url]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'smoke.png';
const url = process.argv[3] ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const stage = await page.locator('.stage-canvas').boundingBox();
const at = (fx, fy) => ({ x: stage.x + stage.width * fx, y: stage.y + stage.height * fy });

async function drag(points) {
  const [head, ...rest] = points;
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

// A left-side neckline and bodice edge, drawn once.
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.hex-input').fill('#8e2f45');
await page.locator('.hex-input').press('Enter');

await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.5, 0.28), at(0.44, 0.31), at(0.4, 0.36), at(0.4, 0.46), at(0.42, 0.56)]);

// Soft shading, mirrored too.
await page.getByRole('button', { name: 'Soft brush' }).click();
await page.locator('input[type=range]').nth(7).fill('40'); // brush size
await drag([at(0.44, 0.4), at(0.43, 0.5), at(0.45, 0.6)]);

// Then something asymmetric, with mirror off.
await page.getByTitle('Draw one side, get both (M)').click();
await page.getByRole('button', { name: 'Pencil' }).click();
await drag([at(0.42, 0.56), at(0.36, 0.68), at(0.38, 0.8), at(0.62, 0.8)]);

await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();

if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('wrote ' + out);
