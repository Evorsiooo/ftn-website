"use client";
export const runtime = "edge";
import React from "react";
import { Tabs } from "@/components/ui/tabs";
import { StandingsTable } from "@/components/sports/standings-table";
import { FeaturedMatchCard, SeasonTimeline } from "@/components/sports/fixture-card";

const HOCKEY_STANDINGS = [
  { rank: 1, name: "Capital City Lumberjacks", playedOrRaces: 14, wins: 11, drawsOrPodiums: 2, lossesOrDnfs: 1, points: 35 },
  { rank: 2, name: "Iron Valley Blades", playedOrRaces: 14, wins: 9, drawsOrPodiums: 3, lossesOrDnfs: 2, points: 30 },
  { rank: 3, name: "Harbor Point Storm", playedOrRaces: 14, wins: 8, drawsOrPodiums: 1, lossesOrDnfs: 5, points: 25 },
  { rank: 4, name: "Metro City Comets", playedOrRaces: 14, wins: 6, drawsOrPodiums: 2, lossesOrDnfs: 6, points: 20 },
];

const RACING_STANDINGS = [
  { rank: 1, name: "Victor Vance (Apex Motorsport)", playedOrRaces: 6, wins: 3, drawsOrPodiums: 5, lossesOrDnfs: 0, points: 135 },
  { rank: 2, name: "Sarah Lin (Velocity Racing)", playedOrRaces: 6, wins: 2, drawsOrPodiums: 4, lossesOrDnfs: 1, points: 110 },
  { rank: 3, name: "David Sterling (Metro Grand Prix)", playedOrRaces: 6, wins: 1, drawsOrPodiums: 3, lossesOrDnfs: 0, points: 92 },
];

const TIMELINE_DATA = [
  {
    title: "Championship Finals",
    content: (
      <div className="space-y-1 text-xs text-neutral-300">
        <p className="font-bold text-white text-sm">Premier Hockey Cup Grand Final</p>
        <p>Capital City Lumberjacks vs. Iron Valley Blades</p>
      </div>
    ),
  },
  {
    title: "Round 7 Grand Prix",
    content: (
      <div className="space-y-1 text-xs text-neutral-300">
        <p className="font-bold text-white text-sm">District Coastal Speedway 200</p>
        <p>35-lap endurance showdown</p>
      </div>
    ),
  },
  {
    title: "Mid-Season Invitational",
    content: (
      <div className="space-y-1 text-xs text-neutral-300">
        <p className="font-bold text-white text-sm">Regional All-Stars Tournament</p>
        <p>Top 8 municipal teams</p>
      </div>
    ),
  },
];

export default function SportsHubPage() {
  const tabs = [
    {
      title: "Championship Standings",
      value: "standings",
      content: (
        <div className="w-full overflow-hidden relative rounded-2xl p-4 sm:p-8 bg-neutral-900/40 border border-neutral-800 space-y-8">
          <StandingsTable leagueName="Premier Hockey League" standings={HOCKEY_STANDINGS} />
          <StandingsTable leagueName="Formula Apex Cup Series" standings={RACING_STANDINGS} />
        </div>
      ),
    },
    {
      title: "Fixture Calendar",
      value: "calendar",
      content: (
        <div className="w-full overflow-hidden relative rounded-2xl p-4 sm:p-8 bg-neutral-900/40 border border-neutral-800 space-y-6">
          <h3 className="font-bold text-xl text-white">Season Schedule Timeline</h3>
          <SeasonTimeline items={TIMELINE_DATA} />
        </div>
      ),
    },
    {
      title: "Featured Showdowns",
      value: "featured",
      content: (
        <div className="w-full overflow-hidden relative rounded-2xl p-4 sm:p-8 bg-neutral-900/40 border border-neutral-800 grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeaturedMatchCard
            leagueName="Premier Hockey League"
            title="Championship Cup Final Match"
            homeTeam="Lumberjacks"
            awayTeam="Blades"
            scheduledDate={new Date()}
          />
          <FeaturedMatchCard
            leagueName="Formula Apex Cup Series"
            title="Coastal Speedway 200 Grand Prix"
            homeTeam="Coastal Speedway"
            scheduledDate={new Date(Date.now() + 86400000 * 7)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-neutral-900 dark:text-white">
          Sports
        </h1>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
          Championship standings, live broadcast telemetry, and upcoming showdown schedules.
        </p>
      </div>

      <Tabs tabs={tabs} containerClassName="mb-6" />
    </div>
  );
}
