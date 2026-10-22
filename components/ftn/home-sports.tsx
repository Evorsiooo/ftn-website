"use client";
import { useMemo } from "react";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { NextUpCard, ResultCard, broadcastLabel, indexDrivers, indexTeams } from "@/components/sports/sports-ui";
import { useSportsData } from "@/lib/use-sports-data";
import { GUTTER } from "./ui";
import { cn } from "@/lib/utils";

/** Home's Sports row: the next event and the latest results. Renders nothing without sports data. */
export function HomeSports() {
  const { data, loading } = useSportsData();
  const teams = useMemo(() => indexTeams(data), [data]);
  const drivers = useMemo(() => indexDrivers(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);

  const { next, results } = useMemo(() => {
    const now = Date.now();
    const upcoming = data.events
      .filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    const results = data.events.filter((e) => e.status === "final").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { next: upcoming[0], results: results.slice(0, 4) };
  }, [data.events]);

  if (loading || (!next && results.length === 0)) return null;

  return (
    <section className={cn("space-y-3.5", GUTTER)}>
      <div className="flex items-end justify-between gap-4">
        <h2 className="ftn-title text-xl sm:text-2xl">Sports</h2>
        <Link href="/plus/sports" className="inline-flex items-center gap-0.5 text-xs text-ftn-text-2 hover:text-ftn-text">
          Sports hub <IconChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
        {next && (
          <NextUpCard event={next} league={leagues.get(next.leagueId)} teams={teams} badge={broadcastLabel(next.id, data.broadcasts)} />
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {results.map((e) => (
            <ResultCard key={e.id} event={e} league={leagues.get(e.leagueId)} teams={teams} drivers={drivers} />
          ))}
        </div>
      </div>
    </section>
  );
}
