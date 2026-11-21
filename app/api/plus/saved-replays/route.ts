import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { radioReplaySaves, radioReplays, radioShows } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

const noStore = { "Cache-Control": "no-store" };

async function signedIn(request: NextRequest) {
  const token = request.cookies.get("ftn_session")?.value || request.headers.get("authorization")?.replace("Bearer ", "");
  return token ? verifySessionToken(token) : null;
}

const d1 = () => (process.env as any).DB as D1Database | undefined;

/**
 * Radio replays saved for later, on the member's account (signed out, they're kept on the device).
 * ?replayId= says whether that one is saved; otherwise the list, newest saved first, as replay cards.
 */
export async function GET(request: NextRequest) {
  const user = await signedIn(request);
  const db0 = d1();
  if (!user || !db0) return NextResponse.json({ signedIn: !!user, replays: [], saved: false }, { headers: noStore });
  const db = getDb(db0);
  const one = request.nextUrl.searchParams.get("replayId")?.trim();
  try {
    if (one) {
      const [row] = await db
        .select({ id: radioReplaySaves.replayId })
        .from(radioReplaySaves)
        .where(and(eq(radioReplaySaves.userId, user.id), eq(radioReplaySaves.replayId, one)))
        .limit(1);
      return NextResponse.json({ signedIn: true, saved: !!row }, { headers: noStore });
    }
    const rows = await db
      .select({ r: radioReplays, showName: radioShows.name, showArt: radioShows.artUrl })
      .from(radioReplaySaves)
      .innerJoin(radioReplays, eq(radioReplays.id, radioReplaySaves.replayId))
      .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
      .where(and(eq(radioReplaySaves.userId, user.id), eq(radioReplays.hidden, false)))
      .orderBy(desc(radioReplaySaves.addedAt))
      .limit(100);
    const replays = rows
      .filter(({ r }) => r.endedAt)
      .map(({ r, showName, showArt }) => ({
        id: r.id,
        title: r.title,
        show: showName ?? null,
        art: r.artUrl ?? showArt ?? null,
        startedAt: r.startedAt.getTime(),
        endedAt: r.endedAt!.getTime(),
      }));
    return NextResponse.json({ signedIn: true, replays }, { headers: noStore });
  } catch (e) {
    console.error("Saved replays GET error:", e);
    return NextResponse.json({ error: "Failed to load saved replays" }, { status: 500 });
  }
}

/** Saves a replay ({ replayId, action: "add" | "remove" }). */
export async function POST(request: NextRequest) {
  const user = await signedIn(request);
  if (!user) return NextResponse.json({ error: "Sign in to save replays" }, { status: 401 });
  const limit = await checkRateLimit(`saved-replays:${user.id}`, 60, 60);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { replayId?: unknown; action?: unknown };
  const replayId = typeof body.replayId === "string" ? body.replayId.trim() : "";
  if (!replayId || replayId.length > 100) return NextResponse.json({ error: "Missing replay" }, { status: 400 });
  const add = body.action !== "remove";
  const db0 = d1();
  if (!db0) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = getDb(db0);
  try {
    if (add) {
      const [exists] = await db.select({ id: radioReplays.id }).from(radioReplays).where(eq(radioReplays.id, replayId)).limit(1);
      if (!exists) return NextResponse.json({ error: "Replay not found" }, { status: 404 });
      await db.insert(radioReplaySaves).values({ userId: user.id, replayId, addedAt: new Date() }).onConflictDoNothing();
    } else {
      await db.delete(radioReplaySaves).where(and(eq(radioReplaySaves.userId, user.id), eq(radioReplaySaves.replayId, replayId)));
    }
    return NextResponse.json({ success: true, saved: add }, { headers: noStore });
  } catch (e) {
    console.error("Saved replays POST error:", e);
    return NextResponse.json({ error: "Saving failed" }, { status: 500 });
  }
}
