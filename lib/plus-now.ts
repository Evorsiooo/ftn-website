import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { DbClient } from "@/db";
import { siteSettings, sportsEvents, sportsLeagues, sportsTeams, videos } from "@/db/schema";
import { EMPTY_PLUS_NOW, type PlusNow, type PlusNowSportsEvent } from "@/lib/plus-now-types";
import { expandOccurrences, loadShowsAndBroadcasts, resolveCurrentAndNext } from "@/lib/schedule";

export * from "@/lib/plus-now-types";

const HOUR_MS = 60 * 60 * 1000;

async function hiddenVideoIds(db: DbClient): Promise<Set<string>> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "main_config")).limit(1);
  try {
    const ids = rows.length ? JSON.parse(rows[0].valueJson).hiddenVideoIds : [];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

// A small, cached summary of what is happening on FTN+, for the main site's promos.
// Every part is optional: a failing source just leaves its field empty.
export async function loadPlusNow(db: DbClient, now: Date = new Date()): Promise<PlusNow> {
  const out: PlusNow = { ...EMPTY_PLUS_NOW, live: [] };

  const live = async () => {
    const [rows, hidden] = await Promise.all([
      db.select().from(videos).where(eq(videos.isLive, true)).orderBy(desc(videos.publishedAt)).limit(5),
      hiddenVideoIds(db),
    ]);
    out.live = rows
      .filter((v) => !hidden.has(v.youtubeId) && !hidden.has(v.id))
      .slice(0, 3)
      .map((v) => ({ id: v.youtubeId, title: v.title, thumbnailUrl: v.thumbnailUrl, channelTitle: v.channelTitle }));
  };

  const schedule = async () => {
    const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
    const { current } = resolveCurrentAndNext(shows, broadcasts, now);
    if (current?.show) {
      out.radio = { show: current.show.name, presenter: current.show.presenter, artUrl: current.show.artUrl };
    }
    const nextOcc = expandOccurrences(shows, broadcasts, now, new Date(now.getTime() + 24 * HOUR_MS), false).find(
      (o) => o.start > now
    );
    if (nextOcc) {
      out.next = {
        title: nextOcc.title,
        start: nextOcc.start.toISOString(),
        onRadio: nextOcc.onRadio,
        onStream: nextOcc.onStream,
        youtubeId: nextOcc.youtubeId,
      };
    }
  };

  const sports = async () => {
    const [leagues, teams] = await Promise.all([db.select().from(sportsLeagues), db.select().from(sportsTeams)]);
    const leagueById = new Map(leagues.map((l) => [l.id, l]));
    const teamName = new Map(teams.map((t) => [t.id, t.shortName || t.name]));
    const toEvent = (e: typeof sportsEvents.$inferSelect): PlusNowSportsEvent | null => {
      const league = leagueById.get(e.leagueId);
      if (!league) return null;
      return {
        leagueSlug: league.slug,
        leagueName: league.name,
        kind: league.kind,
        label: e.name || (e.round ? `Round ${e.round}` : league.name),
        home: e.homeTeamId ? teamName.get(e.homeTeamId) ?? null : null,
        away: e.awayTeamId ? teamName.get(e.awayTeamId) ?? null : null,
        homeScore: e.homeScore,
        awayScore: e.awayScore,
        overtime: e.overtime,
        startsAt: e.startsAt.toISOString(),
      };
    };
    const [lastFinal] = await db
      .select()
      .from(sportsEvents)
      .where(eq(sportsEvents.status, "final"))
      .orderBy(desc(sportsEvents.startsAt))
      .limit(1);
    const [nextUp] = await db
      .select()
      .from(sportsEvents)
      .where(and(eq(sportsEvents.status, "scheduled"), gte(sportsEvents.startsAt, now)))
      .orderBy(asc(sportsEvents.startsAt))
      .limit(1);
    out.result = lastFinal ? toEvent(lastFinal) : null;
    out.upcoming = nextUp ? toEvent(nextUp) : null;
  };

  await Promise.all(
    [live, schedule, sports].map((fn) =>
      fn().catch((err) => console.error("plus-now: source failed:", err))
    )
  );
  return out;
}
