// Paint two fabric zones on a dress, then render it zone by zone.
// Spends 2 API units (one masked replacement per zone).
//   node scripts/fabric.mjs outPrefix [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'fab';
const url = process.argv[3] ?? 'http://localhost:5174';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
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
async function drag(points, steps = 12) {
  const pts = points.map(([fx, fy]) => at(fx, fy));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(90);
}

const SH = 0.263;
const WA = 0.391;
const KN = 0.661;

// A dress with a fitted bodice and a fuller skirt — two obvious fabrics.
await page.locator('.project-name').fill('Two fabrics');
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill('11');
await page.locator('.hex-input').first().fill('#4a3f6b');
await page.locator('.hex-input').first().press('Enter');
await page.getByTitle('Draw one side, get both (M)').click();
await drag([[0.472, SH - 0.012], [0.44, SH], [0.424, SH + 0.025]]);
await drag([[0.424, SH + 0.025], [0.418, 0.33], [0.43, WA]]);
await drag([[0.43, WA], [0.4, 0.52], [0.372, KN]]);
await page.getByTitle('Draw one side, get both (M)').click();
await drag([[0.372, KN], [0.5, KN + 0.014], [0.628, KN]]);
await drag([[0.472, SH - 0.012], [0.5, SH - 0.005], [0.528, SH - 0.012]]);
await drag([[0.43, WA], [0.5, WA + 0.006], [0.57, WA]]); // waist seam

await page.getByRole('button', { name: 'Flat fill' }).click();
await page.locator('.hex-input').first().fill('#6d5f97');
await page.locator('.hex-input').first().press('Enter');
await page.mouse.click(...Object.values(at(0.5, 0.33)));
await page.locator('.hex-input').first().fill('#8478b5');
await page.locator('.hex-input').first().press('Enter');
await page.mouse.click(...Object.values(at(0.5, 0.55)));
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-0-design.png` });

// --- paint two fabric zones ---------------------------------------------
await page.getByRole('button', { name: 'Fabric zones' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Paint an area' }).click();
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill('80');
await drag([[0.46, 0.29], [0.54, 0.29], [0.46, 0.34], [0.54, 0.34], [0.46, 0.38], [0.54, 0.38]], 4);
await page.screenshot({ path: `${prefix}-1-painting.png` });
await page.getByRole('button', { name: 'That’s the area' }).click();
await page.waitForTimeout(300);
await page.locator('.dialog input.hex-input').fill('bodice');
await page.locator('.dialog textarea').fill('heavy crepe, matte, holds its shape');
await page.locator('.dialog .btn.primary').click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'Paint an area' }).click();
await drag([[0.44, 0.45], [0.56, 0.45], [0.42, 0.52], [0.58, 0.52], [0.4, 0.6], [0.6, 0.6], [0.42, 0.64], [0.58, 0.64]], 4);
await page.getByRole('button', { name: 'That’s the area' }).click();
await page.waitForTimeout(300);
await page.locator('.dialog input.hex-input').fill('skirt');
await page.locator('.dialog textarea').fill('silk chiffon, semi-sheer, soft drape');
await page.locator('.dialog .btn.primary').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${prefix}-2-zones.png` });

// --- render zone by zone -------------------------------------------------
await page.getByRole('button', { name: 'Make it real' }).click();
await page.waitForTimeout(700);

if (process.argv.includes('--single')) {
  await page.getByRole('button', { name: 'One call for the lot' }).click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${prefix}-3-render-ready.png` });

await page.getByRole('button', { name: /Make it real — \d+ unit/ }).click();
console.log('render started…');
await page.waitForFunction(
  () => document.querySelectorAll('.result.done, .result.failed').length > 0,
  { timeout: 300000 },
);
await page.waitForTimeout(1500);
const outcome = await page.evaluate(() => {
  const r = document.querySelector('.result');
  return {
    status: [...r.classList].filter((c) => c !== 'result').join(' '),
    error: r.querySelector('.result-error')?.textContent ?? null,
  };
});
console.log('outcome:', JSON.stringify(outcome));
await page.screenshot({ path: `${prefix}-4-rendered.png`, fullPage: true });

await browser.close();
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
console.log('wrote ' + prefix + '-*.png');
