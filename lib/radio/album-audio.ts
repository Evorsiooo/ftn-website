import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioAudioRechecks, radioReplayParts, radioSongs, radioStudioQueue } from "@/db/schema";
import {
  audioCheckNote,
  audioCheckNamesOf,
  catalogCover,
  DownloaderError,
  getJob,
  radioBucket,
  RUNNING_ORDER_KEYS,
  startRecheck,
  type AudioResolve,
  type DownloaderSong,
  type Job,
} from "@/lib/radio/library";
import { analysisKey, radioDb } from "@/lib/radio/store";

/**
 * The album-audio check of the songs already in the library: BitChord's resolveAudio (in the
 * downloader, euno-radio) asked again for every YouTube song, in batches, from the every-minute
 * cron. A song whose file is a music video gets the album version's file, names and a fresh
 * analysis (a new file has none, so the next listener's browser analyses it); a video with no album
 * version keeps its file and gets BitChord's music-video flag; the rest are marked as checked.
 * Songs added since the downloader did this itself arrive already checked.
 */

const BATCH = 25;
const FINAL = ["done", "failed", "cancelled"];
/** A start the downloader refused (an old VPS, or it's down) is tried again after this. */
const RETRY_START_MS = 60 * 60_000;
/** A song YouTube Music didn't answer for is asked again after this. */
const RETRY_FAILED_MS = 24 * 3_600_000;
/** Replaced files still in use are tried again for deletion this often once everything is checked. */
const RETRY_DELETE_MS = 30 * 60_000;

interface BatchSong {
  id: string;
  key: string;
  videoId: string;
  /** The library's names, for the downloader's second search attempt (older batches have none). */
  title?: string;
  artist?: string;
}

interface RecheckItem {
  index: number;
  state: string;
  outcome?: "swapped" | "song" | "no-match" | "failed";
  song?: DownloaderSong;
  catalog?: { title: string; artist: string; album: string | null; thumbnail: string | null } | null;
  musicVideo?: boolean;
  resolve?: AudioResolve;
  error?: string | null;
}

