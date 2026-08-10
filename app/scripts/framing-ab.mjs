// Same knee-length dress, sent both ways, to see which keeps the hem.
// Spends 2 API units.
//   node scripts/framing-ab.mjs outPrefix modelPhoto.jpg [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'ab';
const photo = process.argv[3];
const url = process.argv[4] ?? 'http://localhost:5174';
if (!photo) {
  console.error('Pass a path to a full-body model photo.');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));

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

// Guide-line positions in stage fractions for this viewport, so the hem can be
// put exactly on the knee — which is the case that went wrong.
const SHOULDER = 0.263;
const WAIST = 0.391;
const KNEE = 0.661;

await page.locator('.project-name').fill('Knee-length shift');
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill('11');
await page.locator('.hex-input').first().fill('#8f3212');
await page.locator('.hex-input').first().press('Enter');
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.472, SHOULDER - 0.012), at(0.44, SHOULDER), at(0.424, SHOULDER + 0.025)]); // cap sleeve
await drag([at(0.424, SHOULDER + 0.025), at(0.418, 0.33), at(0.43, WAIST)]); // side seam to waist
await drag([at(0.43, WAIST), at(0.402, 0.51), at(0.375, KNEE)]); // A-line skirt to the knee
await page.getByTitle('Draw one side, get both (M)').click();
await drag([at(0.375, KNEE), at(0.5, KNEE + 0.014), at(0.625, KNEE)]); // hem, on the knee line
await drag([at(0.472, SHOULDER - 0.012), at(0.5, SHOULDER - 0.005), at(0.528, SHOULDER - 0.012)]);

await page.getByRole('button', { name: 'Flat fill' }).click();
await page.locator('.hex-input').first().fill('#c2410c');
await page.locator('.hex-input').first().press('Enter');
await page.mouse.click(...Object.values(at(0.5, 0.45)));
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-0-design.png` });

await page.getByRole('button', { name: 'Fitting', exact: true }).click();
await page.waitForTimeout(500);
await page.locator('.panel-card input[type=file]').setInputFiles(photo);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'A whole dress' }).click();

async function runOnce(label, chip) {
  await page.getByRole('button', { name: chip }).click();
  await page.waitForTimeout(400);
  const sent = await page.locator('.garment-preview img').getAttribute('src');
  await page.screenshot({ path: `${prefix}-${label}-sent.png`, clip: { x: 20, y: 80, width: 420, height: 340 } });

  const before = await page.locator('.result').count();
  await page.getByRole('button', { name: 'Try it on' }).click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('.result.done, .result.failed').length > n,
    before,
    { timeout: 240000 },
  );
  await page.waitForTimeout(1200);
  console.log(`${label}: done (sent image ${Math.round((sent?.length ?? 0) / 1024)}kB)`);
}

await runOnce('A-figure', 'Keep the hem where I drew it');
await runOnce('B-garment', 'Just the garment');

await page.waitForTimeout(1000);
await page.screenshot({ path: `${prefix}-compare.png`, fullPage: true });
await browser.close();
console.log('wrote ' + prefix + '-*.png');
