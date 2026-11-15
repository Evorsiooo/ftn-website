import './style.css';
import { fetchTimeline, loadLibrary } from './radio/autodj';
import { RadioEngine } from './radio/engine';

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
      const [library, tl] = await Promise.all([loadLibrary(), fetchTimeline()]);
      const engine = new RadioEngine(tl, library, {
        skewMs: Number(params.get('skew') ?? 0),
        autodj: params.get('autodj') !== '0',
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
  const item = k === undefined || !tl ? null : tl.items[k - tl.firstK];
  (document.getElementById('pos') as HTMLDivElement).style.width = item ? `${Math.min(100, (slot / item.durationSec) * 100)}%` : '0';
  const next = s.nextMix as { style: string; inSec: number; reason: string | null; hash: string } | null;
  const rows: [string, string, string?][] = [
    ['Clock offset', s.offsetMs === undefined ? '—' : `${(s.offsetMs as number).toFixed(0)} ms (round trip ${(s.roundTripMs as number)?.toFixed(0)} ms)`],
    ['Position', s.positionSec === undefined ? '—' : `${(s.positionSec as number).toFixed(1)} s`],
    ['Next mix', next ? `${next.style} in ${next.inSec.toFixed(1)} s${next.reason ? ` (${next.reason})` : ''}` : '—'],
    ['Songs lined up', s.songsLinedUp === undefined ? '—' : `${s.songsLinedUp} after this one${s.autodj ? ` (${s.autodj}…)` : ''}`],
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

listen();
