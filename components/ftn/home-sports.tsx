"use client";
import { useMemo } from "react";
import {
  broadcastLabel,
  countdown,
  eventPhoto,
  fmtDay,
  fmtTime,
  indexDrivers,
  indexTeams,
  indexVenues,
  isMatch,
  roundTitle,
} from "@/components/sports/sports-ui";
import { parseRaceResults } from "@/lib/sports";
import type { SportsEvent, SportsLeague } from "@/lib/use-sports-data";
import { useSportsData } from "@/lib/use-sports-data";
import { Lane, MediaCard } from "./media";

/** Home's Sports lane: the next event, then the latest results, as video-style cards with the venue photo as thumbnail. Renders nothing without sports data. */
export function HomeSports() {
  const { data, loading } = useSportsData();
  const teams = useMemo(() => indexTeams(data), [data]);
  const drivers = useMemo(() => indexDrivers(data), [data]);
  const venues = useMemo(() => indexVenues(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);

  const items = useMemo(() => {
    const now = Date.now();
    const upcoming = data.events
      .filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    const done = data.events.filter((e) => e.status === "final").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return [...upcoming.slice(0, 1).map((e) => ({ e, next: true })), ...done.slice(0, 5).map((e) => ({ e, next: false }))];
  }, [data.events]);

  if (loading || items.length === 0) return null;

  const summary = (e: SportsEvent) => {
    if (isMatch(e)) {
      return `${teams.get(e.homeTeamId!)?.name ?? "TBD"} ${e.homeScore ?? 0}–${e.awayScore ?? 0} ${teams.get(e.awayTeamId!)?.name ?? "TBD"}${e.overtime ? " (OT)" : ""}`;
    }
    const winner = parseRaceResults(e.resultsJson).find((r) => r.status === "finished" && r.position === 1);
    return winner ? `Winner: ${drivers.get(winner.driverId)?.name ?? "Unknown"}` : "Final";
  };
  const gradient = (l?: SportsLeague) => (
    <div
      className="h-full w-full"
      style={{ backgroundImage: `linear-gradient(135deg, ${l?.color || "var(--color-ftn-surface-2)"}, var(--color-ftn-night) 90%)` }}
    />
  );

  return (
    <Lane title="Sports" href="/plus/sports" hrefLabel="Sports hub">
      {items.map(({ e, next }) => {
        const league = leagues.get(e.leagueId);
        const badge = next ? broadcastLabel(e.id, data.broadcasts) : null;
        return (
          <MediaCard
            key={e.id}
            href={league ? `/plus/sports/${league.slug}?tab=${next ? "calendar" : "results"}` : "/plus/sports"}
            art={eventPhoto(e, venues)}
            fallback={gradient(league)}
            shape="poster"
            title={roundTitle(e, teams)}
            className="w-44 sm:w-52 md:w-56"
          >
            <p>{league?.name}</p>
            <p>{next ? `${countdown(e.startsAt)} · ${fmtDay(e.startsAt)} ${fmtTime(e.startsAt)}${badge ? ` · ${badge}` : ""}` : summary(e)}</p>
          </MediaCard>
        );
      })}
    </Lane>
  );
}
