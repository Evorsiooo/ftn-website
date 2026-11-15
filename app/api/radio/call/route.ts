import { NextRequest, NextResponse } from "next/server";
import { radioUser, studioFailure } from "@/lib/radio/admin-route";
import { liveStudio } from "@/lib/radio/program";
import { overCap } from "@/lib/radio/rtc";
import { noStore } from "@/lib/radio/store";
import { StudioError, leave, me, requestCall, seen, setTrack, waitingPosition } from "@/lib/radio/studio";

export const runtime = "edge";

/**
 * Calling in (signed-in listeners, only while a host has it open). GET: whether it's open and
 * where this caller stands (waiting, on air, or gone); polled by the waiting room, which also
 * counts as the caller checking in. POST op: join (wait to be put on air), leave, track (their
 * voice is connected).
 */
export async function GET(request: NextRequest) {
  const ctx = await radioUser(request);
  if ("error" in ctx) return ctx.error;
  try {
    const s = await liveStudio(ctx.db);
    if (!s) return NextResponse.json({ open: false, me: null }, { headers: noStore });
    const p = await me(ctx.db, s.id, ctx.user);
    if (p) await seen(ctx.db, p);
    const position = p?.state === "waiting" ? await waitingPosition(ctx.db, s.id, p.joinedAt) : null;
    return NextResponse.json(
      { open: s.callIn, show: s.title, me: p && p.role === "caller" ? { id: p.id, state: p.state, position } : null },
      { headers: noStore },
    );
  } catch (err) {
    return studioFailure(err, "Could not check calling in");
  }
}

export async function POST(request: NextRequest) {
  const ctx = await radioUser(request);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const s = await liveStudio(ctx.db);
    if (body.op === "join") {
      if (await overCap(ctx.db)) throw new StudioError("Calling in is closed for the rest of the month.", 429);
      const p = await requestCall(ctx.db, ctx.user);
      return NextResponse.json({ me: { id: p.id, state: p.state } });
    }
    const p = s ? await me(ctx.db, s.id, ctx.user) : null;
    if (!p || p.role !== "caller") return NextResponse.json({ ok: true });
    if (body.op === "leave") await leave(ctx.db, p.id);
    else if (body.op === "track") {
      if (p.state !== "on_air") throw new StudioError("You're not on air.", 403);
      if (typeof body.session !== "string" || typeof body.track !== "string") throw new StudioError("Missing session or track.");
      await setTrack(ctx.db, p, body.session.slice(0, 200), body.track.slice(0, 200));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return studioFailure(err, "That didn't work");
  }
}
