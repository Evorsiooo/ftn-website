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
import { ANALYSIS_INDEX_KEY, AUTODJ_KEY, AUTODJ_WRITE_URL, LIBRARY_URL, analysisKey, analysisWriteUrl, fileUrl } from './config';
import { integratedLufs, YOUTUBE_REFERENCE_LUFS } from './loudness';
import { analyse, decodeForPlan, DEFAULT_BARS, planMix } from './planner';
import { rankCandidates } from '../bitchord/automix/engine/selector';
import {
  ANALYSIS_VERSION,
  checkMix,
  endOfTimelineMs,
  playHistory,
  rebase,
  seeded,
  summarizeAnalysis,
  slotAt,
  slotIndexAt,
  TIMELINE_VERSION,
  type AnalysisIndex,
  type AnalysisSummary,
  type LibrarySong,
  type RadioTimeline,
  type TimelineItem,
  virtualOnAir,
} from './timeline';
import { programPick, type RadioProgram } from './programFile';

/** Songs lined up after the one on air before a listener plans another. */
const LOOKAHEAD = 2;
/** A planned mix starts at least this far past the moment it's sent (the website asks for 20 s). */
const PLAN_MARGIN_MS = 28_000;
/** With an analysis still running, the plain crossfade is sent at the latest this far ahead of its start. */
const FALLBACK_DEADLINE_MS = 45_000;

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
  const r = await fresh(analysisKey(song.key)).catch(() => null);
  if (!r) return null;
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

/**
 * Songs not played again within this many (Adrien, 2026-11-21). Passed to AutoMix's selector as its
 * own excludeFileKeys; the selector's built-in rules (nothing from the last 10, the last 3 artists
 * scored down) apply as they are.
 */
const REPEAT_WINDOW = 200;
/** Every this-many songs is one the selector can't place yet (not analysed, or no tempo found), while there are any. */
const UNPLACED_EVERY = 3;

/** The key, tempo and energy of every shared analysis (empty if the index can't be read). */
async function fetchAnalysisIndex(): Promise<AnalysisIndex['songs']> {
  try {
    const r = await fresh(ANALYSIS_INDEX_KEY);
    if (!r.ok) return {};
    const body = (await r.json()) as AnalysisIndex;
    return body.analysisVersion === ANALYSIS_VERSION ? body.songs : {};
  } catch {
    return {};
  }
}

/** What AutoMix's selector reads of a song: its analysis in short, with the library's title and artist. */
function asAnalysis(song: LibrarySong, s: AnalysisSummary): TrackAnalysis {
  return { fileKey: song.key, tags: { title: song.title, artist: song.artist }, ...s } as unknown as TrackAnalysis;
}

const byKey = (a: LibrarySong, b: LibrarySong) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The AutoDJ's next song, picked the way AutoMix's AutoDJ picks it: AutoMix's selector
 * (engine/selector.ts, verbatim) ranks the analysed library against the song it follows (Camelot
 * key, tempo, energy, recent songs and artists) and the first candidate plays, with AutoMix's
 * default energy direction (steady). Every input comes from the stored running order and the shared
 * index, and ties fall to the song key, so every listener would pick the same song.
 *
 * Songs the selector can't place (not analysed yet, or no tempo found) still get every
 * UNPLACED_EVERY-th place, so new songs are heard and analysed and none is left out for good.
 */