const parse = <T>(raw: string | null, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Runs one step of the check: follows the open batch, or starts the next one. Null when idle. */
export async function runAlbumAudioCheck(db: DbClient): Promise<Record<string, unknown> | null> {
  const [open] = await db.select().from(radioAudioRechecks).where(notInArray(radioAudioRechecks.state, [...FINAL, "refused"])).limit(1);
  if (open) return followBatch(db, open);

  const [last] = await db.select().from(radioAudioRechecks).orderBy(desc(radioAudioRechecks.createdAt)).limit(1);
  if (last?.state === "refused" && Date.now() - last.updatedAt.getTime() < RETRY_START_MS) return null;

  const retryBefore = new Date(Date.now() - RETRY_FAILED_MS);
  const due = await db
    .select({ id: radioSongs.id, key: radioSongs.r2Key, videoId: radioSongs.sourceId, title: radioSongs.title, artist: radioSongs.artist })
    .from(radioSongs)
    .where(
      and(
        eq(radioSongs.source, "youtube"),
        isNotNull(radioSongs.sourceId),
        or(
          isNull(radioSongs.audioCheck),
          and(eq(radioSongs.audioCheck, "failed"), lt(radioSongs.audioCheckedAt, retryBefore)),
          // kept as a video, and its library names haven't been searched yet (new, or renamed since)
          and(
            eq(radioSongs.audioCheck, "unmatched"),
            or(isNull(radioSongs.audioCheckNames), sql`${radioSongs.audioCheckNames} != ${radioSongs.title} || char(10) || ${radioSongs.artist}`)
          )
        )
      )
    )
    .orderBy(asc(radioSongs.createdAt))
    .limit(BATCH);
  const songs = due.filter((s): s is typeof s & BatchSong & { videoId: string } => !!s.videoId && /^[\w-]{11}$/.test(s.videoId));

  if (!songs.length) {
    // Everything is checked: replaced files that were still in use are tried again now and then.
    const [pending] = await db
      .select({ updatedAt: radioAudioRechecks.updatedAt })
      .from(radioAudioRechecks)
      .where(and(isNotNull(radioAudioRechecks.oldKeys), sql`${radioAudioRechecks.oldKeys} != '[]'`))
      .orderBy(asc(radioAudioRechecks.updatedAt))
      .limit(1);
    if (pending && Date.now() - pending.updatedAt.getTime() > RETRY_DELETE_MS) return { deleted: await deleteReplacedFiles(db) };
    return null;
  }

  const now = new Date();
  try {
    const { jobId, job } = await startRecheck(db, songs.map((s) => ({ videoId: s.videoId, songId: s.id, title: s.title ?? "", artist: s.artist ?? "" })));
    await db.insert(radioAudioRechecks).values({ id: jobId, state: job.state, songs: JSON.stringify(songs), applied: "[]", oldKeys: null, error: null, createdAt: now, updatedAt: now });
    return { started: jobId, songs: songs.length };
  } catch (err: any) {
    const said = err instanceof DownloaderError ? err.message : err?.message || "Could not start the check";
    // an older downloader only knows links
    const error = /url is required/i.test(said) ? "the radio server needs updating (update-radio) before it can check songs" : said;
    await db.insert(radioAudioRechecks).values({ id: `refused-${crypto.randomUUID()}`, state: "refused", songs: JSON.stringify(songs), applied: null, oldKeys: null, error, createdAt: now, updatedAt: now });
    return { refused: error };
  }
}

type BatchRow = typeof radioAudioRechecks.$inferSelect;

async function followBatch(db: DbClient, row: BatchRow): Promise<Record<string, unknown>> {
  let job: Job & { items?: RecheckItem[] };
  try {
    job = (await getJob(db, row.id)).job as Job & { items?: RecheckItem[] };
  } catch (err) {
    if (err instanceof DownloaderError && err.upstream === 404) {
      // the VPS keeps jobs 14 days: songs not written yet are simply asked again in a later batch
      await db.update(radioAudioRechecks).set({ state: "failed", error: "The downloader no longer has this job.", updatedAt: new Date() }).where(eq(radioAudioRechecks.id, row.id));
      return { lost: row.id };
    }
    throw err;
  }
  const songs = parse<BatchSong[]>(row.songs, []);
  const applied = new Set(parse<number[]>(row.applied, []));
  const oldKeys = parse<string[]>(row.oldKeys, []);
  let wrote = 0;
  for (const item of job.items ?? []) {
    if (applied.has(item.index) || (item.state !== "done" && item.state !== "failed")) continue;
    const song = songs[item.index];
    if (song) {
      const replaced = await applyItem(db, song, item);
      if (replaced) oldKeys.push(...replaced);
      wrote += 1;
    }
    applied.add(item.index);
  }
  const final = FINAL.includes(job.state);
  if (!wrote && !final && job.state === row.state) return { following: row.id, done: applied.size };
  await db
    .update(radioAudioRechecks)
    .set({ state: job.state, applied: JSON.stringify([...applied]), oldKeys: oldKeys.length ? JSON.stringify(oldKeys) : null, error: job.error ?? null, updatedAt: new Date() })
    .where(eq(radioAudioRechecks.id, row.id));
  const out: Record<string, unknown> = { following: row.id, done: applied.size, wrote };
  if (final) out.deleted = await deleteReplacedFiles(db);
  return out;
}

/** Writes one song's result. Returns the files it no longer uses (to delete once nothing plays them). */
async function applyItem(db: DbClient, ref: BatchSong, item: RecheckItem): Promise<string[] | null> {
  const [row] = await db.select().from(radioSongs).where(eq(radioSongs.id, ref.id));
  // deleted, or its file changed since the batch started: the next batch looks at it again
  if (!row || row.r2Key !== ref.key) return null;
  const now = new Date();
  const note = audioCheckNote(item.resolve);
  // the names this check searched with: an unmatched song isn't checked again until they change
  const audioCheckNames = ref.title ? audioCheckNamesOf(ref.title, ref.artist) : null;

  if (item.state === "failed" || item.outcome === "failed") {
    await db.update(radioSongs).set({ audioCheck: "failed", audioCheckedAt: now, audioCheckNote: item.error?.slice(0, 300) || null, updatedAt: now }).where(eq(radioSongs.id, row.id));
    return null;
  }

  if (item.outcome === "song") {
    const c = item.catalog;
    await db
      .update(radioSongs)
      .set({
        audioCheck: "album",
        musicVideo: false,
        audioCheckedAt: now,
        audioCheckNote: null,
        ...(c?.title && c.artist ? { title: c.title.slice(0, 300), artist: c.artist.slice(0, 300), album: c.album?.slice(0, 300) || row.album, metadataSource: "ytmusic" } : {}),
        updatedAt: now,
      })
      .where(eq(radioSongs.id, row.id));
    return null;
  }

  if (item.outcome === "no-match") {
    await db
      .update(radioSongs)
      .set({ audioCheck: "unmatched", musicVideo: item.musicVideo === true, audioCheckedAt: now, audioCheckNote: note, audioCheckNames, updatedAt: now })
      .where(eq(radioSongs.id, row.id));
    return null;
  }

  const s = item.song;
  if (item.outcome !== "swapped" || !s?.audio?.r2Key?.startsWith("songs/")) return null;
  const newKey = s.audio.r2Key;
  if (newKey === row.r2Key) {
    await db.update(radioSongs).set({ audioCheck: "album", musicVideo: s.musicVideo === true, audioCheckedAt: now, audioCheckNote: null, updatedAt: now }).where(eq(radioSongs.id, row.id));
    return null;
  }
  const [twin] = await db.select({ id: radioSongs.id, title: radioSongs.title, artist: radioSongs.artist }).from(radioSongs).where(eq(radioSongs.r2Key, newKey));
  if (twin) {
    // The album version is already in the library: this copy is archived (not deleted) and listed.
    await db
      .update(radioSongs)
      .set({ audioCheck: "duplicate", archived: true, audioCheckedAt: now, audioCheckNote: `Its album version is already in the library as “${twin.title}” by ${twin.artist}`.slice(0, 300), updatedAt: now })
      .where(eq(radioSongs.id, row.id));
    return null;
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cover = catalogCover(s);
  await db
    .update(radioSongs)
    .set({
      r2Key: newKey,
      metaKey: s.metaKey ?? null,
      sourceId: s.sourceId ?? null,
      sourceUrl: s.sourceUrl ?? null,
      title: (s.title || row.title).slice(0, 300),
      artist: (s.artist || row.artist).slice(0, 300),
      album: s.album?.slice(0, 300) || null,
      releaseYear: num(s.releaseYear) ?? row.releaseYear,
      durationSec: num(s.durationSec) ?? row.durationSec,
      loudnessDb: num(s.loudnessDb),
      // a square catalogue cover the library already found (iTunes) is kept; otherwise YouTube Music's
      thumbnailUrl: row.thumbnailUrl && /\.mzstatic\.com\//.test(row.thumbnailUrl) ? row.thumbnailUrl : cover ?? row.thumbnailUrl,
      bytes: num(s.audio.bytes),
      contentType: s.audio.contentType ?? null,
      musicVideo: s.musicVideo === true,
      metadataSource: s.metadataSource ?? "ytmusic",
      audioCheck: "swapped",
      audioCheckedAt: now,
      audioCheckNote: note,
      updatedAt: now,
    })
    .where(eq(radioSongs.id, row.id));

  // Ratings, play counts and queued Studio songs follow the song to its new file.
  const d1 = radioDb();
  if (d1) {
    await d1.batch([
      d1.prepare("UPDATE OR IGNORE song_votes SET song_key = ? WHERE song_key = ?").bind(newKey, row.r2Key),
      d1.prepare("UPDATE OR IGNORE stat_song_plays SET song_key = ? WHERE song_key = ?").bind(newKey, row.r2Key),
    ]);
  }
  await db.update(radioStudioQueue).set({ songKey: newKey }).where(and(eq(radioStudioQueue.songKey, row.r2Key), eq(radioStudioQueue.state, "queued")));
  return [row.r2Key, ...(row.metaKey ? [row.metaKey] : [])];
}

/**
 * Deletes the files songs no longer use (the music videos replaced by their album versions, their
 * JSON and analyses), except ones a running order or a replay still plays: those wait for a later try.
 */
async function deleteReplacedFiles(db: DbClient): Promise<number> {
  const bucket = radioBucket();
  if (!bucket) return 0;
  const rows = await db.select().from(radioAudioRechecks).where(and(isNotNull(radioAudioRechecks.oldKeys), sql`${radioAudioRechecks.oldKeys} != '[]'`));
  if (!rows.length) return 0;

  // Every song file a running order or a replay's saved running order plays.
  const inUse = new Set<string>();
  const timelines = await db.select({ key: radioReplayParts.r2Key }).from(radioReplayParts).where(eq(radioReplayParts.kind, "timeline"));
  for (const key of [...RUNNING_ORDER_KEYS, ...timelines.map((t) => t.key).filter((k): k is string => !!k)]) {
    const obj = await bucket.get(key);
    const tl = obj ? ((await obj.json().catch(() => null)) as { items?: { key?: string }[] } | null) : null;
    tl?.items?.forEach((i) => i.key && inUse.add(i.key));
  }
  // and any library song (a file can be shared after a duplicate was archived)
  const allKeys = rows.flatMap((r) => parse<string[]>(r.oldKeys, []));
  const audioKeys = allKeys.filter((k) => !k.endsWith(".json"));
  for (let i = 0; i < audioKeys.length; i += 90) {
    const used = await db.select({ key: radioSongs.r2Key }).from(radioSongs).where(inArray(radioSongs.r2Key, audioKeys.slice(i, i + 90)));
    used.forEach((u) => inUse.add(u.key));
  }

  let deleted = 0;
  for (const row of rows) {
    const keys = parse<string[]>(row.oldKeys, []);
    const keep: string[] = [];
    const drop: string[] = [];
    for (const key of keys) {
      // a song's JSON goes with its audio (songs/youtube/<id>.json next to songs/youtube/<id>.m4a)
      const audio = key.endsWith(".json") ? keys.find((k) => !k.endsWith(".json") && k.replace(/\.[^.]+$/, ".json") === key) : key;
      if (audio && inUse.has(audio)) keep.push(key);
      else drop.push(key, ...(key.endsWith(".json") ? [] : [analysisKey(key)]));
    }
    if (drop.length) {
      await bucket.delete(drop);
      deleted += keys.length - keep.length;
    }
    await db.update(radioAudioRechecks).set({ oldKeys: keep.length ? JSON.stringify(keep) : null, updatedAt: new Date() }).where(eq(radioAudioRechecks.id, row.id));
  }
  return deleted;
}

/** Counts for the library page. */
export async function albumAudioSummary(db: DbClient) {
  const rows = await db
    .select({ check: radioSongs.audioCheck, n: sql<number>`count(*)` })
    .from(radioSongs)
    .where(eq(radioSongs.source, "youtube"))
    .groupBy(radioSongs.audioCheck);
  const [open] = await db.select({ id: radioAudioRechecks.id }).from(radioAudioRechecks).where(notInArray(radioAudioRechecks.state, [...FINAL, "refused"])).limit(1);
  const [last] = await db
    .select({ state: radioAudioRechecks.state, error: radioAudioRechecks.error })
    .from(radioAudioRechecks)
    .orderBy(desc(radioAudioRechecks.updatedAt), desc(radioAudioRechecks.createdAt))
    .limit(1);
  return {
    counts: Object.fromEntries(rows.map((r) => [r.check ?? "unchecked", Number(r.n)])),
    running: !!open,
    refused: last?.state === "refused" ? last.error : null,
  };
}
