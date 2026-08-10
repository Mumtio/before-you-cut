// Shows the boundary mid-draw, so its line quality can be judged against a
// brush stroke drawn the same way.
//   node scripts/lasso.mjs out.png [url]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'lasso.png';
const url = process.argv[3] ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start drawing' }).click();
await page.waitForTimeout(400);

const box = await page.locator('.stage-canvas').boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

// A curly brush stroke to compare the boundary line against.
await page.getByRole('button', { name: 'Pencil' }).click();
await page.locator('.slider-row', { hasText: 'Size' }).first().locator('input[type=range]').fill('4');
await page.mouse.move(...Object.values(at(0.2, 0.2)));
await page.mouse.down();
for (let i = 0; i <= 60; i++) {
  const t = i / 60;
  await page.mouse.move(
    at(0.2 + t * 0.16, 0.2).x,
    at(0, 0.2 + Math.sin(t * 9) * 0.06).y,
  );
}
await page.mouse.up();

// Turn snapping off so the line is purely what the hand did.
await page.locator('.check-row', { hasText: 'Snap to guides' }).locator('input').uncheck();
await page.getByRole('button', { name: 'Create part' }).click();

// A wobbly closed-ish boundary, left open mid-drag.
await page.mouse.move(...Object.values(at(0.42, 0.3)));
await page.mouse.down();
for (let i = 0; i <= 90; i++) {
  const t = i / 90;
  const a = t * Math.PI * 1.7 - Math.PI / 2;
  const r = 0.09 + Math.sin(t * 14) * 0.012;
  await page.mouse.move(at(0.5 + Math.cos(a) * r, 0).x, at(0, 0.42 + Math.sin(a) * r * 1.5).y);
}
await page.waitForTimeout(250);
await page.screenshot({ path: out });
await page.mouse.up();

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('wrote ' + out);
