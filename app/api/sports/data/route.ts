import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { sportsDrivers, sportsEvents, sportsLeagues, sportsTeams } from "@/db/schema";

export const runtime = "edge";

// Everything the public FTN+ Sports pages need. Leagues are small, so the client
// filters and computes standings (lib/sports.ts) instead of needing a route per view.
export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ leagues: [], teams: [], drivers: [], events: [] });
    const db = getDb(d1);
    const [leagues, teams, drivers, events] = await Promise.all([
      db.select().from(sportsLeagues).orderBy(asc(sportsLeagues.name)),
      db.select().from(sportsTeams).orderBy(asc(sportsTeams.name)),
      db.select().from(sportsDrivers).orderBy(asc(sportsDrivers.name)),
      db.select().from(sportsEvents).orderBy(asc(sportsEvents.startsAt)).limit(2000),
    ]);
    return NextResponse.json(
      { leagues, teams, drivers, events },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load sports data" }, { status: 500 });
  }
}
