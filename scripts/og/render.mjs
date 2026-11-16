// Draws link preview cards (see lib/og/cards.ts).
//
//   node scripts/og/render.mjs            draw the cards the site says are missing and upload them
//                                         (needs OG_CRON_SECRET; OG_SITE defaults to https://ftn.euno.cc)
//   node scripts/og/render.mjs --static   redraw the fixed section cards into public/og/
//   node scripts/og/render.mjs --sample   draw sample item cards into ./og-samples/ (to check a design change)
//
// Needs playwright (with Chromium) and @fontsource-variable/bricolage-grotesque + dm-sans. They are looked
// up from OG_DEPS (a folder with its own node_modules), else from this repository.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const require = createRequire(join(process.env.OG_DEPS ? resolve(process.env.OG_DEPS) : repo, "package.json"));
const { chromium } = require("playwright");
const fontFile = (pkg, file) => pathToFileURL(join(dirname(require.resolve(`${pkg}/package.json`)), "files", file)).href;

const SITE = (process.env.OG_SITE || "https://ftn.euno.cc").replace(/\/$/, "");
const SECRET = process.env.OG_CRON_SECRET || "";

const html = readFileSync(join(here, "cards.html"), "utf8")
  .replace("__FONT_DISPLAY__", fontFile("@fontsource-variable/bricolage-grotesque", "bricolage-grotesque-latin-wght-normal.woff2"))
  .replace("__FONT_BODY__", fontFile("@fontsource-variable/dm-sans", "dm-sans-latin-wght-normal.woff2"))
  .replaceAll("__ASSETS__", pathToFileURL(join(repo, "public")).href);
const pagePath = join(tmpdir(), `og-cards-${process.pid}.html`);
writeFileSync(pagePath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(pagePath).href);
await page.evaluate(() => document.fonts.ready);

async function draw(data) {
  await page.evaluate((d) => window.draw(d), data);
  // wait for every picture (or its removal after a failed load) and the fonts
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  return page.locator(".c").screenshot({ type: "jpeg", quality: 86 });
}

const mode = process.argv[2];
try {
  if (mode === "--static") {
    const out = join(repo, "public/og");
    mkdirSync(out, { recursive: true });
    for (const name of await page.evaluate(() => window.SECTION_NAMES)) {
      writeFileSync(join(out, `${name}.jpg`), await draw({ section: name }));
      console.log("drew", name);
    }
  } else if (mode === "--sample") {
    const out = join(process.cwd(), "og-samples");
    mkdirSync(out, { recursive: true });
    const samples = JSON.parse(readFileSync(join(here, "samples.json"), "utf8"));
    for (const [name, data] of Object.entries(samples)) {
      writeFileSync(join(out, `${name}.jpg`), await draw(data));
      console.log("drew", name);
    }
  } else {
    if (!SECRET) throw new Error("OG_CRON_SECRET is not set");
    const headers = { "x-cron-secret": SECRET };
    let drawn = 0;
    for (let round = 0; round < 10; round++) {
      const res = await fetch(`${SITE}/api/og/pending?limit=40`, { headers });
      if (!res.ok) throw new Error(`pending: HTTP ${res.status}`);
      const { missing, cards } = await res.json();
      console.log(`${missing} card(s) missing`);
      if (!cards.length) break;
      let failed = 0;
      for (const card of cards) {
        try {
          const jpg = await draw(card.data);
          const up = await fetch(`${SITE}/api/og/upload?key=${encodeURIComponent(card.key)}`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "image/jpeg" },
            body: jpg,
          });
          if (!up.ok) throw new Error(`upload HTTP ${up.status}`);
          drawn++;
          console.log("uploaded", card.key);
        } catch (err) {
          failed++;
          console.error("failed", card.key, err.message);
        }
      }
      if (failed === cards.length) throw new Error("every card in this round failed");
    }
    console.log(`done: ${drawn} card(s) drawn`);
  }
} finally {
  await browser.close();
}
