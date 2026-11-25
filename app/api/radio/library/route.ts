import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { playableSongsJson } from "@/lib/radio/library";

export const runtime = "edge";

const TTL_SECONDS = 60;

/**
 * The songs the AutoDJ may play (every song not archived), for listeners' browsers:
 * { songs: [{ key, title, artist, durationSec, loudnessDb, thumbnail }] }. Kept in the edge cache
 * for a minute so listeners don't each cost a database read. On a cache miss the list comes from a
 * snapshot in R2 (playableSongsJson): the edge cache is per data centre, so each miss used to read the
 * whole song table. The snapshot's text is passed through as it is, never parsed.
 */
export async function GET(request: NextRequest) {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(new URL("/api/radio/library", request.url).toString());
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  // checked by hand as well: the cache doesn't always drop entries on time
  if (hit && Date.now() - Number(hit.headers.get("x-cached-at") || 0) < TTL_SECONDS * 1000) return hit;

  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return Response.json({ error: "Database unavailable" }, { status: 500 });
  const body = `{"songs":${await playableSongsJson(getDb(d1))}}`;
  const res = new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL_SECONDS}`, "x-cached-at": String(Date.now()) },
  });
  await cache?.put(cacheKey, res.clone()).catch(() => {});
  return res;
}
