import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioImports, radioPlaylists, radioPlaylistSongs, radioSongs } from "@/db/schema";
import { getSecureRadioSettings } from "@/lib/radio";

/**
 * The radio's song library. Songs come from the VPS downloader (euno-radio, spec
 * plans/radio/download-api.md), which only downloads into the ftn-radio R2 bucket; the website
 * records what it reports. The downloader lives on the same host as the password rotation
 * endpoint and takes the same token, so no new setting is needed.
 */

export function radioBucket(): R2Bucket | null {
  return (process.env as unknown as { ftn_radio?: R2Bucket }).ftn_radio ?? null;
}

// ---------- downloader API ----------

export interface DownloaderSong {
  source: "youtube" | "soundcloud";
  sourceId: string;
  sourceUrl: string;
  title: string;
  artist: string;
  album?: string | null;
  releaseYear?: number | null;
  durationSec: number;
  thumbnail?: string | null;
  loudnessDb?: number | null;
  audio: { r2Key: string; bytes?: number; contentType?: string };
  metaKey?: string;
}

export interface Candidate {
  videoId?: string;
  url: string;
  title: string;
  artists?: string[];
  album?: string | null;
  durationSec?: number;
  kind?: string;
  score?: number;
}

export interface SpotifyTrack {
  spotifyId: string;
  title: string;
  artists: string[];
  durationMs?: number;
  explicit?: boolean;
}

export interface JobItem {
  index: number;
  state: string;
  url?: string;
  spotify?: SpotifyTrack;
  candidates?: Candidate[];
  song?: DownloaderSong;
  error?: string | null;
}

export interface Job {
  id: string;
  state: "queued" | "expanding" | "running" | "done" | "failed" | "cancelled";
  url: string;
  source: string;
  meta: unknown;
  title: string | null;
  total: number;
  sourceTotal?: number;
  counts: Record<string, number>;
  error: string | null;
  items?: JobItem[];
}

/** One Spotify track waiting for someone to pick a match (or skip it). */
export interface ReviewItem {
  index: number;
  spotify: SpotifyTrack | null;
  candidates: Candidate[];
}

export interface ReviewState {
  open: ReviewItem[];
  answered: number[];
  /** Spotify ids picked or skipped, so a re-sync of the playlist doesn't ask about them again. */
  answeredIds?: string[];
}

export function parseReview(raw: string | null): ReviewState {
  if (!raw) return { open: [], answered: [] };
  try {
    const v = JSON.parse(raw);
    return {
      open: Array.isArray(v?.open) ? v.open : [],
      answered: Array.isArray(v?.answered) ? v.answered : [],
      answeredIds: Array.isArray(v?.answeredIds) ? v.answeredIds : [],
    };
  } catch {
    return { open: [], answered: [] };
  }
}

export const FINAL_STATES = ["done", "failed", "cancelled"];

export class DownloaderError extends Error {
  constructor(message: string, readonly status = 502, readonly upstream = 0) {
    super(message);
  }
}

async function downloaderTarget(db: DbClient): Promise<{ base: string; token: string }> {
  const secure = await getSecureRadioSettings(db);
  if (!secure.rotationEndpointUrl || !secure.rotationEndpointToken) {
    throw new DownloaderError("The song downloader isn't set up: add the password rotation endpoint and token in Settings, Connections.", 503);
  }
  let base: string;
  try {
    base = new URL(secure.rotationEndpointUrl).origin;
  } catch {
    throw new DownloaderError("The password rotation endpoint in Settings, Connections isn't a valid URL.", 503);
  }
  return { base, token: secure.rotationEndpointToken };
}

async function downloader<T>(db: DbClient, path: string, init: RequestInit = {}): Promise<T> {
  const { base, token } = await downloaderTarget(db);
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: any) {
    throw new DownloaderError(`Could not reach the song downloader: ${err?.message || "request failed"}`);
  }
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    if (res.status === 404 && !body) throw new DownloaderError("The song downloader refused the request (wrong token, or the VPS isn't updated).");
    throw new DownloaderError(body?.error || `The song downloader answered ${res.status}`, res.status === 400 ? 400 : 502, res.status);
  }
  return body as T;
}

