// The radio's running order: its format, the arithmetic every browser does on
// it, and the checks the website runs before storing anything a browser sends.
//
// One file with no imports, shared by the website's endpoints, the listeners'
// browsers (labs/radio-engine) and the lab's test server (Node strips the
// types). Spec: labs/radio-engine/docs/timeline.md.

// ---- Format --------------------------------------------------------------------------------

export const TIMELINE_VERSION = 1;
/** BitChord's ANALYSIS_VERSION the shared analyses must carry. */
export const ANALYSIS_VERSION = 8;
/** A new mix must start at least this far in the server's future when it's stored. */
export const MIN_MIX_LEAD_MS = 20_000;
/** A fresh start begins within this window of the server's now. */
export const FRESH_START_WINDOW_MS = 60_000;
export const MAX_ITEMS = 12;

export type DeckId = 'outEl' | 'inEl' | 'outLoop' | 'inLoop';
export type ParamId = 'gain' | 'low' | 'mid' | 'high' | 'hp' | 'lp';

export type ParamOp =
  | { op: 'set'; v: number; at: number }
  | { op: 'lin'; v: number; at: number }
  | { op: 'exp'; v: number; at: number }
  | { op: 'curve'; values: number[]; at: number; dur: number }
  | { op: 'target'; v: number; at: number; tc: number }
  | { op: 'cancel'; at: number };

export interface ParamEvent {
  deck: DeckId;
  param: ParamId;
  e: ParamOp;
}
export interface TransportPoint {
  deck: 'outEl' | 'inEl';
  output: number;
  input: number;
  rate: number;
  active: boolean;
}
export interface LoopPoint {
  deck: 'outLoop' | 'inLoop';
  output: number;
  input: number;
  rate: number;
  active: boolean;
  loop: [number, number] | null;
}
export interface LoopRegion {
  deck: 'outLoop' | 'inLoop';
  side: 'out' | 'in';
  startSec: number;
  endSec: number;
}
/** A mix as data: every time in seconds from the mix's start. */
export interface MixProgram {
  params: ParamEvent[];
  transport: TransportPoint[];
  loops: LoopPoint[];
  regions: LoopRegion[];
}

export interface TimelineItem {
  key: string;
  title: string;
  artist: string;
  durationSec: number;
  loudnessDb: number | null;
}

export type MixStyle = 'loop' | 'blend' | 'filter' | 'crossfade';

export interface TimelineMix {
  style: MixStyle;
  outSec: number;
  settleSec: number;
  inEndSec: number;
  handoffSec: number;
  reason: string | null;
  /** BitChord's LoopMixPlan, display only. */
  loop?: unknown;
  program: MixProgram;
  hash: string;
}

export interface RadioTimeline {
  version: 1;
  id: string;
  /** Bumped by one on every stored change; a change names the revision it builds on. */
  rev: number;
  /** Global number of items[0]: songs keep their number when old ones are dropped. */
  firstK: number;
  /** Server ms at which items[0] is at [startSec]. */
  anchorMs: number;
  startSec: number;
  /** Planned shows can loop; the AutoDJ's running order never does. */
  repeat: boolean;
  items: TimelineItem[];
  mixes: TimelineMix[];
  plannedWith: { bars: number; analysisVersion: number; engine: string };
  /**
   * Songs that have left the running order, most recent first (at most PLAYED_MAX). The website
   * fills it in when it stores a change (withPlayed), so the next-song picker knows what played.
   */
  played?: string[];
}

/** How many songs the running order remembers having played. */
export const PLAYED_MAX = 200;

/**
 * [next] with its play history: the songs [current] had that [next] drops, most recent first, ahead of
 * [current]'s own history. A fresh start counts every song of the old running order.
 */
export function withPlayed(current: RadioTimeline | null, next: RadioTimeline, nowMs: number): RadioTimeline {
  if (!current) return { ...next, played: [] };
  const fresh = endOfTimelineMs(current) < nowMs;
  const dropped = fresh ? current.items.length : Math.max(0, next.firstK - current.firstK);
  const left = current.items.slice(0, dropped).map((i) => i.key).reverse();
  return { ...next, played: [...left, ...(current.played ?? [])].slice(0, PLAYED_MAX) };
}

