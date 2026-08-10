// Does the outfit already on the model photo decide the length of the result?
//
// Step 1: try a floor-length gown on a model wearing a t-shirt and jeans, to
//         produce a photo of someone in a long gown.
// Step 2: try the SAME knee-length dress on (a) the t-shirt model and
//         (b) the long-gown model, and compare.
//
// Spends 3 API units.
//   node scripts/model-effect.mjs outPrefix baseModel.jpg storageDir [url]
import path from 'node:path';
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'me';
const baseModel = process.argv[3];
const storageDir = process.argv[4];
const url = process.argv[5] ?? 'http://localhost:5174';
if (!baseModel || !storageDir) {
  console.error('Usage: model-effect.mjs outPrefix baseModel.jpg serverStorageDir [url]');
  process.exit(1);
}

const SHOULDER = 0.263;
const WAIST = 0.391;
const KNEE = 0.661;
const ANKLE = 0.9;

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));

const at = (box, fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
async function drag(box, points, steps = 12) {
  const pts = points.map(([fx, fy]) => at(box, fx, fy));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function freshProject(name) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    indexedDB.deleteDatabase('sampleroom');
    localStorage.removeItem('sampleroom.lastProject');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start drawing' }).click();
  await page.waitForTimeout(400);
  await page.locator('.project-name').fill(name);
  return page.locator('.stage-canvas').boundingBox();
}

async function drawDress(box, hem) {
  await page.getByRole('button', { name: 'Pencil' }).click();
  await page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill('11');
  await page.locator('.hex-input').first().fill('#8f3212');
  await page.locator('.hex-input').first().press('Enter');
  await page.getByTitle('Draw one side, get both (M)').click();
  await drag(box, [[0.472, SHOULDER - 0.012], [0.44, SHOULDER], [0.424, SHOULDER + 0.025]]);
  await drag(box, [[0.424, SHOULDER + 0.025], [0.418, 0.33], [0.43, WAIST]]);
  await drag(box, [[0.43, WAIST], [0.405, (WAIST + hem) / 2], [0.382, hem]]);
  await page.getByTitle('Draw one side, get both (M)').click();
  await drag(box, [[0.382, hem], [0.5, hem + 0.012], [0.618, hem]]);
  await drag(box, [[0.472, SHOULDER - 0.012], [0.5, SHOULDER - 0.005], [0.528, SHOULDER - 0.012]]);
  await page.getByRole('button', { name: 'Flat fill' }).click();
  await page.locator('.hex-input').first().fill('#c2410c');
  await page.locator('.hex-input').first().press('Enter');
  const p = at(box, 0.5, (SHOULDER + hem) / 2);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
}

/** Runs one try-on and returns the local path of the stored result. */
async function tryOn(modelPath, label) {
  await page.getByRole('button', { name: 'Fitting', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('.panel-card input[type=file]').setInputFiles(modelPath);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'A whole dress' }).click();

  const before = await page.locator('.result').count();
  await page.getByRole('button', { name: 'Try it on' }).click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('.result.done, .result.failed').length > n,
    before,
    { timeout: 240000 },
  );
  await page.waitForTimeout(1000);

  const src = await page.locator('.result img').nth(1).getAttribute('src');
  const file = src?.split('/').pop() ?? '';
  console.log(`${label}: ${file}`);
  return path.join(storageDir, file);
}

// --- step 1: make a photo of someone wearing a floor-length gown ----------
let box = await freshProject('Floor-length gown');
await drawDress(box, ANKLE);
const gownModel = await tryOn(baseModel, 'gown-on-tshirt-model');

// --- step 2a: knee-length dress on the original t-shirt model -------------
box = await freshProject('Knee-length on t-shirt model');
await drawDress(box, KNEE);
await tryOn(baseModel, 'knee-on-tshirt-model');
await page.screenshot({ path: `${prefix}-A-tshirt-model.png` });

// --- step 2b: the same dress on the gown-wearing model --------------------
box = await freshProject('Knee-length on gown model');
await drawDress(box, KNEE);
await tryOn(gownModel, 'knee-on-gown-model');
await page.screenshot({ path: `${prefix}-B-gown-model.png` });

await browser.close();
console.log('done — compare the two result files above');
