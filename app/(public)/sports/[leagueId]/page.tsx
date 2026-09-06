export const runtime = "edge";
import React from "react";
import Link from "next/link";
import { StandingsTable } from "@/components/sports/standings-table";

const SAMPLE_STANDINGS = [
  { rank: 1, name: "Capital City Lumberjacks", playedOrRaces: 14, wins: 11, drawsOrPodiums: 2, lossesOrDnfs: 1, points: 35 },
  { rank: 2, name: "Iron Valley Blades", playedOrRaces: 14, wins: 9, drawsOrPodiums: 3, lossesOrDnfs: 2, points: 30 },
  { rank: 3, name: "Harbor Point Storm", playedOrRaces: 14, wins: 8, drawsOrPodiums: 1, lossesOrDnfs: 5, points: 25 },
];

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
      <Link href="/sports" className="text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition inline-block">
        ← Back to Sports
      </Link>

      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white uppercase">
          {leagueId.replace("-", " ")}
        </h1>
      </div>

      <StandingsTable leagueName={leagueId.replace("-", " ")} standings={SAMPLE_STANDINGS} />
    </div>
  );
}
