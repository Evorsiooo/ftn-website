import { and, asc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import type { RobloxUser } from "@/lib/auth";
import {
  radioImports,
  radioReplayParts,
  radioReplays,
  radioShows,
  radioSongs,
  radioStudioPeople,
  radioStudioQueue,
  radioStudioSessions,
} from "@/db/schema";
import { endOfTimelineMs, nowPlaying, type RadioTimeline } from "./autodj";
import { FINAL_STATES, getJob, linkKind, startJob, syncImport } from "./library";
import { liveStudio, republish, type RadioProgram } from "./program";
import { AUTODJ_KEY, radioBucket } from "./store";

/** People on air at once: broadcasters and callers together (Adrien: 4). */
export const ON_AIR_CAP = 4;
/** Someone whose page hasn't checked in for this long has left. */
export const STALE_MS = 45_000;
/** The longest a show runs (from its start) once nobody is left running it. */
const UNATTENDED_MAX_MS = 6 * 3600_000;
/** Check-ins are written at most this often per person. */
const SEEN_WRITE_MS = 15_000;

export type Session = typeof radioStudioSessions.$inferSelect;
export type Person = typeof radioStudioPeople.$inferSelect;

export class StudioError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const isBroadcaster = (p: Person) => p.role === "host" || p.role === "cohost";

async function people(db: DbClient, sessionId: string): Promise<Person[]> {
  return db.select().from(radioStudioPeople).where(and(eq(radioStudioPeople.sessionId, sessionId), ne(radioStudioPeople.state, "left"))).orderBy(asc(radioStudioPeople.joinedAt));
}

async function storedTimeline(): Promise<RadioTimeline | null> {
  const obj = await radioBucket()?.get(AUTODJ_KEY);
  return obj ? ((await obj.json().catch(() => null)) as RadioTimeline | null) : null;
}

// ---- Replays --------------------------------------------------------------------------------------

/** Keeps a copy of a running order that played during a replay's show (one per revision). */
export async function saveTimelinePart(db: DbClient, replayId: string, tl: RadioTimeline): Promise<void> {
  const bucket = radioBucket();
  if (!bucket) return;
  const key = `replays/${replayId}/tl-${tl.rev}.json`;
  await bucket.put(key, JSON.stringify(tl), { httpMetadata: { contentType: "application/json" } });
  await db.insert(radioReplayParts).values({ replayId, kind: "timeline", r2Key: key, startMs: tl.anchorMs, endMs: Number.isFinite(endOfTimelineMs(tl)) ? endOfTimelineMs(tl) : null });
}

/** The replays recording right now: the live Studio show's, and the playlist show on air. */
export async function recordingReplays(db: DbClient, now = Date.now()): Promise<string[]> {
  const ids: string[] = [];
  const s = await liveStudio(db);
  if (s?.replayId) ids.push(s.replayId);
  const rows = await db
    .select({ id: radioReplays.id })
    .from(radioReplays)
    .where(and(eq(radioReplays.kind, "playlist"), lt(radioReplays.startedAt, new Date(now)), sql`${radioReplays.endedAt} > ${now}`));
  rows.forEach((r) => ids.push(r.id));
  return ids;
}

/** Called after a running order is stored: copies it into every replay being recorded. */
export async function logTimeline(db: DbClient, tl: RadioTimeline): Promise<void> {
  for (const id of await recordingReplays(db)) await saveTimelinePart(db, id, tl);
}

/** Opens a replay for each playlist show on air that has none yet (from the every-minute cron). */
export async function ensurePlaylistReplays(db: DbClient, program: RadioProgram | null, now = Date.now()): Promise<void> {
  for (const a of program?.airings ?? []) {
    if (a.plays !== "playlist" || a.start > now || a.end <= now) continue;
    const [existing] = await db.select({ id: radioReplays.id }).from(radioReplays).where(eq(radioReplays.airingKey, a.id));
    if (existing) continue;
    const id = crypto.randomUUID();
    await db.insert(radioReplays).values({ id, kind: "playlist", airingKey: a.id, title: a.title, artUrl: a.art, startedAt: new Date(a.start), endedAt: new Date(a.end), createdAt: new Date() }).onConflictDoNothing();
    const tl = await storedTimeline();
    if (tl) await saveTimelinePart(db, id, tl);
  }
}

// ---- Session --------------------------------------------------------------------------------------

function personRow(sessionId: string, user: RobloxUser, role: Person["role"], state: Person["state"]) {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    sessionId,
    userId: user.id,
    name: (user.displayName || user.robloxUsername || "Someone").slice(0, 60),
    avatar: user.avatarUrl ?? null,
    role,
    state,
    joinedAt: now,
    seenAt: now,
  };
}

