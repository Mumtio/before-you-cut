// The whole product, end to end: draw → parts → fabric zones → render → worn.
// Spends 2 API units (1 render + 1 try-on).
//   node scripts/full.mjs outPrefix modelPhoto.jpg [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'full';
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
  const pts = points.map(([fx, fy]) => at(fx, fy));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(90);
}
const size = (n) =>
  page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill(n);
const colour = async (hex) => {
  await page.locator('.hex-input').first().fill(hex);
  await page.locator('.hex-input').first().press('Enter');
};

const SH = 0.263;
const WA = 0.391;
const KN = 0.661;

await page.locator('.project-name').fill('Crepe and chiffon');
await page.getByRole('button', { name: 'Pencil' }).click();
await size('11');
await colour('#3f3a2e');
await page.getByTitle('Draw one side, get both (M)').click();
await drag([[0.472, SH - 0.012], [0.44, SH], [0.424, SH + 0.025]]);
await drag([[0.424, SH + 0.025], [0.418, 0.33], [0.43, WA]]);
await drag([[0.43, WA], [0.4, 0.52], [0.372, KN]]);
await page.getByTitle('Draw one side, get both (M)').click();
await drag([[0.372, KN], [0.5, KN + 0.014], [0.628, KN]]);
await drag([[0.472, SH - 0.012], [0.5, SH - 0.005], [0.528, SH - 0.012]]);
await drag([[0.43, WA], [0.5, WA + 0.006], [0.57, WA]]);

await page.getByRole('button', { name: 'Flat fill' }).click();
await colour('#6b6350');
await page.mouse.click(...Object.values(at(0.5, 0.33)));
await colour('#8d8straight'.slice(0, 7));
await colour('#8d846b');
await page.mouse.click(...Object.values(at(0.5, 0.55)));
await page.waitForTimeout(250);

// --- fabric zones --------------------------------------------------------
await page.getByRole('button', { name: 'Fabric zones' }).click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Paint an area' }).click();
await page.getByRole('button', { name: 'Pencil' }).click();
await size('80');
await drag([[0.46, 0.29], [0.54, 0.29], [0.46, 0.34], [0.54, 0.34], [0.46, 0.38], [0.54, 0.38]], 4);
await page.getByRole('button', { name: 'That’s the area' }).click();
await page.waitForTimeout(250);
await page.locator('.dialog input.hex-input').fill('bodice');
await page.locator('.dialog textarea').fill('heavy crepe, matte, holds its shape');
await page.locator('.dialog .btn.primary').click();
await page.waitForTimeout(250);

await page.getByRole('button', { name: 'Paint an area' }).click();
await drag([[0.44, 0.45], [0.56, 0.45], [0.42, 0.52], [0.58, 0.52], [0.4, 0.6], [0.6, 0.6], [0.42, 0.64], [0.58, 0.64]], 4);
await page.getByRole('button', { name: 'That’s the area' }).click();
await page.waitForTimeout(250);
await page.locator('.dialog input.hex-input').fill('skirt');
await page.locator('.dialog textarea').fill('silk chiffon, semi-sheer, soft drape');
await page.locator('.dialog .btn.primary').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-1-zones.png` });

// --- render --------------------------------------------------------------
await page.getByRole('button', { name: 'Make it real' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Make it real — \d+ unit/ }).click();
console.log('rendering…');
await page.waitForFunction(() => document.querySelectorAll('.result.done, .result.failed').length > 0, {
  timeout: 300000,
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${prefix}-2-rendered.png` });

// --- carry the render into try-on ---------------------------------------
await page.getByRole('button', { name: 'Take it to try-on' }).click();
await page.waitForTimeout(700);
await page.locator('.panel-card input[type=file]').setInputFiles(photo);
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'A whole dress' }).click();
await page.screenshot({ path: `${prefix}-3-source-chosen.png` });

const before = await page.locator('.result').count();
await page.getByRole('button', { name: 'Try it on' }).click();
console.log('trying it on…');
await page.waitForFunction(
  (n) => document.querySelectorAll('.result.done, .result.failed').length > n,
  before,
  { timeout: 300000 },
);
await page.waitForTimeout(1500);
const src = await page.locator('.result img').nth(1).getAttribute('src');
console.log('worn result:', src?.split('/').pop());
await page.screenshot({ path: `${prefix}-4-worn.png`, fullPage: true });

await browser.close();
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
console.log('wrote ' + prefix + '-*.png');
