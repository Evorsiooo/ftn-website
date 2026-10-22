import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { loadShowsAndBroadcasts, expandOccurrences, serializeOccurrence } from "@/lib/schedule";

export const runtime = "edge";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 35;

// Public: airings (radio and livestreams) between ?from and ?to (ISO). Defaults to the next 7 days.
export async function GET(request: NextRequest) {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ schedule: [] });
    const params = request.nextUrl.searchParams;
    const now = new Date();
    let from = new Date(params.get("from") || "");
    if (isNaN(from.getTime())) from = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let to = new Date(params.get("to") || "");
    if (isNaN(to.getTime()) || to <= from) to = new Date(from.getTime() + 7 * DAY_MS);
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) to = new Date(from.getTime() + MAX_RANGE_DAYS * DAY_MS);

    const { shows, broadcasts } = await loadShowsAndBroadcasts(getDb(d1));
    const schedule = expandOccurrences(shows, broadcasts, from, to).map(serializeOccurrence);
    return NextResponse.json(
      { schedule },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("Failed to load schedule:", err);
    return NextResponse.json({ schedule: [] });
  }
}