/** Everything the running order has played or lined up, most recent first. */
export function playHistory(tl: RadioTimeline): string[] {
  return [...tl.items.map((i) => i.key).reverse(), ...(tl.played ?? [])];
}

// ---- The analysed songs, in short ---------------------------------------------------------------
// What the next-song picker (AutoMix's selector) reads of each analysis. The full analyses are about
// 100 KB each, so the website keeps this index of every shared one (lib/radio/analysis-index.ts).

export interface AnalysisSummary {
  bpm: number | null;
  camelot: { num: number; letter: 'A' | 'B' } | null;
  energy: number;
  gridConfidence: number;
}
export interface AnalysisIndex {
  analysisVersion: number;
  /** Song key -> summary. */
  songs: Record<string, AnalysisSummary>;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** The index entry for a shared analysis (null when it isn't this analysis version). */
export function summarizeAnalysis(a: unknown): AnalysisSummary | null {
  if (!isObj(a) || a.analysisVersion !== ANALYSIS_VERSION) return null;
  const c = a.camelot;
  const camelot = isObj(c) && within(c.num, 1, 12) && (c.letter === 'A' || c.letter === 'B') ? { num: c.num, letter: c.letter as 'A' | 'B' } : null;
  return {
    bpm: finite(a.bpm) && a.bpm > 0 ? round4(a.bpm) : null,
    camelot,
    energy: finite(a.energy) ? round4(a.energy) : 0,
    gridConfidence: finite(a.gridConfidence) ? round4(a.gridConfidence) : 0,
  };
}

export interface Slot {
  /** Global number; decides the deck (even A, odd B). */
  k: number;
  item: TimelineItem;
  itemIndex: number;
  startMs: number;
  soloFromMs: number;
  soloFromSec: number;
  mixIn: { mix: TimelineMix; t0Ms: number } | null;
  mixOut: { mix: TimelineMix; t0Ms: number } | null;
  endMs: number;
}

// ---- Arithmetic (every browser does exactly this) ---------------------------------------------

function mixAfter(tl: RadioTimeline, i: number): TimelineMix | null {
  const n = tl.items.length;
  if (i < n - 1) return tl.mixes[i] ?? null;
  return tl.repeat ? (tl.mixes[n - 1] ?? null) : null;
}

function stepSec(tl: RadioTimeline, i: number): number | null {
  const n = tl.items.length;
  const mix = mixAfter(tl, i);
  const nextMix = mixAfter(tl, (i + 1) % n);
  if (!mix || !nextMix) return null;
  return mix.settleSec + (nextMix.outSec - mix.inEndSec);
}

/** Server ms of the mix out of local slot j. */
function mixT0Ms(tl: RadioTimeline, j: number): number | null {
  const n = tl.items.length;
  const first = mixAfter(tl, 0);
  if (!first) return null;
  let t = tl.anchorMs + (first.outSec - tl.startSec) * 1000;
  if (j === 0) return t;
  if (!tl.repeat && j > n - 2) return null;
  let period = 0;
  for (let i = 0; i < n; i++) period += stepSec(tl, i) ?? NaN;
  const cycles = tl.repeat && Number.isFinite(period) ? Math.floor(j / n) : 0;
  if (cycles > 0) t += cycles * period * 1000;
  for (let i = cycles * n; i < j; i++) {
    const s = stepSec(tl, i % n);
    if (s === null) return null;
    t += s * 1000;
  }
  return t;
}

export function firstSoundSec(p: MixProgram, side: 'in' | 'out'): number {
  const deck = side === 'in' ? 'inEl' : 'outEl';
  const loop = side === 'in' ? 'inLoop' : 'outLoop';
  const times = [
    ...p.transport.filter((c) => c.deck === deck && c.active).map((c) => c.output),
    ...p.loops.filter((c) => c.deck === loop && c.active).map((c) => c.output),
  ];
  return times.length ? Math.min(...times) : 0;
}

export function lastSoundSec(p: MixProgram): number {
  const stops = [
    ...p.transport.filter((c) => c.deck === 'outEl' && !c.active).map((c) => c.output),
    ...p.loops.filter((c) => c.deck === 'outLoop' && !c.active).map((c) => c.output),
  ];
  return stops.length ? Math.max(...stops) : 0;
}

/** The song with global number k. */
export function slotAt(tl: RadioTimeline, k: number): Slot | null {
  const n = tl.items.length;
  const j = k - (tl.firstK ?? 0);
  if (j < 0 || n === 0 || (!tl.repeat && j >= n)) return null;
  const i = j % n;
  const item = tl.items[i]!;
  const outMix = mixAfter(tl, i);
  const outT0 = outMix ? mixT0Ms(tl, j) : null;
  let mixIn: Slot['mixIn'] = null;
  let startMs: number;
  let soloFromMs: number;
  let soloFromSec: number;
  if (j === 0) {
    startMs = tl.anchorMs;
    soloFromMs = tl.anchorMs;
    soloFromSec = tl.startSec;
  } else {
    const prev = mixAfter(tl, (j - 1) % n)!;
    const t0 = mixT0Ms(tl, j - 1)!;
    mixIn = { mix: prev, t0Ms: t0 };
    startMs = t0 + firstSoundSec(prev.program, 'in') * 1000;
    soloFromMs = t0 + prev.settleSec * 1000;
    soloFromSec = prev.inEndSec;
  }
  const endMs =
    outMix && outT0 !== null ? outT0 + lastSoundSec(outMix.program) * 1000 : soloFromMs + (item.durationSec - soloFromSec) * 1000;
  return { k, item, itemIndex: i, startMs, soloFromMs, soloFromSec, mixIn, mixOut: outMix && outT0 !== null ? { mix: outMix, t0Ms: outT0 } : null, endMs };
}

/** The global number of the song on air at [serverMs] (from the handoff into it to the handoff out of it). */
export function slotIndexAt(tl: RadioTimeline, serverMs: number): number | null {
  if (serverMs < tl.anchorMs || !tl.items.length) return null;
  const n = tl.items.length;
  const first = tl.firstK ?? 0;
  let k = first;
  if (tl.repeat) {
    let period = 0;
    for (let i = 0; i < n; i++) period += stepSec(tl, i) ?? NaN;
    const t0 = mixT0Ms(tl, 0);
    if (Number.isFinite(period) && period > 0 && t0 !== null && serverMs > t0) {
      k = first + Math.max(0, Math.floor((serverMs - t0) / (period * 1000)) * n);
    }
  }
  for (let guard = 0; guard < 4 * n + 4; guard++) {
    const slot = slotAt(tl, k);
    if (!slot) return null;
    const handoff = slot.mixOut ? slot.mixOut.t0Ms + slot.mixOut.mix.handoffSec * 1000 : slot.endMs;
    if (serverMs < handoff) return k;
    k++;
  }
  return null;
}

export function nowPlaying(tl: RadioTimeline, serverMs: number): { slot: Slot; positionSec: number } | null {
  const k = slotIndexAt(tl, serverMs);
  if (k === null) return null;
  const slot = slotAt(tl, k)!;
  return { slot, positionSec: trackPositionSec(slot, serverMs) };
}

/**
 * Where in its own track the song on [slot] really is at [serverMs]. While it plays alone that is a straight
 * line at normal speed; while it mixes in or out it follows the mix's transport (the same points the decks
 * are scheduled on), because a mix plays it tempo-matched or looped, so the line would run ahead or behind
 * and the lyrics would rush, then wait for the song (BitChord follows the mix's playhead the same way).
 */
export function trackPositionSec(slot: Slot, serverMs: number): number {
  const solo = slot.soloFromSec + (serverMs - slot.soloFromMs) / 1000;
  const along = (mix: TimelineMix, t0Ms: number, el: 'inEl' | 'outEl', loop: 'inLoop' | 'outLoop') => {
    const t = (serverMs - t0Ms) / 1000;
    const atEl = pointAt(mix.program.transport.filter((p) => p.deck === el), t);
    if (atEl?.active) return atEl.input + (t - atEl.output) * atEl.rate;
    const atLoop = pointAt(mix.program.loops.filter((p) => p.deck === loop), t);
    if (atLoop?.active) {
      let pos = atLoop.input + (t - atLoop.output) * atLoop.rate;
      if (atLoop.loop && atLoop.loop[1] > atLoop.loop[0] && pos >= atLoop.loop[1]) {
        const [a, b] = atLoop.loop;
        pos = a + ((pos - a) % (b - a));
      }
      return pos;
    }
    return atEl ? atEl.input : null;
  };
  if (slot.mixIn && serverMs < slot.soloFromMs) return along(slot.mixIn.mix, slot.mixIn.t0Ms, "inEl", "inLoop") ?? solo;
  if (slot.mixOut && serverMs >= slot.mixOut.t0Ms) return along(slot.mixOut.mix, slot.mixOut.t0Ms, "outEl", "outLoop") ?? solo;
  return solo;
}

/** The newest point at or before [t] (points in order of output time). */
function pointAt<P extends { output: number }>(points: P[], t: number): P | null {
  let at: P | null = null;
  for (const p of points) if (p.output <= t) at = p;
  return at;
}

/** When the running order runs out (the last song ends), in server ms. */
export function endOfTimelineMs(tl: RadioTimeline): number {
  if (tl.repeat || !tl.items.length) return tl.repeat ? Infinity : tl.anchorMs;
  return slotAt(tl, (tl.firstK ?? 0) + tl.items.length - 1)!.endMs;
}

/**
 * Drops the first [r] songs, keeping every later song exactly where it was:
 * the new first song starts "alone" at the moment it used to finish mixing in.
 * Only valid once that moment has passed.
 */
export function rebase(tl: RadioTimeline, r: number): RadioTimeline {
  if (r <= 0) return tl;
  const slot = slotAt(tl, (tl.firstK ?? 0) + r)!;
  return {
    ...tl,
    firstK: (tl.firstK ?? 0) + r,
    anchorMs: slot.soloFromMs,
    startSec: slot.soloFromSec,
    items: tl.items.slice(r),
    mixes: tl.mixes.slice(r),
  };
}

/** FNV-1a over the program's JSON: equal programs, equal hashes, in every browser. */
export function hashProgram(p: MixProgram): string {
  const s = JSON.stringify(p);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---- Checks the website runs before storing ------------------------------------------------

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const within = (x: unknown, lo: number, hi: number): x is number => finite(x) && x >= lo && x <= hi;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const PARAM_RANGE: Record<ParamId, [number, number]> = {
  gain: [0, 1.001],
  low: [-48, 12],
  mid: [-48, 12],
  high: [-48, 12],
  hp: [10, 24000],
  lp: [10, 24000],
};
const DECKS: DeckId[] = ['outEl', 'inEl', 'outLoop', 'inLoop'];

/** Null when the mix is well formed and can't do harm (volume, filters and rates within bounds). */
export function checkMix(mix: unknown, outDur: number, inDur: number): string | null {
  if (!isObj(mix)) return 'mix is not an object';
  if (!['loop', 'blend', 'filter', 'crossfade'].includes(mix.style as string)) return 'bad style';
  if (!within(mix.outSec, 0, outDur)) return 'outSec out of the song';
  if (!within(mix.settleSec, 0, 120)) return 'settleSec out of range';
  if (!within(mix.inEndSec, 0, inDur)) return 'inEndSec out of the song';
  if (!within(mix.handoffSec, 0, mix.settleSec as number)) return 'handoffSec out of range';
  if (mix.reason !== null && (typeof mix.reason !== 'string' || mix.reason.length > 200)) return 'bad reason';
  const p = mix.program;
  if (!isObj(p) || !Array.isArray(p.params) || !Array.isArray(p.transport) || !Array.isArray(p.loops) || !Array.isArray(p.regions)) return 'bad program';
  if (p.params.length > 400 || p.transport.length > 40 || p.loops.length > 800 || p.regions.length > 2) return 'program too long';
  for (const ev of p.params as unknown[]) {
    if (!isObj(ev) || !DECKS.includes(ev.deck as DeckId) || !(ev.param as string in PARAM_RANGE) || !isObj(ev.e)) return 'bad automation event';
    const e = ev.e as Record<string, unknown>;
    const [lo, hi] = PARAM_RANGE[ev.param as ParamId];
    if (!within(e.at, -200, 200)) return 'automation time out of range';
    switch (e.op) {
      case 'cancel':
        break;
      case 'set':
      case 'lin':
      case 'exp':
        if (!within(e.v, lo, hi)) return `${String(ev.param)} value out of range`;
        break;
      case 'target':
        if (!within(e.v, lo, hi) || !within(e.tc, 0.001, 10)) return 'bad target event';
        break;
      case 'curve':
        if (!Array.isArray(e.values) || e.values.length < 2 || e.values.length > 256 || !e.values.every((v) => within(v, lo, hi)) || !within(e.dur, 0.001, 180)) return 'bad curve';
        break;
      default:
        return 'bad automation op';
    }
  }
  for (const t of p.transport as unknown[]) {
    if (!isObj(t) || (t.deck !== 'outEl' && t.deck !== 'inEl') || typeof t.active !== 'boolean') return 'bad transport point';
    const dur = t.deck === 'outEl' ? outDur : inDur;
    if (!within(t.output, -30, 200) || !within(t.input, -2, dur + 1) || !within(t.rate, 0.5, 2)) return 'transport point out of range';
  }
  for (const c of p.loops as unknown[]) {
    if (!isObj(c) || (c.deck !== 'outLoop' && c.deck !== 'inLoop') || typeof c.active !== 'boolean') return 'bad loop change';
    const dur = c.deck === 'outLoop' ? outDur : inDur;
    if (!within(c.output, -30, 200) || !within(c.input, -2, dur + 1) || !within(c.rate, 0.25, 4)) return 'loop change out of range';
    if (c.loop !== null && (!Array.isArray(c.loop) || c.loop.length !== 2 || !within(c.loop[0], 0, dur) || !within(c.loop[1], c.loop[0] as number, dur))) return 'bad loop';
  }
  for (const r of p.regions as unknown[]) {
    if (!isObj(r) || (r.deck !== 'outLoop' && r.deck !== 'inLoop') || (r.side !== 'out' && r.side !== 'in')) return 'bad region';
    const dur = r.side === 'out' ? outDur : inDur;
    if (!within(r.startSec, 0, dur + 1) || !within(r.endSec, r.startSec as number, dur + 1)) return 'region out of the song';
  }
  if (mix.hash !== hashProgram(p as unknown as MixProgram)) return 'hash does not match the program';
  return null;
}

export interface LibrarySong {
  key: string;
  title: string;
  artist: string;
  /** From the downloader when known. */
  durationSec?: number | null;
  loudnessDb?: number | null;
  /** Cover art URL, when the library has one. */
  thumbnail?: string | null;
  /** Album name, when the library has one. */
  album?: string | null;
  /** BitChord's flag: a music video, which Automix's loop mixes skip. */
  musicVideo?: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Null when [next] may replace [current] (null: nothing stored yet) at server
 * time [nowMs]. Accepted: a fresh start when the radio has run out, or the
 * same running order with finished songs dropped from the front and new
 * songs added at the end. Nothing already playing or about to play can be
 * changed: new mixes start at least MIN_MIX_LEAD_MS ahead.
 */
export function checkTimelineChange(current: RadioTimeline | null, next: unknown, nowMs: number, library: Map<string, LibrarySong>): string | null {
  if (!isObj(next)) return 'not an object';
  const tl = next as unknown as RadioTimeline;
  if (tl.version !== TIMELINE_VERSION || tl.repeat !== false) return 'bad version or repeat';
  if (!Array.isArray(tl.items) || !Array.isArray(tl.mixes) || tl.items.length < 1 || tl.items.length > MAX_ITEMS) return 'bad item count';
  if (tl.mixes.length !== tl.items.length - 1) return 'there must be one mix between each two songs';
  if (!within(tl.firstK, 0, Number.MAX_SAFE_INTEGER) || !within(tl.anchorMs, 0, 1e14) || !within(tl.startSec, 0, 1200)) return 'bad anchor';
  if (!isObj(tl.plannedWith) || tl.plannedWith.analysisVersion !== ANALYSIS_VERSION) return 'planned with another analysis version';
  // Songs already lined up were checked when they were added (and must stay
  // identical, below); only new ones are compared with the library, so a song
  // renamed or archived in the admin panel since doesn't block the next write.
  const fresh = !current || endOfTimelineMs(current) < nowMs;
  const newFrom = fresh ? 0 : Math.max(0, current!.items.length - ((tl.firstK as number) - current!.firstK));
  for (const [i, item] of tl.items.entries()) {
    if (!isObj(item)) return 'bad item';
    if (!within(item.durationSec, 1, 1200)) return 'bad duration';
    if (item.loudnessDb !== null && !within(item.loudnessDb, -40, 40)) return 'bad loudness';
    if (i < newFrom) continue;
    const song = library.get(item.key);
    if (!song) return `not in the library: ${String(item.key)}`;
    if (item.title !== song.title || item.artist !== song.artist) return 'title or artist differs from the library';
    if (finite(song.durationSec) && Math.abs(item.durationSec - song.durationSec) > 1.5) return 'duration differs from the library';
    if (finite(song.loudnessDb) && item.loudnessDb !== song.loudnessDb) return 'loudness differs from the library';
  }
  for (let i = 0; i < tl.mixes.length; i++) {
    const err = checkMix(tl.mixes[i], tl.items[i]!.durationSec, tl.items[i + 1]!.durationSec);
    if (err) return `mix ${i}: ${err}`;
    if (i > 0 && tl.mixes[i]!.outSec < tl.mixes[i - 1]!.inEndSec) return `mix ${i} starts before its song has finished mixing in`;
  }
  if (tl.mixes[0] && tl.mixes[0].outSec < tl.startSec) return 'first mix starts before the anchor position';

  if (fresh) {
    if (tl.rev !== (current?.rev ?? 0) + 1) return 'stale revision';
    if (current && tl.firstK <= current.firstK + current.items.length) return 'a fresh start must number its songs after the old ones';
    if (Math.abs(tl.anchorMs - nowMs) > FRESH_START_WINDOW_MS) return 'a fresh start must begin now';
    const t0 = slotAt(tl, tl.firstK)!.mixOut?.t0Ms;
    if (t0 !== undefined && t0 < nowMs + MIN_MIX_LEAD_MS) return 'first mix too soon';
    return null;
  }
  const cur = current!;
  if (tl.rev !== cur.rev + 1) return 'stale revision';
  const r = tl.firstK - cur.firstK;
  if (r < 0 || r > cur.items.length - 1) return 'bad firstK';
  if (r > 0) {
    const kept = slotAt(cur, tl.firstK)!;
    if (kept.soloFromMs > nowMs) return 'dropping a song that is still playing';
    if (Math.abs(tl.anchorMs - kept.soloFromMs) > 0.5 || Math.abs(tl.startSec - kept.soloFromSec) > 1e-6) return 'dropping songs moved the others';
  } else if (tl.anchorMs !== cur.anchorMs || tl.startSec !== cur.startSec) return 'the anchor moved';
  const keptItems = cur.items.length - r;
  const keptMixes = cur.mixes.length - r;
  for (let i = 0; i < keptItems; i++) if (!same(tl.items[i], cur.items[i + r])) return `song ${i} was changed`;
  for (let i = 0; i < keptMixes; i++) if (!same(tl.mixes[i], cur.mixes[i + r])) return `mix ${i} was changed`;
  if (tl.items.length <= keptItems) return 'nothing added';
  for (let i = keptMixes; i < tl.mixes.length; i++) {
    const t0 = slotAt(tl, tl.firstK + i)!.mixOut!.t0Ms;
    if (t0 < nowMs + MIN_MIX_LEAD_MS) return `new mix ${i} starts too soon`;
  }
  return null;
}

/** Null when a shared analysis is well formed (BitChord's TrackAnalysis, this version, this song). */
export function checkAnalysis(a: unknown, key: string, song: LibrarySong | undefined): string | null {
  if (!song) return 'not in the library';
  if (!isObj(a)) return 'not an object';
  if (a.fileKey !== key) return 'fileKey is not this song';
  if (a.analysisVersion !== ANALYSIS_VERSION) return 'wrong analysis version';
  if (!within(a.durationSec, 1, 1200)) return 'bad duration';
  if (finite(song.durationSec) && Math.abs((a.durationSec as number) - song.durationSec) > 1.5) return 'duration differs from the library';
  if (a.bpm !== null && !within(a.bpm, 30, 300)) return 'bad bpm';
  if (!within(a.gridConfidence, 0, 1)) return 'bad grid confidence';
  // everything else: plain JSON of bounded size, every number finite
  let count = 0;
  const walk = (x: unknown, depth: number): boolean => {
    if (depth > 6 || ++count > 60_000) return false;
    if (typeof x === 'number') return Number.isFinite(x);
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return typeof x !== 'string' || x.length < 300;
    if (Array.isArray(x)) return x.every((v) => walk(v, depth + 1));
    if (isObj(x)) return Object.values(x).every((v) => walk(v, depth + 1));
    return false;
  };
  if (!walk(a, 0)) return 'too big or not plain data';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The radio between listeners. Nothing is lined up while nobody listens (the listeners' browsers do the work), but
// the radio is 24/7: pages that only show it (Home's radio row, the Radio page before Listen) show this instead,
// and the first listener's fresh start begins with the same song at the same place, so what the page said is
// what they hear. It is worked out from the library and the clock alone, so every page agrees.

const VIRTUAL_BLOCK_MS = 3_600_000;
const VIRTUAL_NO_REPEAT = 8;
const VIRTUAL_DEFAULT_SEC = 210;

/** A small seeded random generator (mulberry32): the same seed gives the same numbers in every browser. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The song "on air" at [serverMs] when nobody is listening, and how far into it. Null with an empty library. */
export function virtualOnAir(library: LibrarySong[], serverMs: number): { song: LibrarySong; positionSec: number; leftSec: number; next: LibrarySong } | null {
  if (!library.length) return null;
  const songs = [...library].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const block = Math.floor(serverMs / VIRTUAL_BLOCK_MS);
  const rand = seeded(block * 2654435761);
  const recent: string[] = [];
  const draw = () => {
    const pool = songs.filter((s) => !recent.includes(s.key));
    const from = pool.length ? pool : songs;
    const s = from[Math.floor(rand() * from.length)]!;
    recent.push(s.key);
    if (recent.length > Math.min(VIRTUAL_NO_REPEAT, songs.length - 1)) recent.shift();
    return s;
  };
  const len = (s: LibrarySong) => (finite(s.durationSec) && s.durationSec! > 1 ? s.durationSec! : VIRTUAL_DEFAULT_SEC);
  let t = (serverMs - block * VIRTUAL_BLOCK_MS) / 1000;
  let song = draw();
  for (let guard = 0; t >= len(song) && guard < 10_000; guard++) {
    t -= len(song);
    song = draw();
  }
  return { song, positionSec: t, leftSec: len(song) - t, next: draw() };
}
