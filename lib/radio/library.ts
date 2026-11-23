import { and, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioImports, radioPlaylists, radioPlaylistSongs, radioSongs, radioVersions } from "@/db/schema";
import { getSecureRadioSettings } from "@/lib/radio";
import { guessTitleArtist } from "@/lib/radio/metadata";

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
  // How sure title and artist are, and the raw fields behind them (download-api.md; absent on older songs).
  metadataSource?: "tagged" | "topic-channel" | "spotify" | "video" | "ytmusic" | null;
  track?: string | null;
  artists?: string[] | null;
  rawTitle?: string | null;
  channel?: string | null;
  /** BitChord's music-video flag (wide picture); absent on songs stored before the album-audio check. */
  musicVideo?: boolean;
  /** What BitChord's resolveAudio decided for the link (YouTube; absent on older songs). */
  resolve?: AudioResolve | null;
  /** The YouTube Music catalogue row the audio is, when it is one. */
  catalog?: { videoId: string; title: string; artist: string; album: string | null; thumbnail: string | null } | null;
}

/**
 * YouTube Music's square cover for a catalogue song, at 544 px (BitChord's artworkAtPixels:
 * googleusercontent resizes on demand). Null when the song has none.
 */
export function catalogCover(song: Pick<DownloaderSong, "catalog">): string | null {
  const url = song.catalog?.thumbnail;
  if (!url || !url.startsWith("https://")) return null;
  return /googleusercontent\.com|ggpht\.com/.test(url) ? `${url.replace(/=[^/=]*$/, "")}=w544-h544-l90-rj` : url;
}

export type ResolveOutcome = "song" | "official-pair" | "search" | "search-drift" | "no-match" | "lookup-failed";

export interface AudioResolve {
  requestedId: string;
  requestedTitle: string | null;
  requestedArtist: string | null;
  requestedIsVideo: boolean | null;
  outcome: ResolveOutcome;
  query: string | null;
  /** "library-names": found by the second attempt, with our library's names (not BitChord's). */
  via?: string | null;
  /** The names that second attempt searched with, and whether it searched anything. */
  names?: { title: string; artist: string | null } | null;
  namesTried?: boolean;
  error: string | null;
  audioId: string;
  checkedAt: string;
}

/** The audio_check_names value for a song's library title and artist. */
export const audioCheckNamesOf = (title: string, artist: string | null | undefined) => `${title}\n${artist ?? ""}`;

/** The library's audio_check value for a resolveAudio outcome (null: ask again later). */
export function audioCheckOf(resolve: AudioResolve | null | undefined): "album" | "swapped" | "unmatched" | null {
  if (!resolve) return null;
  if (resolve.outcome === "song") return "album";
  if (resolve.outcome === "no-match") return "unmatched";
  if (resolve.outcome === "lookup-failed") return null;
  return resolve.requestedId === resolve.audioId ? "album" : "swapped";
}

/** One line on how a song's audio was found, for the song pane. */
export function audioCheckNote(resolve: AudioResolve | null | undefined): string | null {
  if (!resolve) return null;
  const from = resolve.requestedTitle ? `“${resolve.requestedTitle}”${resolve.requestedArtist ? ` by ${resolve.requestedArtist}` : ""}` : resolve.requestedId;
  switch (resolve.outcome) {
    case "official-pair":
      return `Album version of ${from} (YouTube Music's own pairing)`;
    case "search":
    case "search-drift":
      return `Album version of ${from} (found searching “${resolve.query ?? ""}”${resolve.via === "library-names" ? ", with the library's names" : ""})`;
    case "no-match":
      return `No album version of ${from} on YouTube Music`;
    default:
      return null;
  }
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
  /** What the source says it has, when more than the downloader could list (Spotify: first 100). */
  sourceTotal?: number;
}

export function parseReview(raw: string | null): ReviewState {
  if (!raw) return { open: [], answered: [] };
  try {
    const v = JSON.parse(raw);
    return {
      open: Array.isArray(v?.open) ? v.open : [],
      answered: Array.isArray(v?.answered) ? v.answered : [],
      answeredIds: Array.isArray(v?.answeredIds) ? v.answeredIds : [],
      ...(typeof v?.sourceTotal === "number" ? { sourceTotal: v.sourceTotal } : {}),
    };
  } catch {
    return { open: [], answered: [] };
  }
}

export const FINAL_STATES = ["done", "failed", "cancelled"];

/**
 * radio_imports.state is not one of FINAL_STATES. Same rows as notInArray(state, FINAL_STATES), but written as
 * ranges around the three final values so the database can use radio_imports_state_idx: NOT IN read every
 * import ever made, every minute, to find the (usually zero) open ones.
 */
export function openImportState() {
  const s = radioImports.state;
  return or(lt(s, "cancelled"), and(gt(s, "cancelled"), lt(s, "done")), and(gt(s, "done"), lt(s, "failed")), gt(s, "failed"))!;
}

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

