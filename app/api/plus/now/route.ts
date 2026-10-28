import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { syncConfiguredTwitchLives } from "@/lib/twitch";
import { EMPTY_PLUS_NOW, loadPlusNow } from "@/lib/plus-now";

export const runtime = "edge";

// Public: a small summary of what is on FTN+ right now (live streams, radio, next broadcast,
// sports), used by the main site's navbar, homepage and article promos. Cached at the edge.
export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json(EMPTY_PLUS_NOW);
    const db = getDb(d1);
    // Refresh Twitch live status after the response; the next refresh picks it up.
    const twitch = syncConfiguredTwitchLives(db).catch((err) => console.warn("Twitch sync error:", err));
    try {
      getRequestContext().ctx.waitUntil(twitch);
    } catch {}
    const data = await loadPlusNow(db);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("Failed to load plus-now:", err);
    return NextResponse.json(EMPTY_PLUS_NOW);
  }
}
