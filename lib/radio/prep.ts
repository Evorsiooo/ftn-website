// "Getting ready" (Adrien, 2026-11-25): every new song waits until it has its mixing analysis and, for a
// song from a link, its title and cover checked; only then may the AutoDJ play it ("On air"). The work runs
// in an admin's browser when they press Prepare (the Library page) and in a broadcaster's for the songs they
// queue (the Studio). This file is the server's side: which songs a run takes, what it reports, and the
// progress any device can read and stop.
//
// D1 cost, per song prepared: the run's reservation (1 row written for a batch of up to 14), the shared
// analysis (1 song row written by /api/radio/analysis), and the "done" report (the song row, its reservation
// and the run's row). Progress for a phone is one small read of the open runs every 30 s while it looks.
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioPrepLeases, radioPrepRuns, radioSongs } from "@/db/schema";

/** A reservation lasts this long: a PC that disappears gives its songs back after it. */
export const LEASE_MS = 10 * 60_000;
/** A run that hasn't reported for this long is taken as gone (the tab closed or the PC slept). */
export const RUN_GONE_MS = 3 * 60_000;
export const MAX_BATCH = 14;

/** The songs still getting ready, as the partial index radio_songs_getting_ready_idx (migration 0036) has them. */
export const gettingReady = sql`(analysed_at IS NULL OR meta_checked_at IS NULL)`;

export interface PrepSong {
  id: string;
  key: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
  durationSec: number;
  thumbnail: string | null;
  source: string;
  musicVideo: boolean;
  needsAnalysis: boolean;
  needsTitleCheck: boolean;
}

const prepColumns = {
  id: radioSongs.id,
  key: radioSongs.r2Key,
  title: radioSongs.title,
  artist: radioSongs.artist,
  album: radioSongs.album,
  releaseYear: radioSongs.releaseYear,
  durationSec: radioSongs.durationSec,
  thumbnail: radioSongs.thumbnailUrl,
  source: radioSongs.source,
  musicVideo: radioSongs.musicVideo,
  analysedAt: radioSongs.analysedAt,
  metaCheckedAt: radioSongs.metaCheckedAt,
};

type PrepRow = { [K in keyof typeof prepColumns]: (typeof radioSongs.$inferSelect)[K extends "key" ? "r2Key" : K extends "thumbnail" ? "thumbnailUrl" : K] };

const toPrepSong = (r: PrepRow): PrepSong => ({
  id: r.id,
  key: r.key,
  title: r.title,
  artist: r.artist,
  album: r.album,
  releaseYear: r.releaseYear,
  durationSec: r.durationSec,
  thumbnail: r.thumbnail,
  source: r.source,
  musicVideo: r.musicVideo,
  needsAnalysis: !r.analysedAt,
  needsTitleCheck: !r.metaCheckedAt,
});

export class PrepError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function runOf(db: DbClient, runId: string) {
  const [run] = await db.select().from(radioPrepRuns).where(eq(radioPrepRuns.id, runId));
  if (!run) throw new PrepError("This run isn't known any more.", 404);
  return run;
}

/** A new run on this PC. [total]: the songs getting ready when it started (for "412 of 1,218"). */
export async function startRun(
  db: DbClient,
  user: { id: string; displayName: string; robloxUsername: string },
  workers: number,
  total: number,
  carried: { done: number; failed: number } = { done: 0, failed: 0 },
) {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(radioPrepRuns).values({
    id,
    userId: user.id,
    userName: (user.displayName || user.robloxUsername || "Someone").slice(0, 60),
    workers: Math.max(1, Math.min(16, Math.round(workers) || 1)),
    total: Math.max(0, Math.round(total) || 0),
    // a refreshed tab's run carries on the count of the one it replaces
    done: Math.max(0, Math.round(carried.done) || 0),
    failed: Math.max(0, Math.round(carried.failed) || 0),
    startedAt: now,
    updatedAt: now,
  });
  return { id };
}

