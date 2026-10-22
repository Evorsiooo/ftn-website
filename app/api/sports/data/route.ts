import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, broadcasts, sportsDrivers, sportsEvents, sportsLeagues, sportsTeams, sportsVenues } from "@/db/schema";

export const runtime = "edge";

const EMPTY = { leagues: [], teams: [], drivers: [], events: [], venues: [], broadcasts: [], articles: [] };

// Everything the public FTN+ Sports pages need. Leagues are small, so the client
// filters and computes standings (lib/sports.ts) instead of needing a route per view.
export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json(EMPTY);
    const db = getDb(d1);
    const [leagues, teams, drivers, events, venues, linked] = await Promise.all([
      db.select().from(sportsLeagues).orderBy(asc(sportsLeagues.name)),
      db.select().from(sportsTeams).orderBy(asc(sportsTeams.name)),
      db.select().from(sportsDrivers).orderBy(asc(sportsDrivers.name)),
      db.select().from(sportsEvents).orderBy(asc(sportsEvents.startsAt)).limit(2000),
      db.select().from(sportsVenues).orderBy(asc(sportsVenues.name)),
      // Broadcasts that point at a sports event: they drive the Livestream / Radio badges.
      db
        .select({
          sportsEventId: broadcasts.sportsEventId,
          onRadio: broadcasts.onRadio,
          onStream: broadcasts.onStream,
          status: broadcasts.status,
          youtubeId: broadcasts.youtubeId,
        })
        .from(broadcasts)
        .where(and(isNotNull(broadcasts.sportsEventId), eq(broadcasts.status, "scheduled"))),
    ]);
    const articleIds = Array.from(new Set(events.map((e) => e.articleId).filter((id): id is string => !!id)));
    const reports = articleIds.length
      ? await db
          .select({ id: articles.id, slug: articles.slug, title: articles.title })
          .from(articles)
          .where(and(inArray(articles.id, articleIds), eq(articles.status, "published")))
      : [];
    return NextResponse.json(
      { leagues, teams, drivers, events, venues, broadcasts: linked, articles: reports },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load sports data" }, { status: 500 });
  }
}
