import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { songVotes } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentSong } from "@/lib/radio-votes";

export const runtime = "edge";

async function currentUser(request: NextRequest) {
  const token =
    request.cookies.get("ftn_session")?.value || request.headers.get("authorization")?.replace("Bearer ", "");
  return token ? await verifySessionToken(token) : null;
}

async function tally(db: ReturnType<typeof getDb>, key: string, userId: string | null) {
  const [row] = await db
    .select({
      up: sql<number>`coalesce(sum(case when ${songVotes.value} = 1 then 1 else 0 end), 0)`,
      down: sql<number>`coalesce(sum(case when ${songVotes.value} = -1 then 1 else 0 end), 0)`,
    })
    .from(songVotes)
    .where(eq(songVotes.songKey, key));
  let mine = 0;
  if (userId) {
    const [m] = await db
      .select({ value: songVotes.value })
      .from(songVotes)
      .where(and(eq(songVotes.songKey, key), eq(songVotes.userId, userId)))
      .limit(1);
    mine = m?.value ?? 0;
  }
  return { up: Number(row?.up ?? 0), down: Number(row?.down ?? 0), mine };
}

// Public: the current song with its vote counts, plus the caller's own vote when signed in.
export async function GET(request: NextRequest) {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ song: null });
    const rl = await checkRateLimit(`vote-read:${getClientIp(request)}`, 60, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const song = await getCurrentSong(d1);
    if (!song) return NextResponse.json({ song: null });
    const user = await currentUser(request);
    const counts = await tally(getDb(d1), song.key, user?.id ?? null);
    return NextResponse.json({ song: { key: song.key, artist: song.artist, title: song.title }, ...counts, signedIn: !!user });
  } catch (error) {
    console.error("vote read error:", error);
    return NextResponse.json({ song: null });
  }
}

// Signed in only. Body: { key, value } with value 1, -1, or 0 to take the vote back.
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Sign in to vote" }, { status: 401 });

    const rl = await checkRateLimit(`vote:${user.id}`, 30, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Slow down a little" }, { status: 429, headers: { "Retry-After": String(rl.resetInSeconds) } });
    }

    const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
    const value = body?.value;
    if (typeof body?.key !== "string" || body.key.length > 420 || (value !== 1 && value !== -1 && value !== 0)) {
      return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const song = await getCurrentSong(d1);
    if (!song) return NextResponse.json({ error: "Nothing is playing" }, { status: 409 });
    // The song moved on while the listener was clicking: refuse rather than rate the wrong one.
    if (song.key !== body.key) return NextResponse.json({ error: "That song has changed", song }, { status: 409 });

    const db = getDb(d1);
    if (value === 0) {
      await db.delete(songVotes).where(and(eq(songVotes.songKey, song.key), eq(songVotes.userId, user.id)));
    } else {
      const now = new Date();
      await db
        .insert(songVotes)
        .values({ userId: user.id, songKey: song.key, artist: song.artist, title: song.title, value, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [songVotes.userId, songVotes.songKey], set: { value, updatedAt: now } });
    }
    const counts = await tally(db, song.key, user.id);
    return NextResponse.json({ success: true, ...counts });
  } catch (error) {
    console.error("vote error:", error);
    return NextResponse.json({ error: "Failed to save vote" }, { status: 500 });
  }
}
