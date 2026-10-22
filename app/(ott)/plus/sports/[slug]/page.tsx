"use client";
export const runtime = "edge";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { EventRow, LeagueMark, StandingsTable, TeamMark, indexTeams } from "@/components/sports/sports-ui";
import { useSportsData } from "@/lib/use-sports-data";
import {
  computeRacingStandings,
  computeTeamStandings,
  parseRules,
  type RacingRules,
  type TeamRules,
} from "@/lib/sports";

type Tab = "schedule" | "results" | "standings";

const tabClass = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-xs font-bold transition cursor-pointer ${
    active ? "bg-brand text-black" : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white"
  }`;

export default function LeaguePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading } = useSportsData();
  const [tab, setTab] = useState<Tab>("schedule");
  const [racingView, setRacingView] = useState<"drivers" | "constructors">("drivers");

  const league = data.leagues.find((l) => l.slug === slug);
  const teams = useMemo(() => indexTeams(data), [data]);
  const drivers = useMemo(() => new Map(data.drivers.map((d) => [d.id, d])), [data.drivers]);
  const events = useMemo(() => data.events.filter((e) => e.leagueId === league?.id), [data.events, league?.id]);

  const { schedule, results } = useMemo(() => {
    const schedule = events.filter((e) => e.status !== "final" && e.status !== "cancelled");
    const results = events.filter((e) => e.status === "final").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { schedule, results };
  }, [events]);

  const standings = useMemo(() => {
    if (!league) return null;
    const rules = parseRules(league.kind, league.rulesJson);
    const leagueTeams = data.teams.filter((t) => t.leagueId === league.id);
    if (league.kind === "team") {
      return { kind: "team" as const, rows: computeTeamStandings(leagueTeams.map((t) => t.id), events, rules as TeamRules) };
    }
    const leagueDrivers = data.drivers.filter((d) => d.leagueId === league.id);
    return {
      kind: "racing" as const,
      ...computeRacingStandings(leagueDrivers, leagueTeams.map((t) => t.id), events, rules as RacingRules),
    };
  }, [league, data.teams, data.drivers, events]);

  if (loading) return <div className="min-h-screen bg-neutral-950" />;

  if (!league) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-8 text-center text-white">
        <div className="space-y-3">
          <h1 className="text-2xl font-black">League not found</h1>
          <Link href="/plus/sports" className="text-xs text-brand hover:underline">Back to Sports</Link>
        </div>
      </div>
    );
  }

  const teamLabel = (id: string | null) => {
    const t = id ? teams.get(id) : undefined;
    return (
      <span className="inline-flex items-center gap-2">
        <TeamMark team={t} size={20} />
        {t?.name ?? "–"}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-white">
      <div className="px-6 md:px-12 pt-20 pb-6 space-y-5">
        <Link href="/plus/sports" className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-white transition">
          <IconArrowLeft className="h-3.5 w-3.5" /> Sports
        </Link>
        <div className="flex items-center gap-4">
          <LeagueMark league={league} size={56} />
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">{league.name}</h1>
            <p className="text-xs text-neutral-400 mt-0.5">{league.sport} · Season {league.season}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={tabClass(tab === "schedule")} onClick={() => setTab("schedule")}>Schedule</button>
          <button className={tabClass(tab === "results")} onClick={() => setTab("results")}>Results</button>
          <button className={tabClass(tab === "standings")} onClick={() => setTab("standings")}>Standings</button>
        </div>
      </div>

      <div className="px-6 md:px-12 space-y-3 max-w-5xl">
        {tab === "schedule" &&
          (schedule.length === 0 ? (
            <p className="text-sm text-neutral-400">No upcoming events.</p>
          ) : (
            schedule.map((e) => <EventRow key={e.id} event={e} league={league} teams={teams} drivers={drivers} />)
          ))}

        {tab === "results" &&
          (results.length === 0 ? (
            <p className="text-sm text-neutral-400">No results yet.</p>
          ) : (
            results.map((e) => <EventRow key={e.id} event={e} league={league} teams={teams} drivers={drivers} />)
          ))}

        {tab === "standings" && standings?.kind === "team" && (
          standings.rows.length === 0 ? (
            <p className="text-sm text-neutral-400">No teams yet.</p>
          ) : (
            <StandingsTable
              headers={["Team", "P", "W", "D", "L", "OTL", "GF", "GA", "GD", "Pts"]}
              rows={standings.rows.map((r) => [
                teamLabel(r.teamId), r.played, r.wins, r.draws, r.losses, r.overtimeLosses,
                r.goalsFor, r.goalsAgainst, r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff, r.points,
              ])}
            />
          )
        )}

        {tab === "standings" && standings?.kind === "racing" && (
          <>
            <div className="flex gap-2">
              <button className={tabClass(racingView === "drivers")} onClick={() => setRacingView("drivers")}>Drivers</button>
              <button className={tabClass(racingView === "constructors")} onClick={() => setRacingView("constructors")}>Constructors</button>
            </div>
            {racingView === "drivers" ? (
              <StandingsTable
                headers={["Driver", "Team", "Races", "Wins", "Podiums", "DNF", "Pts"]}
                rows={standings.drivers.map((r) => [
                  drivers.get(r.driverId)?.name ?? "Unknown", teamLabel(r.teamId), r.races, r.wins, r.podiums, r.dnfs, r.points,
                ])}
              />
            ) : (
              <StandingsTable
                headers={["Constructor", "Wins", "Podiums", "Pts"]}
                rows={standings.constructors.map((r) => [teamLabel(r.teamId), r.wins, r.podiums, r.points])}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