/**
 * The next songs for [runId] to prepare, reserved for it: up to [n] songs getting ready that no other run
 * holds (a reservation that ran out counts as free). Newest first, so songs just added go on air first.
 */
export async function claim(db: DbClient, runId: string, n: number): Promise<{ songs: PrepSong[]; stop: boolean }> {
  const run = await runOf(db, runId);
  if (run.endedAt) throw new PrepError("This run has ended.", 409);
  if (run.stopRequested) return { songs: [], stop: true };
  const now = new Date();
  const rows = await db
    .select(prepColumns)
    .from(radioSongs)
    .leftJoin(radioPrepLeases, eq(radioPrepLeases.songId, radioSongs.id))
    // "+archived": keeps SQLite on the getting-ready index (the archived index would read every song)
    .where(and(gettingReady, sql`+${radioSongs.archived} = 0`, isNull(radioSongs.prepError), or(isNull(radioPrepLeases.until), lt(radioPrepLeases.until, now))))
    .orderBy(desc(radioSongs.createdAt))
    .limit(Math.max(1, Math.min(MAX_BATCH, n)));
  if (!rows.length) return { songs: [], stop: false };
  const until = new Date(now.getTime() + LEASE_MS);
  // Taken over only where free or run out: two PCs asking at once can't both hold a song.
  await db
    .insert(radioPrepLeases)
    .values(rows.map((r) => ({ songId: r.id, runId, until })))
    .onConflictDoUpdate({ target: radioPrepLeases.songId, set: { runId, until }, setWhere: lt(radioPrepLeases.until, now) });
  const mine = await db
    .select({ songId: radioPrepLeases.songId })
    .from(radioPrepLeases)
    .where(and(inArray(radioPrepLeases.songId, rows.map((r) => r.id)), eq(radioPrepLeases.runId, runId)));
  const held = new Set(mine.map((m) => m.songId));
  return { songs: rows.filter((r) => held.has(r.id)).map((r) => toPrepSong(r as PrepRow)), stop: false };
}

/**
 * A song finished in a run: its title check is recorded (the analysis was stored on its own, through
 * /api/radio/analysis), its reservation dropped and the run's progress moved on. [error]: "missing" (no audio
 * file) or "failed": the song is set aside (Library status, Needs a look) instead of being tried again and again.
 */
export async function finish(
  db: DbClient,
  runId: string | null,
  report: { songId: string; titleChecked: boolean; error?: "missing" | "failed" | null; perMin?: number | null },
): Promise<{ stop: boolean }> {
  const now = new Date();
  const set: Partial<typeof radioSongs.$inferInsert> = {};
  if (report.titleChecked) set.metaCheckedAt = now;
  if (report.error) set.prepError = report.error;
  if (Object.keys(set).length) set.updatedAt = now;
  if (Object.keys(set).length) await db.update(radioSongs).set(set).where(eq(radioSongs.id, report.songId));
  if (!runId) return { stop: false };
  await db.delete(radioPrepLeases).where(and(eq(radioPrepLeases.songId, report.songId), eq(radioPrepLeases.runId, runId)));
  const perMin = typeof report.perMin === "number" && Number.isFinite(report.perMin) && report.perMin > 0 ? Math.min(1000, report.perMin) : undefined;
  const [run] = await db
    .update(radioPrepRuns)
    .set({
      ...(report.error ? { failed: sql`${radioPrepRuns.failed} + 1` } : { done: sql`${radioPrepRuns.done} + 1` }),
      ...(perMin !== undefined ? { perMin } : {}),
      updatedAt: now,
    })
    .where(eq(radioPrepRuns.id, runId))
    .returning({ stop: radioPrepRuns.stopRequested });
  return { stop: !!run?.stop };
}

/** The run's tab is still there (sent about once a minute while a song takes long). */
export async function heartbeat(db: DbClient, runId: string): Promise<{ stop: boolean }> {
  const [run] = await db.update(radioPrepRuns).set({ updatedAt: new Date() }).where(eq(radioPrepRuns.id, runId)).returning({ stop: radioPrepRuns.stopRequested });
  return { stop: !!run?.stop };
}

