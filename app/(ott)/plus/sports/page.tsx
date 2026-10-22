"use client";
export const runtime = "edge";
import React, { useMemo } from "react";
import { IconTrophy } from "@tabler/icons-react";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { EmptyState, GUTTER } from "@/components/ftn/ui";
import { Lane, LaneSkeleton } from "@/components/ftn/media";
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
    return (
      <PageShell>
        <PageHeader eyebrow="FTN Sports" title="Sports" />
        <LaneSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {next ? (
        <PageHeader
          eyebrow={
            <>
              <IconTrophy className="h-4 w-4" /> FTN Sports · Next up{nextLeague ? ` · ${nextLeague.name}` : ""}
            </>
          }
          title={eventTitle(next, teams)}
          subtitle={`${fmtDay(next.startsAt)} at ${fmtTime(next.startsAt)} · ${countdown(next.startsAt)}${next.venue ? ` · ${next.venue}` : ""}`}
        />
      ) : (
        <PageHeader
          eyebrow={
            <>
              <IconTrophy className="h-4 w-4" /> FTN Sports
            </>
          }
          title="Sports"
          subtitle={error ? "Sports could not be loaded right now." : "Nothing scheduled yet. Check back soon."}
        />
      )}

      <div className="space-y-10">
        {data.leagues.length > 0 && (
          <Lane title="Leagues and series">
            {data.leagues.map((l) => (
              <LeagueCard key={l.id} league={l} count={upcoming.filter((e) => e.leagueId === l.id).length} />
            ))}
          </Lane>
        )}

        {upcoming.length > 0 && (
          <Lane title="Upcoming">
            {upcoming.slice(0, 20).map((e) => (
              <EventCard key={e.id} event={e} league={leagues.get(e.leagueId)} teams={teams} />
            ))}
          </Lane>
        )}

        {results.length > 0 && (
          <Lane title="Latest results">
            {results.map((e) => (
              <EventCard key={e.id} event={e} league={leagues.get(e.leagueId)} teams={teams} />
            ))}
          </Lane>
        )}

        {data.leagues.length === 0 && !error && (
          <div className={GUTTER}>
            <EmptyState icon={<IconTrophy />} title="No leagues yet" description="Leagues and fixtures will appear here once they are set up." />
          </div>
        )}
      </div>
    </PageShell>
  );
}