export async function startSession(db: DbClient, user: RobloxUser, input: { title?: unknown; showId?: unknown }): Promise<Session> {
  if (await liveStudio(db)) throw new StudioError("A show is already on air: join it instead.", 409);
  let showId = typeof input.showId === "string" && input.showId ? input.showId : null;
  let title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  let art: string | null = null;
  if (showId) {
    const [show] = await db.select().from(radioShows).where(eq(radioShows.id, showId));
    if (!show) showId = null;
    else {
      title ||= show.name;
      art = show.artUrl ?? null;
    }
  }
  if (!title) throw new StudioError("Give the show a name, or pick one of the shows.");
  const now = new Date();
  const id = crypto.randomUUID();
  const replayId = crypto.randomUUID();
  await db.insert(radioReplays).values({ id: replayId, kind: "studio", title, showId, artUrl: art, startedAt: now, createdAt: now });
  await db.insert(radioStudioSessions).values({ id, title, showId, state: "live", callIn: false, replayId, startedBy: user.id, startedAt: now });
  await db.insert(radioStudioPeople).values(personRow(id, user, "host", "on_air"));
  const tl = await storedTimeline();
  if (tl) await saveTimelinePart(db, replayId, tl);
  await republish(db);
  return (await liveStudio(db))!;
}

/** A broadcaster joins the live show (or comes back to it). */
export async function joinAsBroadcaster(db: DbClient, user: RobloxUser): Promise<Person> {
  const s = await liveStudio(db);
  if (!s) throw new StudioError("No show is on air.", 404);
  const list = await people(db, s.id);
  const mine = list.find((p) => p.userId === user.id && isBroadcaster(p));
  if (mine) return mine;
  if (list.filter((p) => p.state === "on_air").length >= ON_AIR_CAP) throw new StudioError(`${ON_AIR_CAP} people are already on air.`, 409);
  const row = personRow(s.id, user, list.some((p) => p.role === "host") ? "cohost" : "host", "on_air");
  await db.insert(radioStudioPeople).values(row);
  await republish(db);
  return row as Person;
}

export async function me(db: DbClient, sessionId: string, user: RobloxUser): Promise<Person | null> {
  const list = await people(db, sessionId);
  return list.find((p) => p.userId === user.id) ?? null;
}

/** A page checking in; written at most every SEEN_WRITE_MS. */
export async function seen(db: DbClient, p: Person): Promise<void> {
  if (Date.now() - p.seenAt.getTime() < SEEN_WRITE_MS) return;
  await db.update(radioStudioPeople).set({ seenAt: new Date() }).where(eq(radioStudioPeople.id, p.id));
}

export async function setTrack(db: DbClient, p: Person, rtcSession: string, track: string): Promise<void> {
  await db.update(radioStudioPeople).set({ rtcSession, track, seenAt: new Date() }).where(eq(radioStudioPeople.id, p.id));
  await republish(db);
}

/**
 * Someone leaves (or is taken off air). The show carries on while a broadcaster is left; the
 * longest-serving co-host takes over as host. With no broadcaster left, the show carries on
 * unattended while its queue lasts (Adrien, 2026-11-20: a broadcaster leaving doesn't cut their
 * queue): see afterLeaving.
 */
export async function leave(db: DbClient, personId: string): Promise<void> {
  const [p] = await db.select().from(radioStudioPeople).where(eq(radioStudioPeople.id, personId));
  if (!p || p.state === "left") return;
  await db.update(radioStudioPeople).set({ state: "left" }).where(eq(radioStudioPeople.id, personId));
  await afterLeaving(db, p.sessionId);
  await republish(db);
}