/** The album-audio check of songs already in the library (lib/radio/album-audio.ts). */
export const startRecheck = (db: DbClient, songs: { videoId: string; songId: string; title: string; artist: string }[]) =>
  downloader<{ jobId: string; job: Job }>(db, "/api/download", { method: "POST", body: JSON.stringify({ recheck: songs, meta: { kind: "album-audio-check" } }) });

export const getJob = (db: DbClient, jobId: string) => downloader<{ job: Job }>(db, `/api/download/${encodeURIComponent(jobId)}`);

export const cancelJob = (db: DbClient, jobId: string) =>
  downloader<{ job: Job }>(db, `/api/download/${encodeURIComponent(jobId)}`, { method: "DELETE" });

// ---------- links ----------

/** Playlists, albums and sets: these become a library playlist linked to their source. */
export function linkKind(raw: string): { source: "youtube" | "soundcloud" | "spotify"; collection: boolean; mix?: boolean } | null {
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
    // YouTube's "Mix" / radio lists (list=RD…) are generated without end: they never finish reading.
    if (collection && /^RD/.test(url.searchParams.get("list") || "")) return { source: "youtube", collection, mix: true };
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
  // A plain video's "Artist - Title (Official Video)" by its uploader becomes Title by Artist; the library
  // page then looks the song up in the music catalog for the exact names, album and cover.
  const named = guessTitleArtist({ ...song, durationSec: num(song.durationSec) ?? 0 });
  return {
    id: crypto.randomUUID(),
    r2Key: song.audio.r2Key,
    metaKey: song.metaKey ?? null,
    source: song.source,
    sourceId: song.sourceId ?? null,
    sourceUrl: song.sourceUrl ?? null,
    title: clampText(named.title, 300) || clampText(song.title, 300) || "Untitled",
    artist: clampText(named.artist, 300) || clampText(song.artist, 300) || "Unknown artist",
    album: clampText(song.album, 300) || null,
    releaseYear: num(song.releaseYear),
    durationSec: num(song.durationSec) ?? 0,
    loudnessDb: num(song.loudnessDb),
    thumbnailUrl: catalogCover(song) ?? (typeof song.thumbnail === "string" && song.thumbnail.startsWith("https://") ? song.thumbnail : null),
    spotifyId,
    bytes: num(song.audio.bytes),
    contentType: clampText(song.audio.contentType, 100) || null,
    archived: false,
    musicVideo: song.musicVideo === true,
    metadataSource: song.metadataSource ?? null,
    audioCheck: audioCheckOf(song.resolve),
    audioCheckedAt: song.resolve && audioCheckOf(song.resolve) ? now : null,
    audioCheckNote: audioCheckNote(song.resolve),
    audioCheckNames: song.resolve?.names?.title ? audioCheckNamesOf(song.resolve.names.title, song.resolve.names.artist) : null,
    addedBy: userId,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- duplicates ----------

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/** The main artist: "Kanye West, Lupe Fiasco" -> "kanyewest"; YouTube's "X - Topic" and "XVEVO" channels -> "x". */
function mainArtist(artist: string): string {
  const first = artist.split(/,|&|\s+x\s+|\s+and\s+|\bfeat\.?|\bft\.?|\bfeaturing\b/i)[0] || artist;
  return squash(first.replace(/\s*-\s*topic$/i, "")).replace(/(vevo|official|music)$/, "");
}

/** The song's own name: drops "(Official Music Video)", "[HD]", "feat. …" and a leading "Artist - ". */
function bareTitle(title: string, artist: string): string {
  let t = title
    .replace(/[([][^)\]]*(official|video|audio|lyric|feat|ft\.|with |visuali[sz]er|\bhd\b|\b4k\b|\bhq\b|\bmv\b|remaster)[^)\]]*[)\]]/gi, "")
    .replace(/\s(feat|ft|featuring)\.?\s.*$/i, "");
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash && mainArtist(dash[1]) && (mainArtist(dash[1]) === mainArtist(artist) || squash(artist).startsWith(mainArtist(dash[1])))) t = dash[2];
  return squash(t);
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  spotifyId?: string | null;
}

/** The library song [song] is a copy of: same Spotify track, or same artist and title within 5 s. */
export function findDuplicate<T extends DuplicateCandidate>(song: Omit<DuplicateCandidate, "id">, library: T[]): T | null {
  if (song.spotifyId) {
    const same = library.find((s) => s.spotifyId === song.spotifyId);
    if (same) return same;
  }
  const title = bareTitle(song.title, song.artist);
  const artist = mainArtist(song.artist);
  if (!title) return null;
  return (
    library.find((s) => {
      if (Math.abs(s.durationSec - song.durationSec) > 5) return false;
      if (bareTitle(s.title, s.artist) !== title) return false;
      const a = mainArtist(s.artist);
      return a === artist || (!!a && !!artist && (a.startsWith(artist) || artist.startsWith(a)));
    }) ?? null
  );
}

