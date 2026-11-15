// The 24/7 AutoDJ, run by whichever listeners are on.
//
// - Every listener follows the running order the website stores.
// - When fewer than two songs are lined up after the one on air, a listener
//   picks the next song, makes sure both songs of the new mix are analysed
//   (the shared analysis if someone already did it, otherwise BitChord's
//   analyzer here, then shared), plans the mix with BitChord's Automix and
//   sends the longer running order to the website. The website checks it
//   and stores it only if nobody got there first.
// - Nobody listening: nothing runs. The first listener back starts a fresh
//   running order from "now".
import type { TrackAnalysis } from '../bitchord/automix/analysis/types';
import { AUTODJ_KEY, AUTODJ_WRITE_URL, LIBRARY_URL, analysisKey, analysisWriteUrl, fileUrl } from './config';
import { integratedLufs, YOUTUBE_REFERENCE_LUFS } from './loudness';
import { analyse, decodeForPlan, DEFAULT_BARS, planMix } from './planner';
import {
  ANALYSIS_VERSION,
  checkMix,
  endOfTimelineMs,
  rebase,
  slotAt,
  slotIndexAt,
  TIMELINE_VERSION,
  type LibrarySong,
  type RadioTimeline,
  type TimelineItem,
} from './timeline';

/** Songs lined up after the one on air before a listener plans another. */
const LOOKAHEAD = 2;
/** A planned mix starts at least this far past the moment it's sent (the website asks for 20 s). */
const PLAN_MARGIN_MS = 28_000;
/** With an analysis still running, the plain crossfade is sent at the latest this far ahead of its start. */
const FALLBACK_DEADLINE_MS = 45_000;
/** Songs not repeated within this many places. */
const NO_REPEAT = 3;

/** The songs the AutoDJ may play. Empty: the radio is off air. */
export async function loadLibrary(): Promise<LibrarySong[]> {
  const r = await fetch(LIBRARY_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`library: HTTP ${r.status}`);
  const body = (await r.json()) as LibrarySong[] | { songs: LibrarySong[] };
  return Array.isArray(body) ? body : body.songs;
}

/** No-store fetch of a bucket object; the query keeps any cache in between out of it. */
const fresh = (key: string, init?: RequestInit) => fetch(`${fileUrl(key)}?t=${Date.now()}`, { cache: 'no-store', ...init });

export async function fetchTimeline(): Promise<RadioTimeline | null> {
  const r = await fresh(AUTODJ_KEY);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`running order: HTTP ${r.status}`);
  return (await r.json()) as RadioTimeline;
}

/** The song's analysis if a listener has shared it, else null. */
async function storedAnalysis(song: LibrarySong): Promise<TrackAnalysis | null> {
  const r = await fresh(analysisKey(song.key));
  if (!r.ok) return null;
  const a = (await r.json()) as TrackAnalysis;
  return a.analysisVersion === ANALYSIS_VERSION ? a : null;
}

/**
 * Stands in for an analysis that isn't ready in time: no beat grid, no intro
 * or outro. BitChord's Automix then does what it does for any song without a
 * grid: its plain 12 s crossfade, 12 s before the end.
 */
function notAnalysed(song: LibrarySong, durationSec: number): TrackAnalysis {
  return {
    fileKey: song.key, path: song.key, tags: { title: song.title, artist: song.artist }, durationSec,
    bpm: null, beatIntervalSec: null, firstDownbeatSec: null, gridConfidence: 0,
    camelot: null, keyName: null, keyConfidence: 0, energy: 0, energyCurve: [],
    introEndSec: null, outroStartSec: null, tailGrid: null, analysisVersion: ANALYSIS_VERSION,
  } as unknown as TrackAnalysis;
}

