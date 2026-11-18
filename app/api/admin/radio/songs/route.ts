import { NextRequest, NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { radioSongs } from "@/db/schema";
import { radioAdmin } from "@/lib/radio/admin-route";

export const runtime = "edge";

// Every song in the radio library, newest first (archived ones included; the page filters).
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  // The whole library is over a thousand songs, and reading + sending it all costs more CPU than the
  // free plan allows a request. A version tag from one cheap query lets the browser keep its copy
  // (304) when nothing changed since its last load. Any add, edit or delete moves one of the numbers.
  const [v] = await ctx.db
    .select({ n: sql<number>`count(*)`, created: sql<number>`max(${radioSongs.createdAt})`, updated: sql<number>`max(${radioSongs.updatedAt})` })
    .from(radioSongs);
  const etag = `W/"songs-${v?.n ?? 0}-${v?.created ?? 0}-${v?.updated ?? 0}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  const songs = await ctx.db
    .select({
      id: radioSongs.id,
      key: radioSongs.r2Key,
      source: radioSongs.source,
      sourceUrl: radioSongs.sourceUrl,
      title: radioSongs.title,
      artist: radioSongs.artist,
      album: radioSongs.album,
      releaseYear: radioSongs.releaseYear,
      durationSec: radioSongs.durationSec,
      loudnessDb: radioSongs.loudnessDb,
      thumbnail: radioSongs.thumbnailUrl,
      archived: radioSongs.archived,
      createdAt: radioSongs.createdAt,
    })
    .from(radioSongs)
    .orderBy(desc(radioSongs.createdAt));
  return NextResponse.json({ songs }, { headers });
}
