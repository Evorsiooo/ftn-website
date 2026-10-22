"use client";
export const runtime = "edge";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { PageShell } from "@/components/ftn/page";
import { Button, Chip, EmptyState, GUTTER } from "@/components/ftn/ui";
import { cn } from "@/lib/utils";
import { EventRow, LeagueMark, StandingsTable, TeamMark, indexTeams } from "@/components/sports/sports-ui";
import { useSportsData } from "@/lib/use-sports-data";
import { usePageTitle } from "@/lib/use-page-title";
import {
  computeRacingStandings,
  computeTeamStandings,
  parseRules,
  type RacingRules,
  type TeamRules,
} from "@/lib/sports";

type Tab = "schedule" | "results" | "standings";

export default function LeaguePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading } = useSportsData();
  const [tab, setTab] = useState<Tab>("schedule");
  const [racingView, setRacingView] = useState<"drivers" | "constructors">("drivers");

  const league = data.leagues.find((l) => l.slug === slug);
  usePageTitle(league ? `${league.name} · Sports` : null);
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

  if (loading) return <PageShell />;

  if (!league) {
    return (
      <PageShell className="flex items-center justify-center p-8">
        <EmptyState
          title="League not found"
          description="This league doesn't exist or is no longer available."
          action={<Button href="/plus/sports">Back to Sports</Button>}
        />
      </PageShell>
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
    <PageShell>
      <div className={cn("pt-14 md:pt-16 pb-6 space-y-5", GUTTER)}>
        <Link href="/plus/sports" className="inline-flex items-center gap-1 text-xs font-semibold text-ftn-text-3 hover:text-ftn-text transition">
          <IconArrowLeft className="h-3.5 w-3.5" /> Sports
        </Link>
        <div className="flex items-center gap-4">
          <LeagueMark league={league} size={56} />
          <div>
            <h1 className="ftn-display text-3xl sm:text-5xl">{league.name}</h1>
            <p className="text-xs text-ftn-text-3 mt-1.5">{league.sport} · Season {league.season}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={tab === "schedule"} onClick={() => setTab("schedule")}>Schedule</Chip>
          <Chip active={tab === "results"} onClick={() => setTab("results")}>Results</Chip>
          <Chip active={tab === "standings"} onClick={() => setTab("standings")}>Standings</Chip>
        </div>
      </div>

      <div className={cn("space-y-3 max-w-5xl", GUTTER)}>
        {tab === "schedule" &&
          (schedule.length === 0 ? (
            <p className="text-sm text-ftn-text-2">No upcoming events.</p>
          ) : (
            schedule.map((e) => <EventRow key={e.id} event={e} league={league} teams={teams} drivers={drivers} />)
          ))}

        {tab === "results" &&
          (results.length === 0 ? (
            <p className="text-sm text-ftn-text-2">No results yet.</p>
          ) : (
            results.map((e) => <EventRow key={e.id} event={e} league={league} teams={teams} drivers={drivers} />)
          ))}

        {tab === "standings" && standings?.kind === "team" && (
          standings.rows.length === 0 ? (
            <p className="text-sm text-ftn-text-2">No teams yet.</p>
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
              <Chip active={racingView === "drivers"} onClick={() => setRacingView("drivers")}>Drivers</Chip>
              <Chip active={racingView === "constructors"} onClick={() => setRacingView("constructors")}>Constructors</Chip>
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
    </PageShell>
  );
}