export async function librarySongsForDuplicates(db: DbClient) {
  return db
    .select({ id: radioSongs.id, r2Key: radioSongs.r2Key, title: radioSongs.title, artist: radioSongs.artist, durationSec: radioSongs.durationSec, spotifyId: radioSongs.spotifyId })
    .from(radioSongs);
}

/**
 * The song ids for [keys] (R2 keys), adding the songs that aren't in the library yet. A song that
 * is already in the library under another file (another upload of the same track, or the Spotify
 * match of a song added from YouTube) isn't added again: its new file is deleted and the library
 * song is used instead.
 */
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
  if (fresh.size) {
    const library: (DuplicateCandidate & { r2Key: string })[] = await librarySongsForDuplicates(db);
    const copies: string[] = [];
    for (const [key, row] of [...fresh]) {
      const same = findDuplicate(row, library);
      if (same) {
        ids.set(key, same.id);
        fresh.delete(key);
        copies.push(key, ...(row.metaKey ? [row.metaKey] : []));
      } else {
        library.push(row);
      }
    }
    const bucket = radioBucket();
    if (bucket && copies.length) await bucket.delete(copies).catch(() => {});
  }
  const rows = [...fresh.values()];
  // 26 columns: D1 allows 100 bound parameters per statement, so 3 rows per insert.
  for (let i = 0; i < rows.length; i += 3) {
    await db.insert(radioSongs).values(rows.slice(i, i + 3)).onConflictDoNothing();
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
  if (typeof job.sourceTotal === "number" && job.total && job.sourceTotal > job.total) reviewState.sourceTotal = job.sourceTotal;
  const review = reviewState.open.length || reviewState.answered.length || reviewState.sourceTotal ? JSON.stringify(reviewState) : null;

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
  const open = await db.select().from(radioImports).where(openImportState());
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
  album: string | null;
  durationSec: number;
  loudnessDb: number | null;
  thumbnail: string | null;
  /** BitChord's flag: a music video, which Automix's loop mixes skip. */
  musicVideo: boolean;
}

const librarySongColumns = {
  key: radioSongs.r2Key,
  title: radioSongs.title,
  artist: radioSongs.artist,
  album: radioSongs.album,
  durationSec: radioSongs.durationSec,
  loudnessDb: radioSongs.loudnessDb,
  thumbnail: radioSongs.thumbnailUrl,
  musicVideo: radioSongs.musicVideo,
};

/** Every song that isn't archived, in the shape the radio engine reads. */
export async function playableSongs(db: DbClient): Promise<LibrarySong[]> {
  const rows = await db
    .select(librarySongColumns)
    .from(radioSongs)
    .where(eq(radioSongs.archived, false))
    .orderBy(radioSongs.createdAt);
  return rows;
}

const PLAYABLE_SNAPSHOT_KEY = "radio/cache/playable-songs.json";

/**
 * playableSongs, read from a snapshot in R2 while the library hasn't changed. The "songs" counter in
 * radio_versions (moved by database triggers on every song add, edit or delete) says whether the snapshot is
 * current: one row read instead of the whole song table. Falls back to the database when R2 or the counter
 * can't be read.
 */
export async function cachedPlayableSongs(db: DbClient): Promise<LibrarySong[]> {
  const bucket = radioBucket();
  const [v] = await db
    .select({ version: radioVersions.version })
    .from(radioVersions)
    .where(eq(radioVersions.name, "songs"))
    .catch(() => [] as { version: number }[]);
  if (!bucket || !v) return playableSongs(db);
  const version = String(v.version);
  try {
    const snap = await bucket.get(PLAYABLE_SNAPSHOT_KEY);
    if (snap && snap.customMetadata?.version === version) return (await snap.json()) as LibrarySong[];
  } catch {}
  const songs = await playableSongs(db);
  await bucket
    .put(PLAYABLE_SNAPSHOT_KEY, JSON.stringify(songs), { httpMetadata: { contentType: "application/json" }, customMetadata: { version } })
    .catch(() => {});
  return songs;
}

/** The library songs for [keys] (for checking a running-order write), archived ones left out. */
export async function songsByKeys(db: DbClient, keys: string[]): Promise<Map<string, LibrarySong>> {
  const out = new Map<string, LibrarySong>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 90) {
    const rows = await db
      .select({ ...librarySongColumns, archived: radioSongs.archived })
      .from(radioSongs)
      .where(inArray(radioSongs.r2Key, unique.slice(i, i + 90)));
    // archived is checked here, not in SQL: with it in the WHERE the database walked the archived index and
    // read the whole song table to find 1 to 4 songs. By key alone it uses the unique r2_key index.
    for (const { archived, ...song } of rows) if (!archived) out.set(song.key, song);
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
