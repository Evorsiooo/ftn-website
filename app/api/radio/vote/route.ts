import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { songVotes } from "@/db/schema";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentSong } from "@/lib/radio-votes";

export const runtime = "edge";

// No sign-in: each listener gets a random id in a long-lived cookie, which gives them one
// changeable vote per song. It is abuse protection, not identity.
const COOKIE = "ftn_voter";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function voterIdFrom(request: NextRequest): string | null {
  const v = request.cookies.get(COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}

async function tally(db: ReturnType<typeof getDb>, key: string, voterId: string | null) {
  const [row] = await db
    .select({
      up: sql<number>`coalesce(sum(case when ${songVotes.value} = 1 then 1 else 0 end), 0)`,
      down: sql<number>`coalesce(sum(case when ${songVotes.value} = -1 then 1 else 0 end), 0)`,
    })
    .from(songVotes)
    .where(eq(songVotes.songKey, key));
  let mine = 0;
  if (voterId) {
    const [m] = await db
      .select({ value: songVotes.value })
      .from(songVotes)
      .where(and(eq(songVotes.songKey, key), eq(songVotes.voterId, voterId)))
      .limit(1);
    mine = m?.value ?? 0;
  }
  return { up: Number(row?.up ?? 0), down: Number(row?.down ?? 0), mine };
}

// Public: the current song with its vote counts, plus this listener's own vote.
export async function GET(request: NextRequest) {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ song: null });
    const rl = await checkRateLimit(`vote-read:${getClientIp(request)}`, 60, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const song = await getCurrentSong(d1);
    if (!song) return NextResponse.json({ song: null });
    const counts = await tally(getDb(d1), song.key, voterIdFrom(request));
    return NextResponse.json({ song: { key: song.key, artist: song.artist, title: song.title }, ...counts });
  } catch (error) {
    console.error("vote read error:", error);
    return NextResponse.json({ song: null });
  }
}

// Body: { key, value } with value 1, -1, or 0 to take the vote back.
export async function POST(request: NextRequest) {
  try {
    const existing = voterIdFrom(request);
    const voterId = existing ?? crypto.randomUUID();

    // Limited per address (so clearing cookies doesn't help) and per voter id.
    const [byIp, byVoter] = await Promise.all([
      checkRateLimit(`vote-ip:${getClientIp(request)}`, 40, 60),
      checkRateLimit(`vote:${voterId}`, 20, 60),
    ]);
    const limited = !byIp.allowed ? byIp : !byVoter.allowed ? byVoter : null;
    if (limited) {
      return NextResponse.json({ error: "Slow down a little" }, { status: 429, headers: { "Retry-After": String(limited.resetInSeconds) } });
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
      await db.delete(songVotes).where(and(eq(songVotes.songKey, song.key), eq(songVotes.voterId, voterId)));
    } else {
      const now = new Date();
      await db
        .insert(songVotes)
        .values({ voterId, songKey: song.key, artist: song.artist, title: song.title, value, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [songVotes.voterId, songVotes.songKey], set: { value, updatedAt: now } });
    }
    const counts = await tally(db, song.key, voterId);
    const res = NextResponse.json({ success: true, ...counts });
    if (!existing) {
      res.cookies.set(COOKIE, voterId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return res;
  } catch (error) {
    console.error("vote error:", error);
    return NextResponse.json({ error: "Failed to save vote" }, { status: 500 });
  }
}