export const startJob = (db: DbClient, url: string, meta: unknown) =>
  downloader<{ jobId: string; job: Job }>(db, "/api/download", { method: "POST", body: JSON.stringify({ url, meta }) });

export const getJob = (db: DbClient, jobId: string) => downloader<{ job: Job }>(db, `/api/download/${encodeURIComponent(jobId)}`);

export const cancelJob = (db: DbClient, jobId: string) =>
  downloader<{ job: Job }>(db, `/api/download/${encodeURIComponent(jobId)}`, { method: "DELETE" });

// ---------- links ----------

/** Playlists, albums and sets: these become a library playlist linked to their source. */
export function linkKind(raw: string): { source: "youtube" | "soundcloud" | "spotify"; collection: boolean } | null {
  let url: URL;
  const value = raw.trim();
  if (/^spotify:(track|album|playlist):/i.test(value)) return { source: "spotify", collection: !/^spotify:track:/i.test(value) };
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtube.com" || host === "youtu.be") {
    const collection = url.pathname === "/playlist" || url.pathname.startsWith("/browse/");
    return { source: "youtube", collection };
  }
  if (host === "soundcloud.com" || host === "on.soundcloud.com") return { source: "soundcloud", collection: url.pathname.includes("/sets/") };
  if (host === "open.spotify.com") return { source: "spotify", collection: /\/(album|playlist)\//.test(url.pathname) };
  return null;
}

// ---------- recording a job's results ----------

const clampText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function songRow(song: DownloaderSong, spotifyId: string | null, userId: string | null) {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    r2Key: song.audio.r2Key,
    metaKey: song.metaKey ?? null,
    source: song.source,
    sourceId: song.sourceId ?? null,
    sourceUrl: song.sourceUrl ?? null,
    title: clampText(song.title, 300) || "Untitled",
    artist: clampText(song.artist, 300) || "Unknown artist",
    album: clampText(song.album, 300) || null,
    releaseYear: num(song.releaseYear),
    durationSec: num(song.durationSec) ?? 0,
    loudnessDb: num(song.loudnessDb),
    thumbnailUrl: typeof song.thumbnail === "string" && song.thumbnail.startsWith("https://") ? song.thumbnail : null,
    spotifyId,
    bytes: num(song.audio.bytes),
    contentType: clampText(song.audio.contentType, 100) || null,
    archived: false,
    addedBy: userId,
    createdAt: now,
    updatedAt: now,
  };
}

/** The song ids for [keys] (R2 keys), adding the songs that aren't in the library yet. */
async function recordSongs(db: DbClient, items: JobItem[], userId: string | null): Promise<Map<string, string>> {
  const songs = items.filter((i) => i.song?.audio?.r2Key?.startsWith("songs/"));
  const keys = [...new Set(songs.map((i) => i.song!.audio.r2Key))];
  const ids = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 90) {
    const rows = await db.select({ id: radioSongs.id, r2Key: radioSongs.r2Key }).from(radioSongs).where(inArray(radioSongs.r2Key, keys.slice(i, i + 90)));
    rows.forEach((r) => ids.set(r.r2Key, r.id));
  }
  const fresh = new Map<string, ReturnType<typeof songRow>>();
  for (const item of songs) {
    const key = item.song!.audio.r2Key;
    if (ids.has(key) || fresh.has(key)) continue;
    fresh.set(key, songRow(item.song!, item.spotify?.spotifyId ?? null, userId));
  }
  const rows = [...fresh.values()];
  // 21 columns: D1 allows 100 bound parameters per statement, so 4 rows per insert.
  for (let i = 0; i < rows.length; i += 4) {
    await db.insert(radioSongs).values(rows.slice(i, i + 4)).onConflictDoNothing();
  }
  if (rows.length) {
    const back = await db.select({ id: radioSongs.id, r2Key: radioSongs.r2Key }).from(radioSongs).where(inArray(radioSongs.r2Key, rows.map((r) => r.r2Key)));
    back.forEach((r) => ids.set(r.r2Key, r.id));
  }
  return ids;
}

