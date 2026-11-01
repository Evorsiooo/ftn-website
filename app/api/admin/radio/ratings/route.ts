import { NextRequest, NextResponse } from "next/server";
import { desc, asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { songVotes } from "@/db/schema";
import { canManageRadio } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";

export const runtime = "edge";

// Best and worst rated songs. Ranked by net score (up minus down), ties broken by total votes.
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);

  const up = sql<number>`sum(case when ${songVotes.value} = 1 then 1 else 0 end)`;
  const down = sql<number>`sum(case when ${songVotes.value} = -1 then 1 else 0 end)`;
  const score = sql<number>`sum(${songVotes.value})`;
  const votes = sql<number>`count(*)`;
  const select = {
    artist: sql<string>`max(${songVotes.artist})`,
    title: sql<string>`max(${songVotes.title})`,
    up,
    down,
    score,
    votes,
  };
  const shape = (rows: { artist: string; title: string; up: number; down: number; score: number; votes: number }[]) =>
    rows.map((r) => ({ artist: r.artist, title: r.title, up: Number(r.up), down: Number(r.down), score: Number(r.score), votes: Number(r.votes) }));

  const [best, worst, totals] = await Promise.all([
    db.select(select).from(songVotes).groupBy(songVotes.songKey).having(sql`${score} > 0`).orderBy(desc(score), desc(votes)).limit(25),
    db.select(select).from(songVotes).groupBy(songVotes.songKey).having(sql`${score} < 0`).orderBy(asc(score), desc(votes)).limit(25),
    db.select({ votes: sql<number>`count(*)`, songs: sql<number>`count(distinct ${songVotes.songKey})` }).from(songVotes),
  ]);
  return NextResponse.json({
    best: shape(best),
    worst: shape(worst),
    totalVotes: Number(totals[0]?.votes ?? 0),
    totalSongs: Number(totals[0]?.songs ?? 0),
  });
}
