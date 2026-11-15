import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { radioSongs } from "@/db/schema";
import { radioAdmin } from "@/lib/radio/admin-route";

export const runtime = "edge";

// Every song in the radio library, newest first (archived ones included; the page filters).
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
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
  return NextResponse.json({ songs });
}
