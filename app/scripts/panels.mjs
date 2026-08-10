// Collapses both rails and the parts bar, then screenshots each state.
//   node scripts/panels.mjs outPrefix [url]
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'panels';
const url = process.argv[3] ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start drawing' }).click();
await page.waitForTimeout(400);

// Hand tool selected, so the canvas is in "move me" mode in the shot.
await page.getByRole('button', { name: 'Move canvas' }).click();

await page.getByTitle('Hide Body & layers').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-1-left-closed.png` });

await page.getByTitle('Hide Tools & colour').click();
await page.getByTitle('Hide parts').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-2-all-closed.png` });

// And back — state should survive a reload.
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start drawing' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-3-after-reload.png` });

await browser.close();
console.log('wrote ' + prefix + '-{1..3}.png');
