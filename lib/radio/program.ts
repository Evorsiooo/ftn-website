import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioPlaylistSongs, radioReplays, radioShows, radioSongs, radioStudioPeople, radioStudioQueue, radioStudioSessions, radioVersions } from "@/db/schema";
import { expandOccurrences, loadShowsAndBroadcasts } from "@/lib/schedule";
import { PROGRAM_KEY, type ProgramAiring, type ProgramStudio, type RadioProgram } from "./program-types";
import { radioBucket } from "./store";

export * from "./program-types";

const HOUR = 3600_000;

async function playlistKeys(db: DbClient, playlistId: string): Promise<string[]> {
  const rows = await db
    .select({ key: radioSongs.r2Key })
    .from(radioPlaylistSongs)
    .innerJoin(radioSongs, eq(radioSongs.id, radioPlaylistSongs.songId))
    .where(and(eq(radioPlaylistSongs.playlistId, playlistId), eq(radioSongs.archived, false)))
    .orderBy(asc(radioPlaylistSongs.position));
  return rows.map((r) => r.key);
}

const PLAYLIST_CACHE_KEY = "radio/cache/program-playlists.json";
/** While only the songs changed (an import adds one every few seconds), a cached playlist is re-read at most this often. */
const SONGS_CHANGE_REREAD_MS = 10 * 60_000;

interface PlaylistCache {
  /** radio_versions "playlists" and "songs" when each list was read. */
  lists: Record<string, { playlists: number; songs: number; readAt: number; keys: string[] }>;
}

/**
 * playlistKeys for the playlist shows on the program, kept in R2. The program is rebuilt every minute and
 * used to read every song of each playlist show each time (1.29M rows on 24 Nov 2026 for one 416-song show).
 * A list is read again when a playlist's songs change (the "playlists" counter, migration 0035), or at most
 * every 10 minutes while only the library changes (archived songs, album-audio swaps).
 */
async function cachedPlaylistKeys(db: DbClient, ids: string[], now: number): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const bucket = radioBucket();
  const versions = await db
    .select({ name: radioVersions.name, version: radioVersions.version })
    .from(radioVersions)
    .where(inArray(radioVersions.name, ["playlists", "songs"]))
    .catch(() => [] as { name: string; version: number }[]);
  const pv = versions.find((v) => v.name === "playlists")?.version;
  const sv = versions.find((v) => v.name === "songs")?.version;
  if (!bucket || pv === undefined || sv === undefined) {
    for (const id of ids) out.set(id, await playlistKeys(db, id));
    return out;
  }
  let cache: PlaylistCache = { lists: {} };
  try {
    const obj = await bucket.get(PLAYLIST_CACHE_KEY);
    const body = obj ? ((await obj.json()) as PlaylistCache) : null;
    if (body?.lists) cache = body;
  } catch {}
  let wrote = false;
  const lists: PlaylistCache["lists"] = {};
  for (const id of ids) {
    const c = cache.lists[id];
    const fresh = c && c.playlists === pv && (c.songs === sv || now - c.readAt < SONGS_CHANGE_REREAD_MS);
    lists[id] = fresh ? c : { playlists: pv, songs: sv, readAt: now, keys: await playlistKeys(db, id) };
    if (!fresh) wrote = true;
    out.set(id, lists[id].keys);
  }
  // playlists no longer on the program leave the cache
  if (Object.keys(cache.lists).some((id) => !(id in lists))) wrote = true;
  if (wrote) await bucket.put(PLAYLIST_CACHE_KEY, JSON.stringify({ lists }), { httpMetadata: { contentType: "application/json" } }).catch(() => {});
  return out;
}

/** The radio airings from 6 hours ago to 36 hours ahead, with what each plays. */
export async function programAirings(db: DbClient, now = Date.now()): Promise<ProgramAiring[]> {
  const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
  const occ = expandOccurrences(shows, broadcasts.filter((b) => b.onRadio), new Date(now - 6 * HOUR), new Date(now + 36 * HOUR), false);
  const lists = await cachedPlaylistKeys(db, [...new Set(occ.filter((o) => o.plays === "playlist" && o.playlistId).map((o) => o.playlistId!))], now);
  const out: ProgramAiring[] = [];
  for (const o of occ) {
    const a: ProgramAiring = { id: `${o.broadcastId}:${o.start.getTime()}`, start: o.start.getTime(), end: o.end.getTime(), plays: o.plays, title: o.title, art: o.artUrl };
    if (o.plays === "playlist" && o.playlistId) a.playlist = lists.get(o.playlistId);
    if (o.plays === "stream" && o.streamUrl) a.stream = o.streamUrl;
    out.push(a);
  }
  return out;
}

export async function liveStudio(db: DbClient) {
  const [s] = await db.select().from(radioStudioSessions).where(eq(radioStudioSessions.state, "live")).limit(1);
  return s ?? null;
}

export async function programStudio(db: DbClient): Promise<ProgramStudio | null> {
  const s = await liveStudio(db);
  if (!s) return null;
  const [people, queue, show, replay] = await Promise.all([
    db.select().from(radioStudioPeople).where(and(eq(radioStudioPeople.sessionId, s.id), eq(radioStudioPeople.state, "on_air"))).orderBy(asc(radioStudioPeople.joinedAt)),
    db.select({ key: radioStudioQueue.songKey }).from(radioStudioQueue).where(and(eq(radioStudioQueue.sessionId, s.id), eq(radioStudioQueue.state, "queued"))).orderBy(asc(radioStudioQueue.position)),
    s.showId ? db.select({ art: radioShows.artUrl }).from(radioShows).where(eq(radioShows.id, s.showId)) : Promise.resolve([]),
    // a one-time broadcast's logo is kept on its replay
    !s.showId && s.replayId ? db.select({ art: radioReplays.artUrl }).from(radioReplays).where(eq(radioReplays.id, s.replayId)) : Promise.resolve([]),
  ]);
  return {
    id: s.id,
    title: s.title,
    art: show[0]?.art ?? replay[0]?.art ?? null,
    callIn: s.callIn,
    pausedAt: s.pausedAt ? s.pausedAt.getTime() : null,
    queue: queue.map((q) => q.key).filter((k): k is string => !!k),
    voices: people.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role, session: p.rtcSession, track: p.track, gain: p.gain })),
  };
}

/**
 * Writes radio/program.json when it changed. Called after every Studio action and schedule edit,
 * and by the every-minute cron (airings roll forward, stale people are dropped).
 */
export async function publishProgram(db: DbClient): Promise<RadioProgram | null> {
  const bucket = radioBucket();
  if (!bucket) return null;
  const [airings, studio] = await Promise.all([programAirings(db), programStudio(db)]);
  const next: RadioProgram = { updatedAt: Date.now(), airings, studio };
  const stored = await bucket.get(PROGRAM_KEY);
  const current = stored ? ((await stored.json().catch(() => null)) as RadioProgram | null) : null;
  const same = current && JSON.stringify({ ...current, updatedAt: 0 }) === JSON.stringify({ ...next, updatedAt: 0 });
  if (same) return current;
  await bucket.put(PROGRAM_KEY, JSON.stringify(next), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  return next;
}

/** Publishes, logging instead of failing the action that triggered it. */
export async function republish(db: DbClient): Promise<void> {
  try {
    await publishProgram(db);
  } catch (err) {
    console.error("radio: couldn't publish the program", err);
  }
}