export async function pickNext(library: LibrarySong[], current: RadioTimeline, after: LibrarySong, k: number, log: (s: string) => void): Promise<LibrarySong> {
  const index = await fetchAnalysisIndex();
  const songs = [...library].sort(byKey);
  const history = playHistory(current);
  const recent = new Set(history.slice(0, REPEAT_WINDOW));
  const rand = seeded(k * 2654435761);
  const placeable = (s: LibrarySong) => Boolean(index[s.key]?.bpm);
  const pool = songs.filter(placeable).map((s) => asAnalysis(s, index[s.key]!));
  const unplaced = songs.filter((s) => !placeable(s) && s.key !== after.key);
  const unplacedFresh = unplaced.filter((s) => !recent.has(s.key));

  if (unplacedFresh.length && (pool.length < 2 || k % UNPLACED_EVERY === 0)) {
    const song = unplacedFresh[Math.floor(rand() * unplacedFresh.length)]!;
    log(`next: ${song.title} (not analysed yet: one in ${UNPLACED_EVERY} songs is)`);
    return song;
  }

  // the song it follows: from the index, else its shared analysis (made moments ago, not indexed yet)
  let cur = index[after.key] ?? null;
  if (!cur) cur = summarizeAnalysis(await storedAnalysis(after));
  if (cur?.bpm) {
    const opts = { energyDirection: 0 as const, recentFileKeys: history };
    let ranked = rankCandidates(asAnalysis(after, cur), pool, { ...opts, excludeFileKeys: [...recent] });
    // a library too small for the window: AutoMix's own repeat rules only
    if (!ranked.length) ranked = rankCandidates(asAnalysis(after, cur), pool, opts);
    const best = ranked[0];
    if (best) {
      const song = songs.find((s) => s.key === best.analysis.fileKey)!;
      const r = best.reasons;
      log(`next: ${song.title} (${best.harmonic ? 'harmonic' : 'not harmonic'}, score ${best.score.toFixed(2)}: key ${r.camelot.toFixed(2)}, tempo ${r.bpm.toFixed(2)}, energy ${r.energy.toFixed(2)}, artist ${r.repeat})`);
      return song;
    }
  }

  // nothing to rank against (the song it follows has no tempo) or nothing ranked: as AutoMix starts,
  // any analysed song, here one not played lately
  const notLately = (list: string[]) => list.filter((key) => key !== after.key && !recent.has(key));
  const from = [notLately(pool.map((a) => a.fileKey)), notLately(unplaced.map((s) => s.key)), notLately(songs.map((s) => s.key))].find((l) => l.length)
    ?? songs.map((s) => s.key).filter((key) => key !== after.key);
  const key = from.length ? from[Math.floor(rand() * from.length)]! : after.key;
  const song = songs.find((s) => s.key === key)!;
  log(`next: ${song.title} (no key/tempo match possible)`);
  return song;
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
  program: RadioProgram | null,
  serverNow: () => number,
  post: Post,
  log: (s: string) => void,
): Promise<RadioTimeline | null> {
  if (!current || endOfTimelineMs(current) < serverNow() + 5_000) {
    // nobody was listening: start with the song the pages have been showing, at the same place (virtualOnAir);
    // near its end, a little earlier, so there's time to line up the next one
    const startMs = serverNow() + 1000;
    const v = virtualOnAir(library, startMs)!;
    // a Studio show's queue or a playlist show starts its own song, from the top
    const showKey = programPick(program, startMs, current?.items.map((i) => i.key) ?? [], new Set(library.map((s) => s.key)));
    const showSong = showKey ? library.find((s) => s.key === showKey) : undefined;
    const song = showSong ?? v.song;
    // The library already knows the song's length and loudness (the downloader measured them): then
    // the radio starts at once, without first downloading and decoding the whole file here.
    const known = (song.durationSec ?? 0) > 0 && song.loudnessDb != null;
    const item: TimelineItem = known
      ? { key: song.key, title: song.title, artist: song.artist, durationSec: song.durationSec!, loudnessDb: song.loudnessDb ?? null }
      : await makeItem(song, await decodeForPlan(song.key));
    const anchorMs = Math.round(serverNow() + 1000);
    const from = showSong ? 0 : v.positionSec + (anchorMs - startMs) / 1000;
    const startSec = Math.max(0, Math.min(from, item.durationSec - 75));
    const tl: RadioTimeline = {
      version: TIMELINE_VERSION,
      id: 'autodj',
      rev: (current?.rev ?? 0) + 1,
      firstK: current ? current.firstK + current.items.length + 1 : 0,
      anchorMs,
      startSec: Math.round(startSec * 1000) / 1000,
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
  const recent = current.items.map((i) => i.key);
  // a show's song (the Studio queue, a playlist show) when one is due as this song starts
  const showKey = programPick(program, endOfTimelineMs(current), recent, new Set(library.map((s) => s.key)));
  const next = (showKey && library.find((s) => s.key === showKey)) || (await pickNext(library, current, lastSong, lastK + 1, log));
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
