// Two headless Chromium listeners on one timeline; measures how far apart
// they are, by recording what each one outputs and cross-correlating.
//
//   node tools/sync-test.mjs http://localhost:8787 <timeline.json> <report.json>
//
// Listener A starts well before a loop mix; listener B joins in the middle of
// it. Each has its clock deliberately put off (A +3.7 s, B -2.1 s) so only
// the clock sync can line them up. Both pages run on one machine, so the true
// wall clock is shared and each capture is stamped with it.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const [base, timelinePath, reportPath] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(timelinePath, 'utf8'));
const MIX = Number(process.env.MIX ?? 0); // the mix B joins in the middle of
const LEAD_S = Number(process.env.LEAD_S ?? 50); // A starts this long before it
const JOIN_S = Number(process.env.JOIN_S ?? 8); // B joins this long after it starts

// put mix MIX's start LEAD_S from now: walk the timeline arithmetic (same as timeline.ts)
const mixAfter = (i) => tl.mixes[i % tl.items.length];
let t = (mixAfter(0).outSec - tl.startSec) * 1000;
for (let i = 0; i < MIX; i++) t += (mixAfter(i).settleSec + mixAfter(i + 1).outSec - mixAfter(i).inEndSec) * 1000;
const now = Date.now();
const T0 = now + LEAD_S * 1000; // true ms of mix MIX's start
const anchorMs = Math.round(T0 - t);
const next = (i) => (mixAfter(i).settleSec + mixAfter(i + 1).outSec - mixAfter(i).inEndSec) * 1000;
const T1 = T0 + next(MIX); // the following mix
console.log(`mix ${MIX} (${mixAfter(MIX).style}) at +${LEAD_S}s; mix ${MIX + 1} (${mixAfter(MIX + 1).style}) at +${((T1 - now) / 1000).toFixed(0)}s`);

const browserArgs = ['--autoplay-policy=no-user-gesture-required'];
async function listener(name, skew) {
  const browser = await chromium.launch({ args: browserArgs });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${new Date().toISOString().slice(11, 23)} ${m.type()} ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror ${e.message}`));
  await page.goto(`${base}/labs/radio-engine/?autostart=1&skew=${skew}&anchorMs=${anchorMs}`);
  return { name, browser, page, logs, skew };
}

const sleepUntil = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms - Date.now())));
const samples = [];
async function sample(l) {
  return l.page.evaluate(() => {
    const r = window.__radio;
    if (!r) return null;
    const s = r.status;
    return { trueMs: performance.timeOrigin + performance.now(), offsetMs: s.offsetMs, rtt: s.roundTripMs, slot: s.slot, pos: s.positionSec, el: r.elements.map((e) => e.currentTime), verified: s.verified, outputLatencyMs: s.outputLatencyMs };
  });
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

async function compare(label, A, B, startTrue, seconds, source = 'master') {
  const [ca, cb] = await Promise.all([
    A.page.evaluate(([s, d, src]) => window.__radio.capture(s, d, src), [startTrue, seconds, source]),
    B.page.evaluate(([s, d, src]) => window.__radio.capture(s, d, src), [startTrue, seconds, source]),
  ]);
  const f = Math.max(1, Math.round(ca.sampleRate / 12000));
  const a = decimate(Float32Array.from(ca.pcm), f);
  const b = decimate(Float32Array.from(cb.pcm), f);
  const sr = ca.sampleRate / f;
  const rmsA = Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  const rmsB = Math.sqrt(b.reduce((s, x) => s + x * x, 0) / b.length);
  const maxLag = Math.round(0.35 * sr);
  const { lag, r } = xcorr(a, b, maxLag);
  // content heard by A at firstA + i/sr is heard by B at firstB + (i + lag)/sr
  const driftMs = cb.firstSampleTrueMs - ca.firstSampleTrueMs + (lag / sr) * 1000;
  // A time-stretched deck (the loop mix) is a phase vocoder: two instances
  // give the same sound with different phases, so the waveform doesn't
  // correlate. Its loudness envelope (2.5 ms frames) does, beat for beat.
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
  const result = { label: source === 'master' ? label : `${label} [${source}]`, driftMs: Math.round(driftMs * 10) / 10, correlation: Math.round(r * 1000) / 1000, envelopeDriftMs: Math.round(envDriftMs * 10) / 10, envelopeCorrelation: Math.round(ec.r * 1000) / 1000, rmsA: +rmsA.toFixed(4), rmsB: +rmsB.toFixed(4), captureStartsMs: Math.round((cb.firstSampleTrueMs - ca.firstSampleTrueMs) * 10) / 10 };
  console.log(JSON.stringify(result));
  return result;
}

const A = await listener('A', 3700);
await sleepUntil(T0 + JOIN_S * 1000);
const B = await listener('B', -2100);
const sampler = setInterval(async () => {
  for (const l of [A, B]) {
    try { const s = await sample(l); if (s) samples.push({ who: l.name, ...s }); } catch {}
  }
}, 1000);

const results = [];
const mix0 = mixAfter(MIX);
await sleepUntil(T0 + (JOIN_S + 5) * 1000);
results.push(await compare(`during ${mix0.style} mix ${MIX} (B joined ${JOIN_S}s into it)`, A, B, Date.now() + 300, 4));
if (mix0.style === 'loop' && process.env.PER_DECK) {
  results.push(await compare(`during ${mix0.style} mix ${MIX}`, A, B, Date.now() + 300, 3, 'outLoop'));
  results.push(await compare(`during ${mix0.style} mix ${MIX}`, A, B, Date.now() + 300, 3, 'inLoop'));
}
if (process.env.ONLY_FIRST) { writeFileSync(reportPath, JSON.stringify({ results, logs: { A: A.logs, B: B.logs } }, null, 1)); process.exit(0); }
await sleepUntil(T0 + (mix0.settleSec + 8) * 1000);
results.push(await compare(`after mix ${MIX}, song alone`, A, B, Date.now() + 300, 4));
const mix1 = mixAfter(MIX + 1);
await sleepUntil(T1 + Math.min(5, mix1.settleSec / 3) * 1000);
results.push(await compare(`during ${mix1.style} mix ${MIX + 1}`, A, B, Date.now() + 300, 4));
await sleepUntil(T1 + (mix1.settleSec + 20) * 1000);
results.push(await compare(`after mix ${MIX + 1}, song alone`, A, B, Date.now() + 300, 4));
clearInterval(sampler);

const final = { A: await sample(A), B: await sample(B) };
writeFileSync(reportPath, JSON.stringify({ anchorMs, T0, T1, results, final, samples, logs: { A: A.logs, B: B.logs } }, null, 1));
console.log('final', JSON.stringify(final));
await A.browser.close();
await B.browser.close();
