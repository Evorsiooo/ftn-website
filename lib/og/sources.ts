// Reads what each link preview card shows from the database. Shared by the pages' metadata and by
// /api/og/pending, so both always agree on a card's key.
import { and, desc, eq, isNotNull, lt, or } from "drizzle-orm";
import type { DbClient } from "@/db";
import { articles, radioReplays, radioShows, sportsLeagues, users, videos } from "@/db/schema";
import { loadShowsAndBroadcasts } from "@/lib/schedule";
import { expandOccurrences, type Occurrence } from "@/lib/schedule-core";
import { articleCard, leagueCard, replayCard, showCard, videoCard, type CardSpec } from "./cards";

const articleFields = {
  id: articles.id,
  title: articles.title,
  category: articles.category,
  coverImageUrl: articles.coverImageUrl,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  authorName: users.displayName,
  authorUsername: users.robloxUsername,
};

export async function articleCardBySlug(db: DbClient, slug: string): Promise<CardSpec | null> {
  const rows = await db
    .select(articleFields)
    .from(articles)
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);
  return rows[0] ? articleCard(rows[0]) : null;
}

export async function videoCardById(db: DbClient, id: string): Promise<CardSpec | null> {
  const rows = await db.select().from(videos).where(or(eq(videos.youtubeId, id), eq(videos.id, id))).limit(1);
  return rows[0] ? videoCard(rows[0]) : null;
}

export async function leagueBySlug(db: DbClient, slug: string) {
  const rows = await db.select().from(sportsLeagues).where(eq(sportsLeagues.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function replayById(db: DbClient, id: string) {
  const rows = await db
    .select({ r: radioReplays, showName: radioShows.name, presenter: radioShows.presenter, showArt: radioShows.artUrl })
    .from(radioReplays)
    .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
    .where(and(eq(radioReplays.id, id), eq(radioReplays.hidden, false)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    title: row.r.title,
    card: row.r.endedAt
      ? replayCard({ id: row.r.id, title: row.r.title, presenter: row.presenter, artUrl: row.r.artUrl ?? row.showArt, startedAt: row.r.startedAt, endedAt: row.r.endedAt })
      : null,
  };
}

/** Radio shows (not livestreams) on air at `at`, or starting within `aheadMs` of it. */
async function radioSlots(db: DbClient, at: Date, aheadMs: number): Promise<Occurrence[]> {
  const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
  return expandOccurrences(shows, broadcasts, new Date(at.getTime() - 12 * 3600_000), new Date(at.getTime() + aheadMs), false).filter(
    (o) => o.onRadio && o.end > at && o.start <= new Date(at.getTime() + aheadMs)
  );
}

/** The show on FTN Radio right now, if any. */
export async function currentRadioShow(db: DbClient, at = new Date()): Promise<Occurrence | null> {
  const slots = await radioSlots(db, at, 0);
  return slots.find((o) => o.start <= at && o.end > at) ?? null;
}

/** Every card that should exist now. The list stays small: a few hundred rows at most. */
export async function allCards(db: DbClient): Promise<CardSpec[]> {
  const out: CardSpec[] = [];
  const [articleRows, videoRows, leagueRows, replayRows] = await Promise.all([
    db
      .select(articleFields)
      .from(articles)
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(eq(articles.status, "published"))
      .orderBy(desc(articles.publishedAt))
      .limit(300),
    db.select().from(videos).orderBy(desc(videos.publishedAt)).limit(400),
    db.select().from(sportsLeagues),
    db
      .select({ r: radioReplays, presenter: radioShows.presenter, showArt: radioShows.artUrl })
      .from(radioReplays)
      .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
      .where(and(eq(radioReplays.hidden, false), isNotNull(radioReplays.endedAt), lt(radioReplays.endedAt, new Date())))
      .orderBy(desc(radioReplays.startedAt))
      .limit(100),
  ]);
  for (const a of articleRows) out.push(articleCard(a));
  for (const v of videoRows) out.push(videoCard(v));
  for (const l of leagueRows) out.push(leagueCard(l));
  for (const { r, presenter, showArt } of replayRows)
    out.push(replayCard({ id: r.id, title: r.title, presenter, artUrl: r.artUrl ?? showArt, startedAt: r.startedAt, endedAt: r.endedAt }));
  // shows on air now or in the next 24 hours, drawn ahead so the card is ready when the show starts
  try {
    for (const o of await radioSlots(db, new Date(), 24 * 3600_000)) {
      out.push(showCard(o), showCard(o, true));
    }
  } catch (err) {
    console.error("og: schedule unavailable", err);
  }
  return out;
}
