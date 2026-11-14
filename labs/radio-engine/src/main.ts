import './style.css';
import { fileUrl, SONGS_KEY, TIMELINE_KEY } from './radio/config';
import { RadioEngine } from './radio/engine';
import { planTimeline, type SongRef } from './radio/planner';
import type { RadioTimeline } from './radio/timeline';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const lines: string[] = [];
const log = (line: string) => {
  const stamp = new Date().toISOString().slice(11, 23);
  lines.push(`${stamp} ${line}`);
  if (lines.length > 200) lines.shift();
  const el = document.getElementById('log');
  if (el) el.textContent = lines.join('\n');
  console.info(`[radio] ${line}`);
};

async function loadTimeline(): Promise<RadioTimeline> {
  const key = params.get('timeline') ?? TIMELINE_KEY;
  const r = await fetch(fileUrl(key), { cache: 'no-store' });
  if (!r.ok) throw new Error(`timeline: HTTP ${r.status}`);
  const tl = (await r.json()) as RadioTimeline;
  // test only: move the whole timeline in time (every browser in a test is given the same value)
  const anchor = params.get('anchorMs');
  if (anchor) tl.anchorMs = Number(anchor);
  return tl;
}

function listen() {
  app.innerHTML = `
    <div class="row"><button id="go">Start listening</button></div>
    <div class="card"><h2>On air</h2><div class="now" id="now">—</div><div class="bar"><div id="pos"></div></div></div>
    <div class="card"><h2>Engine</h2><dl id="stats"></dl></div>
    <div class="card"><h2>Lock screen check</h2><dl id="lock"></dl></div>
    <div class="card"><h2>Log</h2><pre id="log"></pre></div>`;
  const go = document.getElementById('go') as HTMLButtonElement;
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = 'Starting…';
    try {
      // iOS 17+: keep playing with the ringer switch on silent and while locked
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      const tl = await loadTimeline();
      const engine = new RadioEngine(tl, {
        skewMs: Number(params.get('skew') ?? 0),
        analyseHere: params.get('analyse') !== '0',
        log,
      });
      (window as unknown as { __radio: RadioEngine }).__radio = engine;
      await engine.start();
      go.textContent = 'Listening';
      watchLock(engine);
      setInterval(() => render(engine), 250);
    } catch (e) {
      go.disabled = false;
      go.textContent = 'Start listening';
      log(`start failed: ${String(e)}`);
    }
  };
  if (params.get('autostart') === '1') go.click();
}

function render(engine: RadioEngine) {
  const s = engine.status as Record<string, unknown>;
  const now = document.getElementById('now')!;
  now.textContent = (s.song as string) ?? String(s.state ?? '—');
  const slot = (s.positionSec as number) ?? 0;
  const tl = engine.timeline;
  const k = s.slot as number | undefined;
  const item = k === undefined ? null : tl.items[k % tl.items.length];
  (document.getElementById('pos') as HTMLDivElement).style.width = item ? `${Math.min(100, (slot / item.durationSec) * 100)}%` : '0';
  const next = s.nextMix as { style: string; inSec: number; reason: string | null; hash: string } | null;
  const rows: [string, string, string?][] = [
    ['Clock offset', s.offsetMs === undefined ? '—' : `${(s.offsetMs as number).toFixed(0)} ms (round trip ${(s.roundTripMs as number)?.toFixed(0)} ms)`],
    ['Position', s.positionSec === undefined ? '—' : `${(s.positionSec as number).toFixed(1)} s`],
    ['Next mix', next ? `${next.style} in ${next.inSec.toFixed(1)} s${next.reason ? ` (${next.reason})` : ''}` : '—'],
    ['Plan check', (s.verified as string) ?? (engine.timeline ? 'analysing here…' : '—'), (s.verified as string | null)?.startsWith('same') ? 'ok' : (s.verified as string | null)?.startsWith('DIFF') ? 'bad' : undefined],
    ['Loudness', s.loudnessGainDb === null || s.loudnessGainDb === undefined ? '—' : `${(s.loudnessGainDb as number).toFixed(1)} dB`],
    ['Output latency', s.outputLatencyMs === undefined ? '—' : `${s.outputLatencyMs} ms`],
    ['Audio', String(s.ctxState ?? '—')],
  ];
  document.getElementById('stats')!.innerHTML = rows.map(([a, b, c]) => `<dt>${a}</dt><dd${c ? ` class="${c}"` : ''}>${b}</dd>`).join('');
}

/** For the iPhone test: what happened while the page was hidden (screen locked). */
function watchLock(engine: RadioEngine) {
  let hiddenAt: number | null = null;
  let report = 'Lock the phone for a song change, then come back.';
  const show = () => {
    document.getElementById('lock')!.innerHTML = `<dt>Last lock</dt><dd>${report}</dd><dt>Audio now</dt><dd>${engine.ctx.state}</dd>`;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      engine.maxTickGapMs = 0;
      log('page hidden');
    } else if (hiddenAt !== null) {
      const secs = (performance.now() - hiddenAt) / 1000;
      report = `hidden ${secs.toFixed(0)} s, longest timer gap ${(engine.maxTickGapMs / 1000).toFixed(1)} s, audio ${engine.ctx.state}`;
      log(`page visible again: ${report}`);
      hiddenAt = null;
      show();
    }
  });
  engine.ctx.addEventListener('statechange', () => log(`audio context: ${engine.ctx.state}`));
  show();
}

function plan() {
  app.innerHTML = `
    <div class="card"><h2>Plan a timeline</h2>
    <p>Analyses every song of <code>${SONGS_KEY}</code> with BitChord's analyzer, measures loudness, and plans every mix with BitChord's Automix. This is what the browser that builds an Auto show would do.</p>
    <div class="row"><button id="go">Plan</button></div></div>
    <div class="card"><h2>Progress</h2><pre id="log"></pre></div>
    <div class="card"><h2>Timeline</h2><pre id="out">—</pre></div>`;
  const run = async (): Promise<RadioTimeline> => {
    const songs = (await (await fetch(fileUrl(params.get('songs') ?? SONGS_KEY), { cache: 'no-store' })).json()) as SongRef[];
    const started = performance.now();
    const tl = await planTimeline(
      songs,
      { id: params.get('id') ?? 'lab', anchorMs: Number(params.get('anchorMs') ?? Date.UTC(2026, 10, 14)), repeat: true },
      log,
    );
    log(`planned ${tl.mixes.length} mixes in ${((performance.now() - started) / 1000).toFixed(1)} s`);
    document.getElementById('out')!.textContent = JSON.stringify(tl, null, 1).slice(0, 20000);
    return tl;
  };
  (window as unknown as { __plan: () => Promise<RadioTimeline> }).__plan = run;
  (document.getElementById('go') as HTMLButtonElement).onclick = () => void run();
}

if (params.get('mode') === 'plan') plan();
else listen();
