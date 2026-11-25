import { NextRequest, NextResponse } from "next/server";
import { desc, eq, gte } from "drizzle-orm";
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
  // ?since=<ms>: only the songs added or changed since then (the Library page during an import), read
  // through the updated_at index (migration 0035) instead of the whole library
  const since = Number(request.nextUrl.searchParams.get("since"));
  const changedSince = Number.isFinite(since) && since > 0 ? new Date(since - 5_000) : null;
  const at = Date.now();
  const [v] = await ctx.db.select({ version: radioVersions.version }).from(radioVersions).where(eq(radioVersions.name, "songs"));
  const etag = `W/"songs-v${v?.version ?? 0}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (!changedSince && request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
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
      musicVideo: radioSongs.musicVideo,
      metadataSource: radioSongs.metadataSource,
      audioCheck: radioSongs.audioCheck,
      audioCheckNote: radioSongs.audioCheckNote,
      lyricsSource: radioSongs.lyricsSource,
      lyricsOffsetMs: radioSongs.lyricsOffsetMs,
      analysedAt: radioSongs.analysedAt,
      metaCheckedAt: radioSongs.metaCheckedAt,
      prepError: radioSongs.prepError,
      createdAt: radioSongs.createdAt,
    })
    .from(radioSongs)
    .where(changedSince ? gte(radioSongs.updatedAt, changedSince) : undefined)
    .orderBy(desc(radioSongs.createdAt));
  return NextResponse.json({ songs, at }, { headers: changedSince ? { "Cache-Control": "private, no-store" } : headers });
}
