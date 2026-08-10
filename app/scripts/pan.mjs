// Checks every way of moving the canvas actually moves it.
//   node scripts/pan.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start drawing' }).click();
await page.waitForTimeout(400);

const box = await page.locator('.stage-canvas').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

// Where is the paper? Sample a row of pixels and find the white block.
async function paperLeftEdge() {
  return page.evaluate(() => {
    const c = document.querySelector('.stage-canvas');
    const ctx = c.getContext('2d');
    const y = Math.round(c.height * 0.5);
    const row = ctx.getImageData(0, y, c.width, 1).data;
    for (let x = 0; x < c.width; x++) {
      const i = x * 4;
      if (row[i] > 200 && row[i + 1] > 200 && row[i + 2] > 200) return x;
    }
    return -1;
  });
}

async function attempt(name, fn) {
  const before = await paperLeftEdge();
  await fn();
  await page.waitForTimeout(250);
  const after = await paperLeftEdge();
  console.log(`${name.padEnd(22)} ${before} -> ${after}   ${after !== before ? 'MOVED' : 'no change'}`);
}

await attempt('space + drag', async () => {
  await page.keyboard.down('Space');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 160, cy, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Space');
});

await attempt('middle drag', async () => {
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx - 120, cy, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
});

await attempt('alt + drag', async () => {
  await page.keyboard.down('Alt');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
});

await attempt('right drag', async () => {
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx - 90, cy, { steps: 10 });
  await page.mouse.up({ button: 'right' });
});

await browser.close();
