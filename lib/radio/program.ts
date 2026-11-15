import { and, asc, eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioPlaylistSongs, radioShows, radioSongs, radioStudioPeople, radioStudioQueue, radioStudioSessions } from "@/db/schema";
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

/** The radio airings from 6 hours ago to 36 hours ahead, with what each plays. */
export async function programAirings(db: DbClient, now = Date.now()): Promise<ProgramAiring[]> {
  const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
  const occ = expandOccurrences(shows, broadcasts.filter((b) => b.onRadio), new Date(now - 6 * HOUR), new Date(now + 36 * HOUR), false);
  const lists = new Map<string, string[]>();
  const out: ProgramAiring[] = [];
  for (const o of occ) {
    const a: ProgramAiring = { id: `${o.broadcastId}:${o.start.getTime()}`, start: o.start.getTime(), end: o.end.getTime(), plays: o.plays, title: o.title, art: o.artUrl };
    if (o.plays === "playlist" && o.playlistId) {
      if (!lists.has(o.playlistId)) lists.set(o.playlistId, await playlistKeys(db, o.playlistId));
      a.playlist = lists.get(o.playlistId);
    }
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
  const [people, queue, show] = await Promise.all([
    db.select().from(radioStudioPeople).where(and(eq(radioStudioPeople.sessionId, s.id), eq(radioStudioPeople.state, "on_air"))).orderBy(asc(radioStudioPeople.joinedAt)),
    db.select({ key: radioStudioQueue.songKey }).from(radioStudioQueue).where(and(eq(radioStudioQueue.sessionId, s.id), eq(radioStudioQueue.state, "queued"))).orderBy(asc(radioStudioQueue.position)),
    s.showId ? db.select({ art: radioShows.artUrl }).from(radioShows).where(eq(radioShows.id, s.showId)) : Promise.resolve([]),
  ]);
  return {
    id: s.id,
    title: s.title,
    art: show[0]?.art ?? null,
    callIn: s.callIn,
    pausedAt: s.pausedAt ? s.pausedAt.getTime() : null,
    queue: queue.map((q) => q.key).filter((k): k is string => !!k),
    voices: people.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role, session: p.rtcSession, track: p.track })),
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