async function afterLeaving(db: DbClient, sessionId: string): Promise<void> {
  const list = await people(db, sessionId);
  const broadcasters = list.filter((p) => isBroadcaster(p) && p.state === "on_air");
  if (!broadcasters.length) {
    // Nobody runs the show any more. With songs still queued, it carries on unattended until the
    // queue has played (tidy ends it then): no callers without a host, and the music not left paused.
    if (!(await queueLeft(db, sessionId))) {
      await endSession(db, sessionId, false);
      return;
    }
    const [s] = await db.select().from(radioStudioSessions).where(eq(radioStudioSessions.id, sessionId));
    if (s?.pausedAt) await resumeMusic(db, s, false);
    await db.update(radioStudioSessions).set({ callIn: false }).where(eq(radioStudioSessions.id, sessionId));
    await db.update(radioStudioPeople).set({ state: "left" }).where(and(eq(radioStudioPeople.sessionId, sessionId), ne(radioStudioPeople.state, "left")));
    return;
  }
  if (!broadcasters.some((p) => p.role === "host")) {
    await db.update(radioStudioPeople).set({ role: "host" }).where(eq(radioStudioPeople.id, broadcasters[0]!.id));
  }
}

export async function endSession(db: DbClient, sessionId: string, publish = true): Promise<void> {
  const [s] = await db.select().from(radioStudioSessions).where(eq(radioStudioSessions.id, sessionId));
  if (!s || s.state !== "live") return;
  if (s.pausedAt) await resumeMusic(db, s, false);
  const now = new Date();
  await db.update(radioStudioSessions).set({ state: "ended", endedAt: now, callIn: false }).where(eq(radioStudioSessions.id, sessionId));
  await db.update(radioStudioPeople).set({ state: "left" }).where(eq(radioStudioPeople.sessionId, sessionId));
  if (s.replayId) await db.update(radioReplays).set({ endedAt: now }).where(eq(radioReplays.id, s.replayId));
  if (publish) await republish(db);
}

/** Songs of the show's queue that haven't made it into the running order yet (or are downloading). */
async function queueLeft(db: DbClient, sessionId: string): Promise<number> {
  const rows = await db
    .select({ id: radioStudioQueue.id })
    .from(radioStudioQueue)
    .where(and(eq(radioStudioQueue.sessionId, sessionId), eq(radioStudioQueue.state, "queued")));
  return rows.length;
}

/**
 * Drops people whose page stopped checking in. A show nobody runs any more (every broadcaster
 * left) plays out its queue, following up links still downloading, and ends once it has.
 */
export async function tidy(db: DbClient): Promise<boolean> {
  const s = await liveStudio(db);
  if (!s) return false;
  const here = await people(db, s.id);
  if (!here.some((p) => isBroadcaster(p) && p.state === "on_air")) {
    await resolveQueue(db, s).catch(() => {});
    // a queued song that can never play (or a link that never downloads) mustn't hold the
    // Studio for good: an unattended show stops at UNATTENDED_MAX_MS after it started at the latest
    if ((await queueLeft(db, s.id)) && Date.now() - s.startedAt.getTime() < UNATTENDED_MAX_MS) return false;
    await endSession(db, s.id);
    return true;
  }
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await db
    .select({ id: radioStudioPeople.id })
    .from(radioStudioPeople)
    .where(and(eq(radioStudioPeople.sessionId, s.id), ne(radioStudioPeople.state, "left"), lt(radioStudioPeople.seenAt, cutoff)));
  if (!stale.length) return false;
  await db.update(radioStudioPeople).set({ state: "left" }).where(inArray(radioStudioPeople.id, stale.map((r) => r.id)));
  await afterLeaving(db, s.id);
  await republish(db);
  return true;
}

export async function setCallIn(db: DbClient, s: Session, on: boolean): Promise<void> {
  await db.update(radioStudioSessions).set({ callIn: on }).where(eq(radioStudioSessions.id, s.id));
  if (!on) await db.update(radioStudioPeople).set({ state: "left" }).where(and(eq(radioStudioPeople.sessionId, s.id), eq(radioStudioPeople.state, "waiting")));
  await republish(db);
}

