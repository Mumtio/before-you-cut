// Dev helper: screenshot the running app with the browser already on the machine.
//   node scripts/shot.mjs out.png [url]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'shot.png';
const url = process.argv[3] ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// --slider=Height:0 — set a body slider before shooting
for (const arg of process.argv.filter((a) => a.startsWith('--slider='))) {
  const [label, value] = arg.slice('--slider='.length).split(':');
  const row = page.locator('.slider-row', { hasText: label });
  await row.locator('input[type=range]').fill(value);
  await page.waitForTimeout(250);
}

if (process.argv.includes('--studio')) {
  await page.getByRole('button', { name: 'Start drawing' }).click();
  await page.waitForTimeout(500);
}
await page.waitForTimeout(200);
await page.screenshot({ path: out });
await browser.close();

if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('wrote ' + out);
