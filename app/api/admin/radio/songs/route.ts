import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { radioSongs, radioVersions } from "@/db/schema";
import { radioAdmin } from "@/lib/radio/admin-route";

export const runtime = "edge";

// Every song in the radio library, newest first (archived ones included; the page filters).
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  // The whole library is over a thousand songs, and reading + sending it all costs more CPU than the
  // free plan allows a request. A version tag lets the browser keep its copy (304) when nothing changed
  // since its last load. The tag is the "songs" counter in radio_versions, which database triggers move
  // on every add, edit or delete (migration 0034): one row read, where counting the songs read them all.
  const [v] = await ctx.db.select({ version: radioVersions.version }).from(radioVersions).where(eq(radioVersions.name, "songs"));
  const etag = `W/"songs-v${v?.version ?? 0}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  const songs = await ctx.db
    .select({
      id: radioSongs.id,
      key: radioSongs.r2Key,
      source: radioSongs.source,
      sourceUrl: radioSongs.sourceUrl,
      sourceId: radioSongs.sourceId,
      spotifyId: radioSongs.spotifyId,
      title: radioSongs.title,
      artist: radioSongs.artist,
      album: radioSongs.album,
      releaseYear: radioSongs.releaseYear,
      durationSec: radioSongs.durationSec,
      loudnessDb: radioSongs.loudnessDb,
      thumbnail: radioSongs.thumbnailUrl,
      archived: radioSongs.archived,
      musicVideo: radioSongs.musicVideo,
      metadataSource: radioSongs.metadataSource,
      audioCheck: radioSongs.audioCheck,
      audioCheckNote: radioSongs.audioCheckNote,
      lyricsSource: radioSongs.lyricsSource,
      lyricsOffsetMs: radioSongs.lyricsOffsetMs,
      createdAt: radioSongs.createdAt,
    })
    .from(radioSongs)
    .orderBy(desc(radioSongs.createdAt));
  return NextResponse.json({ songs }, { headers });
}