// ---- Callers --------------------------------------------------------------------------------------

/** A signed-in listener asks to call in: they wait until a host puts them on air. */
export async function requestCall(db: DbClient, user: RobloxUser): Promise<Person> {
  const s = await liveStudio(db);
  if (!s || !s.callIn) throw new StudioError("Calling in isn't open right now.", 409);
  const existing = await me(db, s.id, user);
  if (existing) return existing;
  const row = personRow(s.id, user, "caller", "waiting");
  await db.insert(radioStudioPeople).values(row);
  return row as Person;
}

/** A waiting caller's place in line (1 = next). */
export async function waitingPosition(db: DbClient, sessionId: string, joinedAt: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(radioStudioPeople)
    .where(and(eq(radioStudioPeople.sessionId, sessionId), eq(radioStudioPeople.state, "waiting"), lt(radioStudioPeople.joinedAt, joinedAt)));
  return Number(r?.n ?? 0) + 1;
}

export async function putOnAir(db: DbClient, s: Session, personId: string): Promise<void> {
  const list = await people(db, s.id);
  const p = list.find((x) => x.id === personId);
  if (!p || p.role !== "caller") throw new StudioError("That caller has left.", 404);
  if (p.state === "on_air") return;
  if (list.filter((x) => x.state === "on_air").length >= ON_AIR_CAP) throw new StudioError(`${ON_AIR_CAP} people are already on air.`, 409);
  await db.update(radioStudioPeople).set({ state: "on_air" }).where(eq(radioStudioPeople.id, personId));
  await republish(db);
}

/** A host sets someone's volume on air (0 to 2, 1 = as levelled). */
export async function setGain(db: DbClient, s: Session, personId: string, gain: number): Promise<void> {
  if (!Number.isFinite(gain)) throw new StudioError("Bad volume.");
  const g = Math.round(Math.max(0, Math.min(2, gain)) * 100) / 100;
  const list = await people(db, s.id);
  if (!list.some((x) => x.id === personId && x.state === "on_air")) throw new StudioError("They're not on air.", 404);
  await db.update(radioStudioPeople).set({ gain: g }).where(eq(radioStudioPeople.id, personId));
  await republish(db);
}

// ---- Music: pause and resume ------------------------------------------------------------------------

export async function pauseMusic(db: DbClient, s: Session): Promise<void> {
  if (s.pausedAt) return;
  const now = Date.now();
  const tl = await storedTimeline();
  const np = tl ? nowPlaying(tl, now) : null;
  await db
    .update(radioStudioSessions)
    .set({ pausedAt: new Date(now), pausedKey: np?.slot.item.key ?? null, pausedSec: np ? Math.max(0, np.positionSec) : null })
    .where(eq(radioStudioSessions.id, s.id));
  if (s.replayId) await db.insert(radioReplayParts).values({ replayId: s.replayId, kind: "pause", startMs: now });
  await republish(db);
}

/**
 * Music back on: a fresh running order that starts the paused song where it stopped, a few
 * seconds from now (listeners' AutoDJ lines up what follows, as after any fresh start).
 */
export async function resumeMusic(db: DbClient, s: Session, publish = true): Promise<void> {
  if (!s.pausedAt) return;
  const now = Date.now();
  const bucket = radioBucket();
  const tl = await storedTimeline();
  const item = tl?.items.find((i) => i.key === s.pausedKey) ?? null;
  if (bucket && tl && item) {
    const startMs = now + 4000;
    const fresh: RadioTimeline = {
      ...tl,
      rev: tl.rev + 1,
      firstK: tl.firstK + tl.items.length + 1,
      anchorMs: startMs,
      startSec: Math.round(Math.max(0, Math.min(s.pausedSec ?? 0, item.durationSec - 75)) * 1000) / 1000,
      repeat: false,
      items: [item],
      mixes: [],
    };
    await bucket.put(AUTODJ_KEY, JSON.stringify(fresh), { httpMetadata: { contentType: "application/json" } });
    if (s.replayId) await saveTimelinePart(db, s.replayId, fresh);
  }
  await db.update(radioStudioSessions).set({ pausedAt: null, pausedKey: null, pausedSec: null }).where(eq(radioStudioSessions.id, s.id));
  if (s.replayId) {
    await db
      .update(radioReplayParts)
      .set({ endMs: now + 4000 })
      .where(and(eq(radioReplayParts.replayId, s.replayId), eq(radioReplayParts.kind, "pause"), sql`${radioReplayParts.endMs} IS NULL`));
  }
  if (publish) await republish(db);
}