/** Puts [entries] (song id, position) in [playlistId], moving songs already there to their new place. */
async function placeInPlaylist(db: DbClient, playlistId: string, entries: { songId: string; position: number }[]) {
  if (!entries.length) return;
  const existing = await db
    .select({ songId: radioPlaylistSongs.songId, position: radioPlaylistSongs.position })
    .from(radioPlaylistSongs)
    .where(eq(radioPlaylistSongs.playlistId, playlistId));
  const at = new Map(existing.map((e) => [e.songId, e.position]));
  for (const e of entries) {
    if (at.get(e.songId) === e.position) continue;
    await db
      .insert(radioPlaylistSongs)
      .values({ playlistId, songId: e.songId, position: e.position })
      .onConflictDoUpdate({ target: [radioPlaylistSongs.playlistId, radioPlaylistSongs.songId], set: { position: e.position } });
  }
}

type ImportRow = typeof radioImports.$inferSelect;

/**
 * Brings one import up to date with its downloader job: adds the songs it has finished, puts
 * them in its playlist, and keeps the counts and the review list. Writes only what changed.
 */
export async function syncImport(db: DbClient, row: ImportRow): Promise<ImportRow> {
  let job: Job;
  try {
    job = (await getJob(db, row.id)).job;
  } catch (err) {
    if (err instanceof DownloaderError && err.upstream === 404) {
      // the VPS keeps jobs 14 days; one it no longer has can't finish
      const patch = { state: "failed", error: "The downloader no longer has this job.", updatedAt: new Date() };
      await db.update(radioImports).set(patch).where(eq(radioImports.id, row.id));
      return { ...row, ...patch };
    }
    throw err;
  }
  const items = job.items ?? [];
  const done = items.filter((i) => i.state === "done" && i.song);
  const ids = await recordSongs(db, done, row.createdBy);

  if (row.playlistId) {
    const entries = done
      .map((i) => ({ songId: ids.get(i.song!.audio.r2Key), position: row.position ?? i.index }))
      .filter((e): e is { songId: string; position: number } => Boolean(e.songId));
    await placeInPlaylist(db, row.playlistId, entries);
  }

  // Review: items someone hasn't answered yet, plus new ones; answered ones are remembered so the
  // job (which keeps saying needs_review) doesn't bring them back.
  const reviewState = parseReview(row.review);
  const known = new Set([...reviewState.open.map((r) => r.index), ...reviewState.answered]);
  const fresh = items.filter((i) => i.state === "needs_review" && !known.has(i.index));
  // Tracks of this playlist already asked about in an earlier import (open or answered) aren't asked again.
  const askedBefore = new Set<string>();
  if (fresh.length && row.playlistId) {
    const others = await db.select({ id: radioImports.id, review: radioImports.review }).from(radioImports).where(eq(radioImports.playlistId, row.playlistId));
    for (const o of others) {
      if (o.id === row.id) continue;
      const r = parseReview(o.review);
      r.open.forEach((x) => x.spotify?.spotifyId && askedBefore.add(x.spotify.spotifyId));
      r.answeredIds?.forEach((x) => askedBefore.add(x));
    }
  }
  for (const i of fresh) {
    if (i.spotify?.spotifyId && askedBefore.has(i.spotify.spotifyId)) {
      reviewState.answered.push(i.index);
      continue;
    }
    {
      reviewState.open.push({ index: i.index, spotify: i.spotify ?? null, candidates: (i.candidates ?? []).slice(0, 3) });
    }
  }
  const review = reviewState.open.length || reviewState.answered.length ? JSON.stringify(reviewState) : null;

  const next = {
    state: job.state,
    title: job.title ?? row.title,
    total: job.total ?? row.total,
    done: job.counts?.done ?? done.length,
    failed: job.counts?.failed ?? 0,
    review,
    error: job.error ?? null,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== row[k]);
  if (!changed) return row;
  const patch = { ...next, updatedAt: new Date() };
  await db.update(radioImports).set(patch).where(eq(radioImports.id, row.id));

  // A linked playlist takes its source's name as soon as the downloader knows it (until then it is
  // named after the link), and records when an import of it finished.
  if (row.playlistId && row.position == null) {
    const set: Partial<typeof radioPlaylists.$inferInsert> = {};
    if (job.title) {
      const [pl] = await db.select({ name: radioPlaylists.name, sourceUrl: radioPlaylists.sourceUrl }).from(radioPlaylists).where(eq(radioPlaylists.id, row.playlistId));
      if (pl && pl.name === pl.sourceUrl) set.name = job.title.slice(0, 200);
    }
    if (FINAL_STATES.includes(job.state)) set.lastSyncedAt = new Date();
    if (Object.keys(set).length) await db.update(radioPlaylists).set({ ...set, updatedAt: new Date() }).where(eq(radioPlaylists.id, row.playlistId));
  }
  return { ...row, ...patch };
}

