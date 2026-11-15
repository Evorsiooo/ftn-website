// The AutoDJ from an empty radio, with two headless Chromium listeners.
//
//   node tools/sync-test.mjs <base url> <report.json>
//
// Listener A opens the page when nothing is stored: it starts the radio,
// analyses the songs, shares the analyses and lines up the next songs.
// Listener B joins JOIN_S seconds into the first mix. Each has its clock
// deliberately put off (A +3.7 s, B -2.1 s) so only the clock sync can line
// them up. Both pages run on one machine, so the true wall clock is shared
// and each capture is stamped with it. MIXES mixes are measured, during
// each mix and with the song alone after it.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const [base, reportPath] = process.argv.slice(2);
const JOIN_S = Number(process.env.JOIN_S ?? 6);
const MIXES = Number(process.env.MIXES ?? 2);
const started = Date.now();
const at = () => `+${((Date.now() - started) / 1000).toFixed(0)}s`;

const browserArgs = ['--autoplay-policy=no-user-gesture-required'];
async function listener(name, skew) {
  const proxy = process.env.HTTPS_PROXY && !base.includes('localhost') ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ args: browserArgs, proxy });
  const page = await browser.newPage({ ignoreHTTPSErrors: !!proxy });
  const logs = [];
  page.on('console', (m) => {
    const line = `${new Date().toISOString().slice(11, 23)} ${m.type()} ${m.text()}`;
    logs.push(line);
    if (m.text().startsWith('[radio]')) console.log(`${at()} ${name}: ${m.text().slice(8)}`);
  });
  page.on('pageerror', (e) => logs.push(`pageerror ${e.message}`));
  page.on('crash', () => console.log(`${at()} ${name}: PAGE CRASHED`));
  page.on('close', () => console.log(`${at()} ${name}: page closed`));
  browser.on('disconnected', () => console.log(`${at()} ${name}: browser disconnected`));
  await page.goto(`${base}/radio-engine/index.html?autostart=1&skew=${skew}${process.env.FILES ? `&files=${process.env.FILES}` : ''}`);
  return { name, browser, page, logs, skew };
}

const sleepUntil = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms - Date.now())));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const status = (l) => l.page.evaluate(() => window.__radio?.status ?? null);

/** True ms of the next mix's start, once A has one lined up (waits for it). */
async function nextMix(l, after = 0) {
  for (;;) {
    const s = await status(l);
    if (s?.nextMix) {
      const t0 = Date.now() + s.nextMix.inSec * 1000;
      if (t0 > after + 5000) return { t0, ...s.nextMix, slot: s.slot };
    }
    await sleep(1000);
  }
}

function decimate(pcm, factor) {
  const out = new Float32Array(Math.floor(pcm.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += pcm[i * factor + j];
    out[i] = s / factor;
  }
  return out;
}

/** Lag (samples of B after A) with the best normalised correlation, within +-maxLag. */
function xcorr(a, b, maxLag) {
  let best = { lag: 0, r: -2 };
  const n = Math.min(a.length, b.length) - 2 * maxLag;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sab = 0, saa = 0, sbb = 0;
    for (let i = maxLag; i < maxLag + n; i++) {
      const x = a[i], y = b[i + lag];
      sab += x * y; saa += x * x; sbb += y * y;
    }
    const r = sab / Math.sqrt(saa * sbb || 1);
    if (r > best.r) best = { lag, r };
  }
  return best;
}

async function compare(label, A, B, startTrue, seconds) {
  const [ca, cb] = await Promise.all([
    A.page.evaluate(([s, d]) => window.__radio.capture(s, d, 'master'), [startTrue, seconds]),
    B.page.evaluate(([s, d]) => window.__radio.capture(s, d, 'master'), [startTrue, seconds]),
  ]);
  const f = Math.max(1, Math.round(ca.sampleRate / 12000));
  const a = decimate(Float32Array.from(ca.pcm), f);
  const b = decimate(Float32Array.from(cb.pcm), f);
  const sr = ca.sampleRate / f;
  const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
  const { lag, r } = xcorr(a, b, Math.round(0.35 * sr));
  const driftMs = cb.firstSampleTrueMs - ca.firstSampleTrueMs + (lag / sr) * 1000;
  // time-stretched audio (loop mixes) doesn't correlate sample by sample; its loudness envelope does
  const frame = Math.round(sr * 0.0025);
  const env = (x) => {
    const e = new Float32Array(Math.floor(x.length / frame));
    for (let i = 0; i < e.length; i++) { let ss = 0; for (let j = 0; j < frame; j++) ss += x[i * frame + j] ** 2; e[i] = Math.sqrt(ss / frame); }
    const mean = e.reduce((p, q) => p + q, 0) / e.length;
    return e.map((v) => v - mean);
  };
  const envFrameMs = (frame / sr) * 1000;
  const ec = xcorr(env(a), env(b), Math.round(350 / envFrameMs));
  const envDriftMs = cb.firstSampleTrueMs - ca.firstSampleTrueMs + ec.lag * envFrameMs;
  const result = { label, driftMs: +driftMs.toFixed(1), correlation: +r.toFixed(3), envelopeDriftMs: +envDriftMs.toFixed(1), envelopeCorrelation: +ec.r.toFixed(3), rmsA: +rms(a).toFixed(4), rmsB: +rms(b).toFixed(4) };
  console.log(`${at()} ${JSON.stringify(result)}`);
  return result;
}

const A = await listener('A', 3700);
const first = await nextMix(A);
console.log(`${at()} first mix: ${first.style} in ${((first.t0 - Date.now()) / 1000).toFixed(0)} s`);
await sleepUntil(first.t0 + JOIN_S * 1000);
const B = await listener('B', -2100);
const results = [];
let mix = first;
for (let i = 0; i < MIXES; i++) {
  if (i > 0) mix = await nextMix(A, mix.t0);
  await sleepUntil(mix.t0 + (i === 0 ? (JOIN_S + 6) * 1000 : 4000));
  results.push(await compare(`during ${mix.style} mix ${i + 1}${i === 0 ? ` (B joined ${JOIN_S} s into it)` : ''}`, A, B, Date.now() + 300, 4));
  const after = await nextMix(A, mix.t0);
  // the song alone: a few seconds after the mix settled, well before the next one
  const aloneAt = Math.min(after.t0 - 8000, Date.now() + 25_000);
  await sleepUntil(aloneAt);
  results.push(await compare(`after mix ${i + 1}, song alone`, A, B, Date.now() + 300, 4));
}
const final = { A: await status(A), B: await status(B) };
const stored = await (await fetch(`${base}/api/radio/autodj`, { cache: 'no-store' })).json();
writeFileSync(reportPath, JSON.stringify({ results, final, stored: { rev: stored.rev, firstK: stored.firstK, songs: stored.items.map((i) => i.title), mixes: stored.mixes.map((m) => m.style) }, logs: { A: A.logs, B: B.logs } }, null, 1));
console.log('final', JSON.stringify(final));
await A.browser.close();
await B.browser.close();
