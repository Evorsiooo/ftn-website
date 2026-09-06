import { DbClient } from "@/db";
import { leagues, fixtures } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface MatchScoreResult {
  homeScore: number;
  awayScore: number;
}

export interface RacePositionResult {
  position: number;
  driver: string;
  team: string;
  points: number;
  fastestLap?: boolean;
  status?: "finished" | "dnf";
}

export interface StandingRow {
  rank: number;
  name: string; // Team or Driver
  playedOrRaces: number;
  wins: number;
  drawsOrPodiums: number;
  lossesOrDnfs: number;
  points: number;
  form?: string[];
}

export async function calculateLeagueStandings(
  db: DbClient,
  leagueId: string
): Promise<StandingRow[]> {
  const leagueList = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  if (leagueList.length === 0) return [];
  const league = leagueList[0];

  const completedFixtures = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.leagueId, leagueId), eq(fixtures.status, "completed")));

  const tableMap = new Map<string, StandingRow>();

  if (league.sportType === "match_based") {
    for (const fix of completedFixtures) {
      if (!fix.resultsJson) continue;
      const res = JSON.parse(fix.resultsJson) as MatchScoreResult;
      const home = fix.homeTeamOrDriver;
      const away = fix.awayTeamOrDriver || "Opponent";

      if (!tableMap.has(home)) {
        tableMap.set(home, { rank: 0, name: home, playedOrRaces: 0, wins: 0, drawsOrPodiums: 0, lossesOrDnfs: 0, points: 0 });
      }
      if (!tableMap.has(away)) {
        tableMap.set(away, { rank: 0, name: away, playedOrRaces: 0, wins: 0, drawsOrPodiums: 0, lossesOrDnfs: 0, points: 0 });
      }

      const hRow = tableMap.get(home)!;
      const aRow = tableMap.get(away)!;
      hRow.playedOrRaces += 1;
      aRow.playedOrRaces += 1;

      if (res.homeScore > res.awayScore) {
        hRow.wins += 1;
        hRow.points += 3;
        aRow.lossesOrDnfs += 1;
      } else if (res.homeScore < res.awayScore) {
        aRow.wins += 1;
        aRow.points += 3;
        hRow.lossesOrDnfs += 1;
      } else {
        hRow.drawsOrPodiums += 1;
        aRow.drawsOrPodiums += 1;
        hRow.points += 1;
        aRow.points += 1;
      }
    }
  } else {
    // Racing Sport Type
    for (const fix of completedFixtures) {
      if (!fix.resultsJson) continue;
      const raceResults = JSON.parse(fix.resultsJson) as RacePositionResult[];
      for (const r of raceResults) {
        if (!tableMap.has(r.driver)) {
          tableMap.set(r.driver, {
            rank: 0,
            name: r.driver,
            playedOrRaces: 0,
            wins: 0,
            drawsOrPodiums: 0,
            lossesOrDnfs: 0,
            points: 0,
          });
        }
        const row = tableMap.get(r.driver)!;
        row.playedOrRaces += 1;
        row.points += r.points;
        if (r.position === 1) row.wins += 1;
        if (r.position <= 3) row.drawsOrPodiums += 1;
        if (r.status === "dnf") row.lossesOrDnfs += 1;
      }
    }
  }

  const sorted = Array.from(tableMap.values()).sort((a, b) => b.points - a.points);
  sorted.forEach((row, i) => {
    row.rank = i + 1;
  });

  return sorted;
}
