"use client";
export const runtime = "edge";
import React, { useEffect, useMemo, useState } from "react";
import { IconTrophy } from "@tabler/icons-react";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, Skeleton } from "@/components/ftn/ui";
import {
  Billboard,
  LeagueCard,
  ResultCard,
  SectionHead,
  SlotCard,
  StandingsPreview,
  broadcastLabel,
  countdown,
  eventArt,
  eventPhoto,
  fmtDay,
  fmtTime,
  indexDrivers,
  indexTeams,
  indexVenues,
  roundTitle,
  venueName,
} from "@/components/sports/sports-ui";
import { useSportsData } from "@/lib/use-sports-data";
import { cn } from "@/lib/utils";

const WEEK_MS = 7 * 24 * 3600_000;

export default function SportsHubPage() {
  const { data, loading, error } = useSportsData();
  const teams = useMemo(() => indexTeams(data), [data]);
  const drivers = useMemo(() => indexDrivers(data), [data]);
  const venues = useMemo(() => indexVenues(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);

  // Keeps the countdown honest on a page that stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { upcoming, results } = useMemo(() => {
    const upcoming = data.events.filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000);
    const results = data.events.filter((e) => e.status === "final").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { upcoming, results };
  }, [data.events, now]);

  const next = upcoming[0];
  const nextLeague = next ? leagues.get(next.leagueId) : undefined;
  // The table shown is the league that played most recently.
  const tableLeague = leagues.get(results[0]?.leagueId ?? "") ?? data.leagues[0];
  const thisWeek = upcoming.filter((e) => new Date(e.startsAt).getTime() <= now + WEEK_MS).slice(0, 8);

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="Sports" />
        <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", GUTTER)}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </PageShell>
    );
  }

  const leagueMeta = (id: string) => {
    const l = leagues.get(id);
    if (!l) return "";
    const done = data.events.filter((e) => e.leagueId === id && e.status === "final").length;
    const total = data.events.filter((e) => e.leagueId === id && e.status !== "cancelled").length;
    const unit = l.kind === "racing" ? "Round" : "Played";
    return `${l.sport} · ${total > 0 ? `${unit} ${done} of ${total}` : `Season ${l.season}`}`;
  };

  return (
    <PageShell>
      {next ? (
        <Billboard
          photo={eventPhoto(next, venues)}
          color={nextLeague?.color}
          aside={
            <div className="ftn-display text-6xl lg:text-7xl whitespace-nowrap">{countdown(next.startsAt, now)}</div>
          }
        >
          <p className="text-sm font-semibold text-white/80">
            Next up{nextLeague ? ` · ${nextLeague.name}` : ""}
            {next.round && !(next.homeTeamId && next.awayTeamId) ? ` · Round ${next.round}` : ""}
          </p>
          <h1 className="ftn-display text-4xl sm:text-6xl md:text-7xl line-clamp-3 pb-1 [text-wrap:balance]">
            {next.homeTeamId && next.awayTeamId ? roundTitle(next, teams) : next.name || "Race"}
          </h1>
          <p className="text-sm sm:text-lg text-white/85">
            <span className="md:hidden font-bold">{countdown(next.startsAt, now)} · </span>
            {fmtDay(next.startsAt)} · {fmtTime(next.startsAt)}
            {venueName(next, venues) ? ` · ${venueName(next, venues)}` : ""}
            {broadcastLabel(next.id, data.broadcasts) ? ` · ${broadcastLabel(next.id, data.broadcasts)}` : ""}
          </p>
          <div className="pt-3">
            {nextLeague && (
              <Button href={`/plus/sports/${nextLeague.slug}?tab=calendar`} size="lg">
                View round
              </Button>
            )}
          </div>
        </Billboard>
      ) : (
        <PageHeader
          title="Sports"
          subtitle={error ? "Sports could not be loaded right now." : "Nothing scheduled right now. Latest results are below."}
        />
      )}

      <div className={cn("space-y-12", next && "-mt-12 relative z-10")}>
        {data.leagues.length > 0 && (
          <section className={GUTTER}>
            <SectionHead title="Leagues and series" />
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {data.leagues.map((l) => (
                <LeagueCard key={l.id} league={l} meta={leagueMeta(l.id)} />
              ))}
            </div>
          </section>
        )}

        {thisWeek.length > 0 && (
          <section className={GUTTER}>
            <SectionHead title="This week" sub="your local time" href="/plus/schedule" hrefLabel="Full schedule" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {thisWeek.map((e) => (
                <SlotCard
                  key={e.id}
                  event={e}
                  league={leagues.get(e.leagueId)}
                  teams={teams}
                  art={eventArt(e, venues, leagues.get(e.leagueId))}
                  tag={broadcastLabel(e.id, data.broadcasts)}
                />
              ))}
            </div>
          </section>
        )}

        {results.length > 0 && (
          <section className={GUTTER}>
            <SectionHead title="Latest results" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {results.slice(0, 4).map((e) => (
                <ResultCard
                  key={e.id}
                  event={e}
                  league={leagues.get(e.leagueId)}
                  teams={teams}
                  drivers={drivers}
                  art={eventArt(e, venues, leagues.get(e.leagueId))}
                />
              ))}
            </div>
          </section>
        )}

        {tableLeague && results.length > 0 && (
          <section className={GUTTER}>
            <StandingsPreview league={tableLeague} data={data} teams={teams} drivers={drivers} />
          </section>
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