/** Follows every unfinished import (the Library page while it's open, and the every-minute cron). */
export async function syncOpenImports(db: DbClient): Promise<{ checked: number; errors: string[] }> {
  const open = await db.select().from(radioImports).where(notInArray(radioImports.state, FINAL_STATES));
  const errors: string[] = [];
  for (const row of open) {
    try {
      await syncImport(db, row);
    } catch (err: any) {
      errors.push(`${row.id}: ${err?.message || "sync failed"}`);
    }
  }
  return { checked: open.length, errors };
}

// ---------- the songs the AutoDJ may play ----------

export interface LibrarySong {
  key: string;
  title: string;
  artist: string;
  durationSec: number;
  loudnessDb: number | null;
  thumbnail: string | null;
}

/** Every song that isn't archived, in the shape the radio engine reads. */
export async function playableSongs(db: DbClient): Promise<LibrarySong[]> {
  const rows = await db
    .select({ key: radioSongs.r2Key, title: radioSongs.title, artist: radioSongs.artist, durationSec: radioSongs.durationSec, loudnessDb: radioSongs.loudnessDb, thumbnail: radioSongs.thumbnailUrl })
    .from(radioSongs)
    .where(eq(radioSongs.archived, false))
    .orderBy(radioSongs.createdAt);
  return rows;
}

/** The library songs for [keys] (for checking a running-order write), archived ones left out. */
export async function songsByKeys(db: DbClient, keys: string[]): Promise<Map<string, LibrarySong>> {
  const out = new Map<string, LibrarySong>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 90) {
    const rows = await db
      .select({ key: radioSongs.r2Key, title: radioSongs.title, artist: radioSongs.artist, durationSec: radioSongs.durationSec, loudnessDb: radioSongs.loudnessDb, thumbnail: radioSongs.thumbnailUrl })
      .from(radioSongs)
      .where(and(inArray(radioSongs.r2Key, unique.slice(i, i + 90)), eq(radioSongs.archived, false)));
    rows.forEach((r) => out.set(r.key, r));
  }
  return out;
}

/** Position after the last song of [playlistId]. */
export async function nextPosition(db: DbClient, playlistId: string): Promise<number> {
  const [r] = await db
    .select({ max: sql<number | null>`max(${radioPlaylistSongs.position})` })
    .from(radioPlaylistSongs)
    .where(eq(radioPlaylistSongs.playlistId, playlistId));
  return r?.max == null ? 0 : Number(r.max) + 1;
}

// ---------- shared by the admin routes ----------

/**
 * The radio engine's running orders in R2. A song lined up in one can't be deleted (listeners
 * would hit a missing file mid-song); archive it first and delete it once it has played.
 */
export const RUNNING_ORDER_KEYS = ["radio/autodj.json"];

export async function isLinedUp(bucket: R2Bucket, r2Key: string): Promise<boolean> {
  for (const key of RUNNING_ORDER_KEYS) {
    const obj = await bucket.get(key);
    if (!obj) continue;
    const timeline = (await obj.json().catch(() => null)) as { items?: { key?: string }[] } | null;
    if (timeline?.items?.some((i) => i.key === r2Key)) return true;
  }
  return false;
}
