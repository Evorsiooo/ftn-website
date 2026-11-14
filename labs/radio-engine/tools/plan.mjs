// Runs the lab's planner in headless Chromium and saves the timeline.
//   node tools/plan.mjs http://localhost:8787 out.json [anchorMs]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// the machine's own Playwright (NODE_PATH), so the lab doesn't pin a browser build
const { chromium } = createRequire(import.meta.url)('playwright');

const [base, out, anchor] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[page] ${m.text()}`));
await page.goto(`${base}/labs/radio-engine/?mode=plan${anchor ? `&anchorMs=${anchor}` : ''}`);
const started = Date.now();
const tl = await page.evaluate(() => window.__plan());
console.log(`planned in ${((Date.now() - started) / 1000).toFixed(1)} s`);
writeFileSync(out, JSON.stringify(tl));
await browser.close();
