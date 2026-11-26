import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { radioSongs, songVotes } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { spotifyUrl, youtubeMusicUrl } from "@/lib/radio/song-links";

export const runtime = "edge";

const noStore = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 500;

/** A liked song as FTN+ Saved shows it. */
export type LikedSong = {
  key: string;
  title: string;
  artist: string;
  art: string | null;
  durationSec: number | null;
  youtubeMusic: string;
  spotify: string;
  /** false: Spotify opens a search (the song has no Spotify id). */
  spotifyExact: boolean;
};

function who(request: NextRequest) {
  const v = request.cookies.get("ftn_voter")?.value;
  return { voterId: v && UUID.test(v) ? v : null, token: request.cookies.get("ftn_session")?.value || null };
}

async function userIdOf(token: string | null): Promise<string | null> {
  if (!token) return null;
  const user = await verifySessionToken(token).catch(() => null);
  return user?.id ? String(user.id) : null;
}

const d1 = () => (process.env as any).DB as D1Database | undefined;

/**
 * Songs this listener liked on the radio (thumbs up), newest first. Signed out: the likes of this browser (its
 * voter cookie). Signed in: the account's likes from every device; this browser's earlier likes join the account.
 * Reads only the listener's own rows (voter id = primary key, user id = index) plus each song by its file key
 * (unique index): about two rows per liked song.
 */
export async function GET(request: NextRequest) {
  const db0 = d1();
  const { voterId, token } = who(request);
  const userId = await userIdOf(token);
  if (!db0 || (!voterId && !userId)) return NextResponse.json({ signedIn: !!userId, songs: [] }, { headers: noStore });
  const rl = await checkRateLimit(`liked-read:${getClientIp(request)}`, 30, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const db = getDb(db0);
  try {
    if (userId && voterId) {
      await db.update(songVotes).set({ userId }).where(and(eq(songVotes.voterId, voterId), isNull(songVotes.userId)));
    }
    const rows = await db
      .select({
        key: songVotes.songKey,
        title: songVotes.title,
        artist: songVotes.artist,
        libTitle: radioSongs.title,
        libArtist: radioSongs.artist,
        art: radioSongs.thumbnailUrl,
        durationSec: radioSongs.durationSec,
        source: radioSongs.source,
        sourceId: radioSongs.sourceId,
        spotifyId: radioSongs.spotifyId,
      })
      .from(songVotes)
      .leftJoin(radioSongs, eq(radioSongs.r2Key, songVotes.songKey))
      .where(and(userId ? eq(songVotes.userId, userId) : eq(songVotes.voterId, voterId!), eq(songVotes.value, 1)))
      .orderBy(desc(songVotes.updatedAt))
      .limit(MAX);
    const seen = new Set<string>();
    const songs: LikedSong[] = [];
    for (const r of rows) {
      if (seen.has(r.key)) continue; // liked on two devices
      seen.add(r.key);
      const title = r.libTitle ?? r.title;
      const artist = r.libArtist ?? r.artist;
      const youtubeId = r.source === "youtube" ? r.sourceId : null;
      songs.push({
        key: r.key,
        title,
        artist,
        art: r.art ?? null,
        durationSec: r.durationSec ?? null,
        youtubeMusic: youtubeMusicUrl(youtubeId, artist, title),
        spotify: spotifyUrl(r.spotifyId, artist, title),
        spotifyExact: !!r.spotifyId,
      });
    }
    return NextResponse.json({ signedIn: !!userId, songs }, { headers: noStore });
  } catch (e) {
    console.error("Liked songs GET error:", e);
    return NextResponse.json({ error: "Failed to load liked songs" }, { status: 500 });
  }
}

/** Body: { key } — takes the like back (the same as pressing thumbs up again on the radio). */
export async function POST(request: NextRequest) {
  const db0 = d1();
  const { voterId, token } = who(request);
  const userId = await userIdOf(token);
  if (!db0) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  if (!voterId && !userId) return NextResponse.json({ ok: true });
  const rl = await checkRateLimit(`liked-write:${getClientIp(request)}`, 30, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Slow down a little" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  if (typeof body?.key !== "string" || !body.key || body.key.length > 420) return NextResponse.json({ error: "Invalid song" }, { status: 400 });
  const mine = userId && voterId ? or(eq(songVotes.userId, userId), eq(songVotes.voterId, voterId)) : userId ? eq(songVotes.userId, userId) : eq(songVotes.voterId, voterId!);
  try {
    await getDb(db0)
      .delete(songVotes)
      .where(and(eq(songVotes.songKey, body.key), eq(songVotes.value, 1), mine));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Liked songs POST error:", e);
    return NextResponse.json({ error: "Failed to remove the song" }, { status: 500 });
  }
}
