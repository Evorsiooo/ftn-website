// The AutoDJ's next song, picked by the website (Adrien, 2026-11-25), so that nobody can choose what the radio
// plays by sending their own pick. Listeners' browsers still do all the audio work: analysing songs, planning
// and playing the mixes. The website only ranks short summaries (key, tempo, energy), with AutoMix's own
// selector and our rotation rules (lib/radio/rotation.ts), exactly as the browsers' picker does.
//
// When the website stores a running order whose last song is X (number k-1), it also stores the song to
// follow X (number k) as `nextPick`. The browser that plans the mix out of X mixes into that song, and the
// website refuses any other (a show's song excepted: a broadcaster's queue, a playlist show).
//
// Cost (measured 2026-11-25): Cloudflare's free plan gives a request 10 ms of CPU. Ranking 4,000 songs from
// one file took 8 to 11 ms, so the summaries are split into groups of about GROUP_SIZE songs and each pick
// ranks one group, in turn by song number (about 2 ms). The database is asked only about the best few
// candidates and the last few songs (by their unique key: about 30 rows a pick).

import type { DbClient } from "@/db";
import { rankCandidates } from "../../radio-engine/src/bitchord/automix/engine/selector";
import type { TrackAnalysis } from "../../radio-engine/src/bitchord/automix/analysis/types";
import { ANALYSIS_VERSION, playHistory, repeatWindow, seeded, type AnalysisIndex, type AnalysisSummary, type RadioTimeline } from "./autodj";
import { songsByKeys, type LibrarySong } from "./library";
import { ARTIST_GAP, pickTop, rotationFilter } from "./rotation";

export const PICK_META_KEY = "radio/pick/meta.json";
const groupKey = (n: number, g: number) => `radio/pick/${n}-${g}.json`;
const GROUP_SIZE = 1000;
/** Candidates looked up in the database per round (the best of the group, after the no-repeat rule). */
const CANDIDATES = 24;

interface PickMeta {
  analysisVersion: number;
  groups: number;
  /** Songs in the index (on air or not: the database says which are). */
  songs: number;
}
type Group = Record<string, AnalysisSummary>;

/** Which group a song is in: by a hash of its key, so songs stay put as the library grows. */
function groupOf(key: string, groups: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % groups;
}

/** Writes the index in groups (from the every-minute cron, after the index itself changed). */
export async function writePickGroups(bucket: R2Bucket, index: AnalysisIndex): Promise<void> {
  const keys = Object.keys(index.songs).filter((k) => index.songs[k]!.bpm);
  const groups = Math.max(1, Math.round(keys.length / GROUP_SIZE));
  const parts: Group[] = Array.from({ length: groups }, () => ({}));
  for (const k of keys) parts[groupOf(k, groups)]![k] = index.songs[k]!;
  const json = { httpMetadata: { contentType: "application/json" } };
  for (let g = 0; g < groups; g++) await bucket.put(groupKey(groups, g), JSON.stringify(parts[g]), json);
  // the groups first, then the note saying how many there are
  await bucket.put(PICK_META_KEY, JSON.stringify({ analysisVersion: index.analysisVersion, groups, songs: keys.length } satisfies PickMeta), json);
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const obj = await bucket.get(key);
  return obj ? ((await obj.json().catch(() => null)) as T | null) : null;
}

const asAnalysis = (key: string, artist: string, s: AnalysisSummary) => ({ fileKey: key, tags: { artist }, ...s }) as unknown as TrackAnalysis;

/**
 * The song to follow the last song of [tl], or null when there is nothing to pick from (the browser then
 * picks, as before). [known]: songs already looked up (artist, album), to save reads.
 */
export async function serverPick(db: DbClient, bucket: R2Bucket, tl: RadioTimeline, known: Map<string, LibrarySong>): Promise<NonNullable<RadioTimeline["nextPick"]> | null> {
  const meta = await readJson<PickMeta>(bucket, PICK_META_KEY);
  if (!meta || meta.analysisVersion !== ANALYSIS_VERSION || !(meta.groups >= 1)) return null;
  const after = tl.items[tl.items.length - 1]!;
  const k = tl.firstK + tl.items.length;
  const group = (await readJson<Group>(bucket, groupKey(meta.groups, k % meta.groups))) ?? {};
  const history = playHistory(tl);
  // the window as the browsers have it (repeatWindow of the songs on air), from the index's count: a little
  // larger than the songs on air, so never shorter than theirs
  const recent = new Set(history.slice(0, repeatWindow(meta.songs)));
  const rand = seeded(k * 2654435761);

  // what the database knows of the last few songs (artist, album) and, below, of the best candidates
  const info = new Map(known);
  const need = history.slice(0, ARTIST_GAP).filter((key) => !info.has(key));
  if (need.length) for (const [key, s] of await songsByKeys(db, need)) info.set(key, s);

  const keys = Object.keys(group).sort();
  const pool = keys.filter((key) => !recent.has(key) && key !== after.key);
  let order: string[];
  // the song before is analysed (it is in the summaries; a show's song may not be): AutoMix ranks the group
  const own = groupOf(after.key, meta.groups);
  const cur = own === k % meta.groups ? (group[after.key] ?? null) : ((await readJson<Group>(bucket, groupKey(meta.groups, own)))?.[after.key] ?? null);
  if (cur?.bpm) {
    const ranked = rankCandidates(asAnalysis(after.key, after.artist, cur), pool.map((key) => asAnalysis(key, "", group[key]!)), {
      energyDirection: 0,
      recentFileKeys: history,
    });
    order = ranked.map((r) => r.analysis.fileKey);
  } else {
    // nothing to blend from: any song not played lately, in a seeded order
    order = [...pool];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  }

  // the best candidates that are on air, with the artist and album rules, then one of the top 3
  for (let from = 0; from < Math.min(order.length, CANDIDATES * 4); from += CANDIDATES) {
    const batch = order.slice(from, from + CANDIDATES);
    const found = await songsByKeys(db, batch);
    for (const [key, s] of found) info.set(key, s);
    const onAir = batch.filter((key) => found.get(key)?.ready);
    if (!onAir.length) continue;
    const pick = pickTop(rotationFilter(onAir, (x) => x, history, info), rand);
    if (pick) return { k, after: after.key, key: pick };
  }
  return null;
}