/** Stop a run from any device: its tab finishes the songs in hand and stops at its next report. */
export async function requestStop(db: DbClient, runId: string) {
  await db.update(radioPrepRuns).set({ stopRequested: true }).where(and(eq(radioPrepRuns.id, runId), isNull(radioPrepRuns.endedAt)));
}

/** The run is over (finished, stopped, or its tab is closing): its reservations are given back. */
export async function endRun(db: DbClient, runId: string) {
  const now = new Date();
  await db.update(radioPrepRuns).set({ endedAt: now, updatedAt: now }).where(and(eq(radioPrepRuns.id, runId), isNull(radioPrepRuns.endedAt)));
  await db.delete(radioPrepLeases).where(eq(radioPrepLeases.runId, runId));
}

export interface RunStatus {
  id: string;
  userName: string;
  workers: number;
  total: number;
  done: number;
  failed: number;
  perMin: number | null;
  stopRequested: boolean;
  startedAt: string;
  updatedAt: string;
}

/**
 * The runs going on now, for every device's Library status. Runs whose tab went quiet are closed here
 * (their reservations run out by themselves). Reads only the open runs (radio_prep_runs_ended_idx).
 */
export async function openRuns(db: DbClient): Promise<RunStatus[]> {
  const rows = await db.select().from(radioPrepRuns).where(isNull(radioPrepRuns.endedAt)).orderBy(asc(radioPrepRuns.startedAt));
  const cutoff = Date.now() - RUN_GONE_MS;
  const gone = rows.filter((r) => r.updatedAt.getTime() < cutoff).map((r) => r.id);
  if (gone.length) await db.update(radioPrepRuns).set({ endedAt: new Date() }).where(inArray(radioPrepRuns.id, gone));
  return rows
    .filter((r) => !gone.includes(r.id))
    .map((r) => ({
      id: r.id,
      userName: r.userName,
      workers: r.workers,
      total: r.total,
      done: r.done,
      failed: r.failed,
      perMin: r.perMin,
      stopRequested: r.stopRequested,
      startedAt: r.startedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
}

/** Songs a Studio tab prepares itself: the ones it queued that are still getting ready (by key). */
export async function songsToPrepare(db: DbClient, keys: string[]): Promise<PrepSong[]> {
  if (!keys.length) return [];
  const rows = await db
    .select(prepColumns)
    .from(radioSongs)
    .where(and(inArray(radioSongs.r2Key, keys.slice(0, 50)), gettingReady, isNull(radioSongs.prepError)));
  return rows.map((r) => toPrepSong(r as PrepRow));
}

/** "Try again" for songs that couldn't be prepared: back in Getting ready. */
export async function retryFailed(db: DbClient): Promise<number> {
  const rows = await db.update(radioSongs).set({ prepError: null }).where(eq(radioSongs.prepError, "failed")).returning({ id: radioSongs.id });
  return rows.length;
}

/** Songs that couldn't be prepared because their audio file is missing (for Re-download). */
export async function missingSongs(db: DbClient) {
  return db
    .select({ id: radioSongs.id, key: radioSongs.r2Key, metaKey: radioSongs.metaKey, source: radioSongs.source, sourceUrl: radioSongs.sourceUrl })
    .from(radioSongs)
    .where(and(eq(radioSongs.prepError, "missing"), isNotNull(radioSongs.sourceUrl)));
}

/** Marks the songs whose shared analysis exists as analysed (the analysis endpoint, and the cron's index). */
export async function markAnalysed(db: DbClient, keys: string[]) {
  const now = new Date();
  for (let i = 0; i < keys.length; i += 90) {
    await db
      .update(radioSongs)
      .set({ analysedAt: now, updatedAt: now })
      .where(and(inArray(radioSongs.r2Key, keys.slice(i, i + 90)), isNull(radioSongs.analysedAt)));
  }
}


