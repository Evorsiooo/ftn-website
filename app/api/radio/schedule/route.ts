import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { loadShowsAndSlots, expandOccurrences } from "@/lib/radio";

export const runtime = "edge";

const DAY_MS = 24 * 60 * 60 * 1000;

// Public: upcoming airings for the next 7 days (UTC ISO timestamps).
export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ schedule: [] });
    const db = getDb(d1);
    const { shows, slots } = await loadShowsAndSlots(db);
    const now = new Date();
    const schedule = expandOccurrences(shows, slots, now, new Date(now.getTime() + 7 * DAY_MS)).map((o) => ({
      slotId: o.slotId,
      tag: o.tag,
      start: o.start.toISOString(),
      end: o.end.toISOString(),
      show: { id: o.show.id, name: o.show.name, presenter: o.show.presenter, description: o.show.description, artUrl: o.show.artUrl },
    }));
    return NextResponse.json(
      { schedule },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("Failed to load radio schedule:", err);
    return NextResponse.json({ schedule: [] });
  }
}