/** The song's analysis: shared by another listener, else made here (BitChord's analyzer) and shared. */
export async function sharedAnalysis(song: LibrarySong, log: (s: string) => void): Promise<TrackAnalysis> {
  const r = await fresh(analysisKey(song.key));
  if (r.ok) {
    const a = (await r.json()) as TrackAnalysis;
    if (a.analysisVersion === ANALYSIS_VERSION) return a;
  }
  const started = performance.now();
  log(`analysing ${song.title} here (nobody has yet)…`);
  const a = await analyse(song.key, song);
  log(`analysed ${song.title} in ${((performance.now() - started) / 1000).toFixed(0)} s; sharing it`);
  const put = await fetch(analysisWriteUrl(song.key), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  if (!put.ok) log(`sharing the analysis was refused: ${await put.text()}`);
  return a;
}

async function makeItem(song: LibrarySong, buffer: AudioBuffer): Promise<TimelineItem> {
  const loudnessDb = song.loudnessDb ?? Math.round((integratedLufs(buffer) - YOUTUBE_REFERENCE_LUFS) * 100) / 100;
  return { key: song.key, title: song.title, artist: song.artist, durationSec: Math.round(buffer.duration * 1e6) / 1e6, loudnessDb };
}

function pick(library: LibrarySong[], recent: string[], prefer?: Set<string>): LibrarySong {
  const fresh = library.filter((s) => !recent.slice(-NO_REPEAT).includes(s.key));
  const pool = fresh.length ? fresh : library;
  const preferred = prefer ? pool.filter((s) => prefer.has(s.key)) : [];
  const from = preferred.length ? preferred : pool;
  return from[Math.floor(Math.random() * from.length)]!;
}

/** Whether this running order needs another song (or a fresh start). */
export function needsWork(tl: RadioTimeline | null, serverNow: number): boolean {
  if (!tl || endOfTimelineMs(tl) < serverNow + 5_000) return true;
  const k = slotIndexAt(tl, serverNow);
  if (k === null) return false; // before its start
  return tl.firstK + tl.items.length - 1 - k < LOOKAHEAD;
}

export type Post = (tl: RadioTimeline) => Promise<{ ok: boolean; error?: string }>;

/**
 * One step: a fresh start, or one more song at the end. Returns what was
 * stored, or null when there was nothing to do or someone else was faster.
 */
export async function extend(
  current: RadioTimeline | null,
  library: LibrarySong[],
  serverNow: () => number,
  post: Post,
  log: (s: string) => void,
): Promise<RadioTimeline | null> {
  if (!current || endOfTimelineMs(current) < serverNow() + 5_000) {
    // nobody was listening: start now, with a song someone has analysed if there is one
    // (a sample of up to 16 songs, so a big library doesn't mean hundreds of requests)
    const analysed = new Set<string>();
    const sample = [...library].sort(() => Math.random() - 0.5).slice(0, 16);
    await Promise.all(sample.map(async (s) => (await fresh(analysisKey(s.key), { method: 'HEAD' })).ok && analysed.add(s.key)));
    const song = pick(library, [], analysed);
    const item = await makeItem(song, await decodeForPlan(song.key));
    const tl: RadioTimeline = {
      version: TIMELINE_VERSION,
      id: 'autodj',
      rev: (current?.rev ?? 0) + 1,
      firstK: current ? current.firstK + current.items.length + 1 : 0,
      anchorMs: Math.round(serverNow() + 1500),
      startSec: 0,
      repeat: false,
      items: [item],
      mixes: [],
      plannedWith: { bars: DEFAULT_BARS, analysisVersion: ANALYSIS_VERSION, engine: 'bitchord-automix@acf219a7' },
    };
    const res = await post(tl);
    log(res.ok ? `started the radio with ${song.title}` : `fresh start refused: ${res.error}`);
    return res.ok ? tl : null;
  }

  const n = current.items.length;
  const lastK = current.firstK + n - 1;
  const lastSlot = slotAt(current, lastK)!;
  const lastSong = library.find((s) => s.key === lastSlot.item.key)!;
  const next = pick(library, current.items.map((i) => i.key));
  log(`lining up ${next.title} after ${lastSong.title}`);
  const [bLast, bNext, storedLast, storedNext] = await Promise.all([
    decodeForPlan(lastSong.key),
    decodeForPlan(next.key),
    storedAnalysis(lastSong),
    storedAnalysis(next),
  ]);
  // A song nobody has analysed yet is analysed here (and shared), but only
  // while there's time: past the deadline the mix is planned without it, as
  // BitChord's plain crossfade, and the analysis carries on for later mixes.
  let aLast = storedLast;
  let aNext = storedNext;
  if (!aLast || !aNext) {
    const crossfadeAt = lastSlot.soloFromMs + (bLast.duration - 12 - lastSlot.soloFromSec) * 1000;
    const deadline = crossfadeAt - FALLBACK_DEADLINE_MS - serverNow();
    const running = Promise.all([aLast ?? sharedAnalysis(lastSong, log), aNext ?? sharedAnalysis(next, log)]);
    running.catch((e) => log(`analysis failed: ${String(e)}`));
    const done = await Promise.race([running, new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, deadline)))]);
    if (done) [aLast, aNext] = done;
    else log('analysis not finished in time: this mix will be a plain crossfade');
  }
  const fromA = aLast ?? notAnalysed(lastSong, bLast.duration);
  const toA = aNext ?? notAnalysed(next, bNext.duration);
  // the mix may start no earlier than the end of the last mix in, and far enough ahead of now
  const earliestMs = serverNow() + PLAN_MARGIN_MS;
  const fromPos = Math.max(lastSlot.soloFromSec, lastSlot.soloFromSec + (earliestMs - lastSlot.soloFromMs) / 1000);
  const mix = planMix(fromA, toA, bLast, bNext, fromPos, current.plannedWith.bars);
  if (!aLast || !aNext) mix.reason = 'not analysed in time';
  const item = await makeItem(next, bNext);
  const problem = checkMix(mix, lastSlot.item.durationSec, item.durationSec);
  if (problem) {
    log(`no mix possible (${problem}); the song will play out`);
    return null;
  }
  // drop songs that are over (keep the one before the song on air, for listeners mid-mix)
  const onAir = slotIndexAt(current, serverNow()) ?? current.firstK;
  const r = Math.max(0, onAir - 1 - current.firstK);
  const longer: RadioTimeline = { ...current, rev: current.rev + 1, items: [...current.items, item], mixes: [...current.mixes, mix] };
  const tl = rebase(longer, r);
  const res = await post(tl);
  log(res.ok ? `lined up ${next.title} (${mix.style}${mix.reason ? `, ${mix.reason}` : ''})` : `not stored: ${res.error}`);
  return res.ok ? tl : null;
}