// ---- Queue ------------------------------------------------------------------------------------------

async function lastPosition(db: DbClient, sessionId: string): Promise<number> {
  const [r] = await db.select({ max: sql<number | null>`max(${radioStudioQueue.position})` }).from(radioStudioQueue).where(eq(radioStudioQueue.sessionId, sessionId));
  return r?.max == null ? 0 : Number(r.max) + 1;
}

export async function queueSong(db: DbClient, s: Session, user: RobloxUser, songKey: string): Promise<void> {
  const [song] = await db.select().from(radioSongs).where(and(eq(radioSongs.r2Key, songKey), eq(radioSongs.archived, false)));
  if (!song) throw new StudioError("That song isn't in the library.", 404);
  await db.insert(radioStudioQueue).values({
    id: crypto.randomUUID(), sessionId: s.id, songKey, label: `${song.title} · ${song.artist}`, position: await lastPosition(db, s.id), addedBy: user.id, createdAt: new Date(),
  });
  await republish(db);
}

/** Queue by link: the VPS downloads it into the library first; it joins the queue once it's there. */
export async function queueUrl(db: DbClient, s: Session, user: RobloxUser, url: string): Promise<void> {
  const kind = url.length <= 2000 ? linkKind(url) : null;
  if (!kind) throw new StudioError("Paste a YouTube, YouTube Music, SoundCloud or Spotify song link.");
  if (kind.collection) throw new StudioError("Paste one song. Whole playlists go in through the Library, then search for them here.");
  const { jobId, job } = await startJob(db, url, null);
  const now = new Date();
  await db.insert(radioImports).values({ id: jobId, url, playlistId: null, state: job.state, title: job.title, total: job.total, createdBy: user.id, createdAt: now, updatedAt: now });
  await db.insert(radioStudioQueue).values({
    id: crypto.randomUUID(), sessionId: s.id, importId: jobId, label: url, position: await lastPosition(db, s.id), addedBy: user.id, createdAt: now,
  });
}

/** Links still downloading: once their song is in the library they join the queue for real. */
export async function resolveQueue(db: DbClient, s: Session): Promise<void> {
  const pending = await db
    .select()
    .from(radioStudioQueue)
    .where(and(eq(radioStudioQueue.sessionId, s.id), eq(radioStudioQueue.state, "queued"), sql`${radioStudioQueue.songKey} IS NULL`));
  let changed = false;
  for (const q of pending) {
    if (!q.importId) continue;
    const [row] = await db.select().from(radioImports).where(eq(radioImports.id, q.importId));
    if (!row) continue;
    const synced = FINAL_STATES.includes(row.state) ? row : await syncImport(db, row).catch(() => row);
    if (!FINAL_STATES.includes(synced.state)) continue;
    const { job } = await getJob(db, q.importId).catch(() => ({ job: null }));
    const item = job?.items?.find((i) => i.state === "done" && i.song?.audio?.r2Key?.startsWith("songs/"));
    if (item?.song) {
      await syncImport(db, synced).catch(() => synced);
      await db.update(radioStudioQueue).set({ songKey: item.song.audio.r2Key, label: `${item.song.title} · ${item.song.artist}` }).where(eq(radioStudioQueue.id, q.id));
    } else {
      await db.update(radioStudioQueue).set({ state: "failed" }).where(eq(radioStudioQueue.id, q.id));
    }
    changed = true;
  }
  if (changed) await republish(db);
}

export async function removeFromQueue(db: DbClient, s: Session, id: string): Promise<void> {
  await db.delete(radioStudioQueue).where(and(eq(radioStudioQueue.id, id), eq(radioStudioQueue.sessionId, s.id)));
  await republish(db);
}

