import { NextRequest, NextResponse } from "next/server";
import { and, eq, like, or } from "drizzle-orm";
import { radioSongs } from "@/db/schema";
import { radioAdmin, studioFailure } from "@/lib/radio/admin-route";
import { liveStudio } from "@/lib/radio/program";
import { overCap, usageBytes, usageSummary } from "@/lib/radio/rtc";
import { noStore } from "@/lib/radio/store";
import {
  StudioError,
  endSession,
  joinAsBroadcaster,
  leave,
  me,
  moveInQueue,
  pauseMusic,
  putOnAir,
  queueSong,
  queueUrl,
  removeFromQueue,
  resumeMusic,
  setCallIn,
  setGain,
  setTrack,
  skipSong,
  startSession,
  studioPoll,
} from "@/lib/radio/studio";

export const runtime = "edge";

/**
 * The Studio (Broadcast role): the show on air, who's on it and waiting, the queue, and the
 * month's voice usage. Polled every few seconds by the Studio page, which also counts as the
 * broadcaster checking in. ?q= searches the library instead.
 */
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;
  try {
    const q = request.nextUrl.searchParams.get("q");
    if (q !== null) {
      const term = `%${q.trim().slice(0, 100).replace(/[%_]/g, "")}%`;
      const songs = await db
        .select({ key: radioSongs.r2Key, title: radioSongs.title, artist: radioSongs.artist, durationSec: radioSongs.durationSec, thumbnail: radioSongs.thumbnailUrl })
        .from(radioSongs)
        .where(and(eq(radioSongs.archived, false), or(like(radioSongs.title, term), like(radioSongs.artist, term))))
        .limit(25);
      return NextResponse.json({ songs }, { headers: noStore });
    }
    const [state, bytes] = await Promise.all([studioPoll(db, user), usageBytes(db)]);
    return NextResponse.json({ ...state, usage: usageSummary(bytes) }, { headers: noStore });
  } catch (err) {
    return studioFailure(err, "Could not load the Studio");
  }
}

export async function POST(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op ?? "");
  try {
    if (op === "start") {
      if (await overCap(db)) throw new StudioError("This month's voice allowance is used up: the Studio can't go on air until next month.", 429);
      await startSession(db, user, body);
      return NextResponse.json({ ok: true });
    }
    if (op === "join") {
      if (await overCap(db)) throw new StudioError("This month's voice allowance is used up.", 429);
      await joinAsBroadcaster(db, user);
      return NextResponse.json({ ok: true });
    }
    const s = await liveStudio(db);
    if (!s) throw new StudioError("No show is on air.", 404);
    const mine = await me(db, s.id, user);
    if (op === "leave") {
      if (mine) await leave(db, mine.id, { soft: body.soft === true });
      return NextResponse.json({ ok: true });
    }
    // everything else: broadcasters of this show only
    if (!mine || mine.role === "caller" || mine.state !== "on_air") throw new StudioError("Join the show first.", 403);
    switch (op) {
      case "track":
        if (typeof body.session !== "string" || typeof body.track !== "string") throw new StudioError("Missing session or track.");
        await setTrack(db, mine, body.session.slice(0, 200), body.track.slice(0, 200));
        break;
      case "end":
        await endSession(db, s.id);
        break;
      case "callIn":
        await setCallIn(db, s, body.on === true);
        break;
      case "pause":
        await pauseMusic(db, s);
        break;
      case "resume":
        await resumeMusic(db, s);
        break;
      case "queueSong":
        await queueSong(db, s, user, String(body.key ?? ""));
        break;
      case "queueUrl":
        await queueUrl(db, s, user, String(body.url ?? "").trim());
        break;
      case "skip":
        await skipSong(db, s, Number(body.k), String(body.key ?? ""));
        break;
      case "remove":
        await removeFromQueue(db, s, String(body.id ?? ""));
        break;
      case "move":
        await moveInQueue(db, s, String(body.id ?? ""), body.dir === -1 ? -1 : 1);
        break;
      case "onAir":
        await putOnAir(db, s, String(body.id ?? ""));
        break;
      case "gain":
        await setGain(db, s, String(body.id ?? ""), Number(body.gain));
        break;
      case "takeOff":
        await leave(db, String(body.id ?? ""));
        break;
      default:
        throw new StudioError("Unknown action.");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return studioFailure(err, "That didn't work");
  }
}
