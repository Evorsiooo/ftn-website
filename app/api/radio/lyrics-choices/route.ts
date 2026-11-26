import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { radioSongs } from "@/db/schema";
import type { LyricsChoice, LyricsSource } from "@/lib/radio/lyrics-choice";

export const runtime = "edge";

const TTL_SECONDS = 60;

/**
 * The lyrics choices made in the admin, for listeners' browsers: { choices: { [song file]: { source, offsetMs } } },
 * only for songs that have one (a provider picked, "none", or an offset). Kept in the edge cache for a minute
 * like the library, so a change reaches listeners within a minute.
 */
export async function GET(request: NextRequest) {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(new URL("/api/radio/lyrics-choices", request.url).toString());
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit && Date.now() - Number(hit.headers.get("x-cached-at") || 0) < TTL_SECONDS * 1000) return hit;

  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const rows = await getDb(d1)
    .select({ key: radioSongs.r2Key, source: radioSongs.lyricsSource, offsetMs: radioSongs.lyricsOffsetMs })
    .from(radioSongs)
    // written out with a literal 0, exactly as the partial index radio_songs_lyrics_choice_idx (migration 0035):
    // the database then reads only the songs with a choice. With a bound parameter it read the whole library.
    .where(sql`lyrics_source IS NOT NULL OR lyrics_offset_ms <> 0`);
  const choices: Record<string, LyricsChoice> = {};
  for (const r of rows) choices[r.key] = { source: (r.source as LyricsSource) ?? null, offsetMs: r.offsetMs };
  const res = NextResponse.json({ choices }, { headers: { "Cache-Control": `public, max-age=${TTL_SECONDS}`, "x-cached-at": String(Date.now()) } });
  await cache?.put(cacheKey, res.clone()).catch(() => {});
  return res;
}