export async function moveInQueue(db: DbClient, s: Session, id: string, dir: -1 | 1): Promise<void> {
  const list = await db.select().from(radioStudioQueue).where(and(eq(radioStudioQueue.sessionId, s.id), eq(radioStudioQueue.state, "queued"))).orderBy(asc(radioStudioQueue.position));
  const i = list.findIndex((q) => q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  await db.update(radioStudioQueue).set({ position: list[j]!.position }).where(eq(radioStudioQueue.id, list[i]!.id));
  await db.update(radioStudioQueue).set({ position: list[i]!.position }).where(eq(radioStudioQueue.id, list[j]!.id));
  await republish(db);
}

/** A queued song made it into the running order: it's no longer waiting. */
export async function markQueuedPlayed(db: DbClient, keys: string[]): Promise<void> {
  const s = await liveStudio(db);
  if (!s || !keys.length) return;
  const rows = await db
    .select({ id: radioStudioQueue.id, key: radioStudioQueue.songKey })
    .from(radioStudioQueue)
    .where(and(eq(radioStudioQueue.sessionId, s.id), eq(radioStudioQueue.state, "queued"), inArray(radioStudioQueue.songKey, keys)));
  if (!rows.length) return;
  await db.update(radioStudioQueue).set({ state: "played" }).where(inArray(radioStudioQueue.id, rows.map((r) => r.id)));
  await republish(db);
}

// ---- What the Studio page shows ----------------------------------------------------------------------

export async function studioState(db: DbClient, user: RobloxUser) {
  const s = await liveStudio(db);
  if (!s) return studioStateOf(null, [], [], user);
  const [list, queue] = await Promise.all([people(db, s.id), openQueue(db, s.id)]);
  return studioStateOf(s, list, queue, user);
}

type QueueRow = typeof radioStudioQueue.$inferSelect;

function openQueue(db: DbClient, sessionId: string): Promise<QueueRow[]> {
  return db.select().from(radioStudioQueue).where(and(eq(radioStudioQueue.sessionId, sessionId), ne(radioStudioQueue.state, "played"))).orderBy(asc(radioStudioQueue.position));
}

function studioStateOf(s: Session | null, list: Person[], queue: QueueRow[], user: RobloxUser) {
  if (!s) return { session: null, me: null, people: [], queue: [], cap: ON_AIR_CAP };
  const mine = list.find((p) => p.userId === user.id && isBroadcaster(p)) ?? null;
  return {
    session: {
      id: s.id,
      title: s.title,
      showId: s.showId,
      callIn: s.callIn,
      paused: !!s.pausedAt,
      startedAt: s.startedAt.getTime(),
      replayId: s.replayId,
    },
    me: mine ? { id: mine.id, role: mine.role } : null,
    people: list.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role, state: p.state, connected: !!p.track, gain: p.gain, seenAgoMs: Date.now() - p.seenAt.getTime() })),
    queue: queue.map((q) => ({ id: q.id, label: q.label, state: q.state, ready: !!q.songKey })),
    cap: ON_AIR_CAP,
  };
}

/**
 * The Studio page checking in (every few seconds, from every open Studio): the state, read once.
 * The common case is three small reads (the show, its people, its queue). Tidying away people who
 * stopped checking in, and following up queued links, only run when there is something to do.
 */
export async function studioPoll(db: DbClient, user: RobloxUser) {
  let s = await liveStudio(db);
  if (!s) return studioStateOf(null, [], [], user);
  let [list, queue] = await Promise.all([people(db, s.id), openQueue(db, s.id)]);
  const cutoff = Date.now() - STALE_MS;
  if (list.some((p) => p.seenAt.getTime() < cutoff && p.userId !== user.id)) {
    await tidy(db);
    s = await liveStudio(db);
    if (!s) return studioStateOf(null, [], [], user);
    [list, queue] = await Promise.all([people(db, s.id), openQueue(db, s.id)]);
  }
  const mine = list.find((p) => p.userId === user.id);
  if (mine) await seen(db, mine);
  if (queue.some((q) => q.state === "queued" && !q.songKey)) {
    await resolveQueue(db, s);
    queue = await openQueue(db, s.id);
  }
  return studioStateOf(s, list, queue, user);
}
