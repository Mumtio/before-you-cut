// End-to-end check of the part/version mechanism, driven with a real pointer.
//   node scripts/parts.mjs outPrefix [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'parts';
const url = process.argv[3] ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
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
  await page.waitForTimeout(120);
}

async function setSlider(label, value) {
  await page.locator('.slider-row', { hasText: label }).first().locator('input[type=range]').fill(value);
}

// --- draw a bodice ------------------------------------------------------
await page.getByRole('button', { name: 'Pencil' }).click();
await setSlider('Size', '10');
await page.locator('.hex-input').first().fill('#7d2b3f');
await page.locator('.hex-input').first().press('Enter');
await page.getByTitle('Draw one side, get both (M)').click();

// neckline + bodice edge, mirrored
await drag([at(0.5, 0.3), at(0.455, 0.325), at(0.435, 0.36)]);
await drag([at(0.435, 0.36), at(0.43, 0.44), at(0.446, 0.53)]);
// hem
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.446, 0.53), at(0.42, 0.68), at(0.58, 0.68), at(0.554, 0.53)]);

await page.getByRole('button', { name: 'Flat fill' }).click();
await page.locator('.hex-input').first().fill('#a8455c');
await page.locator('.hex-input').first().press('Enter');
await page.mouse.click(...Object.values(at(0.5, 0.45)));
await page.waitForTimeout(200);

// --- cut a part out of it ----------------------------------------------
await page.getByRole('button', { name: 'Create part' }).click();
await drag(
  [
    at(0.44, 0.285),
    at(0.5, 0.265),
    at(0.56, 0.285),
    at(0.565, 0.36),
    at(0.5, 0.345),
    at(0.435, 0.36),
    at(0.44, 0.285),
  ],
  6,
);
await page.waitForTimeout(300);
await page.locator('.dialog input').fill('neckline');
await page.locator('.dialog .btn.primary').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-1-created.png` });

// --- make a second version ---------------------------------------------
await page.getByRole('button', { name: 'Eraser' }).click();
await setSlider('Size', '70');
await drag([at(0.46, 0.3), at(0.54, 0.3), at(0.5, 0.33)]);

await page.getByRole('button', { name: 'Pencil' }).click();
await setSlider('Size', '9');
await page.locator('.hex-input').first().fill('#1f2933');
await page.locator('.hex-input').first().press('Enter');
await drag([at(0.44, 0.29), at(0.5, 0.34), at(0.56, 0.29)]);
await page.waitForTimeout(200);
await page.screenshot({ path: `${prefix}-2-unsaved.png` });

await page.getByRole('button', { name: 'Save this version' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-3-two-versions.png` });

// --- swap back ----------------------------------------------------------
await page.locator('.variant').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-4-swapped.png` });

// --- a boundary that overlaps an existing part must be refused ----------
await page.getByRole('button', { name: 'Create part' }).click();
await drag(
  [at(0.47, 0.3), at(0.55, 0.3), at(0.55, 0.42), at(0.47, 0.42), at(0.47, 0.3)],
  6,
);
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-5-overlap.png` });

await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('wrote ' + prefix + '-{1..4}.png');
