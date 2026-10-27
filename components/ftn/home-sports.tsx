"use client";
import { useMemo } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import {
  ResultCard,
  SportsTile,
  broadcastLabel,
  countdown,
  eventArt,
  fmtDay,
  fmtTime,
  indexDrivers,
  indexTeams,
  indexVenues,
  roundTitle,
} from "@/components/sports/sports-ui";
import type { SportsData, SportsEvent } from "@/lib/use-sports-data";
import { cn } from "@/lib/utils";
import { GUTTER } from "./ui";
import { ArtTile } from "./media";

/** The next scheduled event, then the latest results. Shared by the hero card and the Sports block. */
export function useSportsHighlights(data: SportsData) {
  return useMemo(() => {
    const now = Date.now();
    const next = data.events
      .filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0] as SportsEvent | undefined;
    const results = data.events.filter((e) => e.status === "final").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { next, results };
  }, [data.events]);
}

/** Home's Sports block: a large "next up" tile beside the latest results, all on artwork. Renders nothing without sports data. */
export function HomeSports({ data, loading }: { data: SportsData; loading: boolean }) {
  const teams = useMemo(() => indexTeams(data), [data]);
  const drivers = useMemo(() => indexDrivers(data), [data]);
  const venues = useMemo(() => indexVenues(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);
  const { next, results } = useSportsHighlights(data);

  if (loading || (!next && results.length === 0)) return null;

  const nextLeague = next ? leagues.get(next.leagueId) : undefined;
  const shownResults = results.slice(0, next ? 2 : 3);
  const channel = next ? broadcastLabel(next.id, data.broadcasts) : null;

  return (
    <section className="w-full space-y-4">
      <div className={cn("flex items-end justify-between gap-4", GUTTER)}>
        <h2 className="ftn-title text-2xl sm:text-3xl text-ftn-text">Sports</h2>
        <Link href="/plus/sports" className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-semibold text-ftn-text-2 hover:text-ftn-text">
          Sports hub <IconChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className={cn("grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2", next ? "lg:grid-cols-[2fr_1fr_1fr]" : "lg:grid-cols-3", GUTTER)}>
        {next && (
          <SportsTile
            href={nextLeague ? `/plus/sports/${nextLeague.slug}?tab=calendar` : "/plus/sports"}
            art={eventArt(next, venues, nextLeague)}
            color={nextLeague?.color}
            eyebrow="Next up"
            className="min-h-64 md:col-span-2 lg:col-span-1 lg:min-h-72"
          >
            <div className="ftn-display text-3xl sm:text-4xl lg:text-5xl leading-none [text-wrap:balance]">{roundTitle(next, teams)}</div>
            <div className="text-sm text-white/80 pt-1">
              {[nextLeague?.name, countdown(next.startsAt), `${fmtDay(next.startsAt)} ${fmtTime(next.startsAt)}`, channel].filter(Boolean).join(" · ")}
            </div>
          </SportsTile>
        )}
        {shownResults.map((e) => (
          <ResultCard
            key={e.id}
            event={e}
            league={leagues.get(e.leagueId)}
            teams={teams}
            drivers={drivers}
            art={eventArt(e, venues, leagues.get(e.leagueId))}
            className="lg:min-h-72"
          />
        ))}
      </div>
    </section>
  );
}

/** Next sports event as a glass card in the hero, beside the on-air card. */
export function SportsGlass({ data }: { data: SportsData }) {
  const teams = useMemo(() => indexTeams(data), [data]);
  const venues = useMemo(() => indexVenues(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);
  const { next } = useSportsHighlights(data);
  if (!next) return null;
  const league = leagues.get(next.leagueId);
  const channel = broadcastLabel(next.id, data.broadcasts);
  return (
    <Link
      href={league ? `/plus/sports/${league.slug}?tab=calendar` : "/plus/sports"}
      className="flex items-center gap-4 rounded-3xl p-3 pr-4 border bg-black/45 backdrop-blur-xl border-white/15 text-white"
    >
      <ArtTile
        src={eventArt(next, venues, league)}
        fallback={<div className="h-full w-full" style={{ backgroundImage: `linear-gradient(145deg, ${league?.color || "var(--color-ftn-slate)"}, var(--color-ftn-night) 92%)` }} />}
        className="h-16 w-16 flex-shrink-0 rounded-2xl"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-xs font-semibold text-white/70">
          Sports · {fmtTime(next.startsAt)}
        </div>
        <div className="ftn-title text-base truncate">{roundTitle(next, teams)}</div>
        <div className="text-xs text-white/70 truncate">{[league?.name, channel].filter(Boolean).join(" · ")}</div>
      </div>
    </Link>
  );
}
