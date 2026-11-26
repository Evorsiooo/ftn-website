import { NextRequest, NextResponse } from "next/server";
import { radioImports, radioSongs } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { radioBucket, startJob } from "@/lib/radio/library";
import { claim, endRun, finish, heartbeat, missingSongs, openRuns, PrepError, requestStop, retryFailed, songsToPrepare, startRun } from "@/lib/radio/prep";

export const runtime = "edge";

/** The Prepare runs going on now (Library status on any device, read every 30 s while it's open). */
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  try {
    return NextResponse.json({ runs: await openRuns(ctx.db) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return failure(err, "Could not read the Prepare runs");
  }
}

type Body = {
  op?: string;
  runId?: string;
  workers?: number;
  total?: number;
  done?: number;
  failed?: number;
  n?: number;
  songId?: string;
  titleChecked?: boolean;
  error?: string | null;
  perMin?: number | null;
  keys?: string[];
};

/**
 * start: a run in this tab. claim: its next songs. done: a song finished. beat: still here. stop: from any
 * device. end: the run is over. studio: the songs a Studio tab queued that still need preparing.
 * retry: songs that failed go back in Getting ready. redownload: songs whose file is missing.
 */
export async function POST(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.op) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const runId = typeof body.runId === "string" ? body.runId : "";
  try {
    switch (body.op) {
      case "start":
        return NextResponse.json(await startRun(ctx.db, ctx.user, Number(body.workers) || 1, Number(body.total) || 0, { done: Number(body.done) || 0, failed: Number(body.failed) || 0 }));
      case "claim":
        return NextResponse.json(await claim(ctx.db, runId, Number(body.n) || 1));
      case "done": {
        if (typeof body.songId !== "string") return NextResponse.json({ error: "songId is required" }, { status: 400 });
        const error = body.error === "missing" || body.error === "failed" ? body.error : null;
        return NextResponse.json(await finish(ctx.db, runId || null, { songId: body.songId, titleChecked: body.titleChecked === true, error, perMin: body.perMin }));
      }
      case "beat":
        return NextResponse.json(await heartbeat(ctx.db, runId));
      case "stop":
        await requestStop(ctx.db, runId);
        return NextResponse.json({ ok: true });
      case "end":
        await endRun(ctx.db, runId);
        return NextResponse.json({ ok: true });
      case "studio": {
        const keys = Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === "string") : [];
        return NextResponse.json({ songs: await songsToPrepare(ctx.db, keys) });
      }
      case "retry":
        return NextResponse.json({ songs: await retryFailed(ctx.db) });
      case "redownload": {
        // The downloader skips a song whose details it already stored, so those go first; the song row is
        // reused when the same file comes back (same key), and Prepare looks at it again.
        const songs = await missingSongs(ctx.db);
        const bucket = radioBucket();
        let started = 0;
        for (const s of songs) {
          if (bucket && s.metaKey) await bucket.delete(s.metaKey).catch(() => {});
          const { jobId, job } = await startJob(ctx.db, s.sourceUrl!, { kind: "redownload", songId: s.id });
          const now = new Date();
          await ctx.db
            .insert(radioImports)
            .values({ id: jobId, url: s.sourceUrl!, playlistId: null, state: job.state, title: job.title, total: job.total, createdBy: ctx.user.id, createdAt: now, updatedAt: now });
          started++;
        }
        if (songs.length) await ctx.db.update(radioSongs).set({ prepError: null }).where(inArray(radioSongs.id, songs.map((s) => s.id)));
        return NextResponse.json({ started });
      }
      default:
        return NextResponse.json({ error: "Unknown op" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof PrepError) return NextResponse.json({ error: err.message }, { status: err.status });
    return failure(err, "Prepare failed");
  }
}
