// Full run: draw a dress, go to Fitting, add a model photo, try it on.
// Spends 1 API unit when it reaches a result.
//   node scripts/tryon.mjs outPrefix modelPhoto.jpg [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'tryon';
const photo = process.argv[3];
const url = process.argv[4] ?? 'http://localhost:5174';

if (!photo) {
  console.error('Pass a path to a full-body model photo.');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

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
async function drag(points, steps = 12) {
  const [head, ...rest] = points;
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(90);
}

await page.locator('.project-name').fill('Bias slip dress');
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill('9');
await page.locator('.hex-input').first().fill('#3d3a52');
await page.locator('.hex-input').first().press('Enter');

// A simple slip dress: strap, side seam, hem — drawn once, mirrored.
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.475, 0.255), at(0.462, 0.28), at(0.452, 0.315)]);
await drag([at(0.452, 0.315), at(0.437, 0.4), at(0.432, 0.47), at(0.44, 0.55)]);
await drag([at(0.44, 0.55), at(0.425, 0.63), at(0.412, 0.71)]);
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.412, 0.71), at(0.5, 0.735), at(0.588, 0.71)]);
await drag([at(0.452, 0.315), at(0.5, 0.335), at(0.548, 0.315)]);

await page.getByRole('button', { name: 'Flat fill' }).click();
await page.locator('.hex-input').first().fill('#5b5680');
await page.locator('.hex-input').first().press('Enter');
await page.mouse.click(...Object.values(at(0.5, 0.5)));
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-1-design.png` });

// --- fitting -----------------------------------------------------------
await page.getByRole('button', { name: 'Fitting', exact: true }).click();
await page.waitForTimeout(600);
await page.locator('.panel-card input[type=file]').setInputFiles(photo);
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'A whole dress' }).click();
await page.screenshot({ path: `${prefix}-2-ready.png` });

await page.getByRole('button', { name: 'Try it on' }).click();
console.log('try-on started, waiting…');

try {
  await page.waitForFunction(
    () => {
      const r = document.querySelector('.result');
      return r && (r.classList.contains('done') || r.classList.contains('failed'));
    },
    { timeout: 240000 },
  );
} catch {
  console.error('timed out waiting for a result');
}

await page.waitForTimeout(1500);
const outcome = await page.evaluate(() => {
  const r = document.querySelector('.result');
  return {
    status: r ? [...r.classList].filter((c) => c !== 'result').join(' ') : 'none',
    error: r?.querySelector('.result-error')?.textContent ?? null,
    stage: r?.querySelector('.result-stage')?.textContent ?? null,
  };
});
console.log('outcome:', JSON.stringify(outcome));
await page.screenshot({ path: `${prefix}-3-worn.png`, fullPage: true });

await browser.close();
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
console.log('wrote ' + prefix + '-{1,2,3}.png');
