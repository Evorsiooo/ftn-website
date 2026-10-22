"use client";
export const runtime = "edge";
import React, { useMemo } from "react";
import { IconTrophy } from "@tabler/icons-react";
import { RadioLane } from "@/components/radio/radio-lane";
import { EventCard, LeagueCard, LeagueMark, countdown, eventTitle, fmtDay, fmtTime, indexTeams } from "@/components/sports/sports-ui";
import { useSportsData } from "@/lib/use-sports-data";

export default function SportsHubPage() {
  const { data, loading, error } = useSportsData();
  const teams = useMemo(() => indexTeams(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);

  const { upcoming, results } = useMemo(() => {
    const now = Date.now();
    const upcoming = data.events.filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000);
    const results = data.events.filter((e) => e.status === "final").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { upcoming, results: results.slice(0, 20) };
  }, [data.events]);

  const next = upcoming[0];
  const nextLeague = next ? leagues.get(next.leagueId) : undefined;

  if (loading) {
    return <div className="min-h-screen bg-neutral-950" />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-white">
      <div className="relative w-full overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#FFBB14]/15 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950" />
        <div className="relative z-10 px-6 md:px-12 pt-20 pb-10 space-y-6 max-w-5xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#FFBB14]">
            <IconTrophy className="h-4 w-4" /> FTN Sports
          </div>
          {next ? (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Next up{nextLeague ? ` · ${nextLeague.name}` : ""}
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">{eventTitle(next, teams)}</h1>
              <p className="text-sm sm:text-lg text-neutral-300">
                {fmtDay(next.startsAt)} at {fmtTime(next.startsAt)} · {countdown(next.startsAt)}
                {next.venue ? ` · ${next.venue}` : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Sports</h1>
              <p className="text-sm text-neutral-400">
                {error ? "Sports could not be loaded right now." : "Nothing scheduled yet. Check back soon."}
              </p>
            </div>
          )}
        </div>
      </div>

      {data.leagues.length > 0 && (
        <RadioLane title="Leagues and series">
          {data.leagues.map((l) => (
            <LeagueCard key={l.id} league={l} count={upcoming.filter((e) => e.leagueId === l.id).length} />
          ))}
        </RadioLane>
      )}

      {upcoming.length > 0 && (
        <RadioLane title="Upcoming">
          {upcoming.slice(0, 20).map((e) => (
            <EventCard key={e.id} event={e} league={leagues.get(e.leagueId)} teams={teams} />
          ))}
        </RadioLane>
      )}

      {results.length > 0 && (
        <RadioLane title="Latest results">
          {results.map((e) => (
            <EventCard key={e.id} event={e} league={leagues.get(e.leagueId)} teams={teams} />
          ))}
        </RadioLane>
      )}
    </div>
  );
}
