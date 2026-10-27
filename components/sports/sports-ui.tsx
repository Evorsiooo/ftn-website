"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SportsBroadcast, SportsData, SportsDriver, SportsEvent, SportsLeague, SportsTeam, SportsVenue } from "@/lib/use-sports-data";
import { parseRaceResults } from "@/lib/sports";
import { ArtTile } from "@/components/ftn/media";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- formatting

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export const fmtDay = (iso: string) => dateFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));

/** "in 2d 5h", "in 3h 10m", "in 12 min", "Starting now". */
export function countdown(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Starting now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${h}h ${mins % 60}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

export function eventTitle(e: SportsEvent, teams: Map<string, SportsTeam>): string {
  if (e.homeTeamId && e.awayTeamId) {
    return `${teams.get(e.homeTeamId)?.name ?? "TBD"} vs ${teams.get(e.awayTeamId)?.name ?? "TBD"}`;
  }
  return e.name || "Race";
}

/** "Round 5 · Coastal Pass" for racing rounds, "Home vs Away" for matches. */
export function roundTitle(e: SportsEvent, teams: Map<string, SportsTeam>): string {
  const t = eventTitle(e, teams);
  return e.round && !(e.homeTeamId && e.awayTeamId) ? `Round ${e.round} · ${t}` : t;
}

export const isMatch = (e: SportsEvent) => !!(e.homeTeamId && e.awayTeamId);

export function leagueAbbrev(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w));
  const letters = (words.length > 1 ? words.map((w) => w[0]).join("") : name.slice(0, 3)).toUpperCase();
  return letters.slice(0, 3);
}

// -------------------------------------------------------------------- lookups

export function indexTeams(data: SportsData) {
  return new Map(data.teams.map((t) => [t.id, t]));
}
export const indexVenues = (data: SportsData) => new Map(data.venues.map((v) => [v.id, v]));
export const indexDrivers = (data: SportsData) => new Map(data.drivers.map((d) => [d.id, d]));

/** Photo for an event: its venue's upload, if there is one. */
export const eventPhoto = (e: SportsEvent, venues: Map<string, SportsVenue>) => (e.venueId ? venues.get(e.venueId)?.photoUrl ?? null : null);
export const venueName = (e: SportsEvent, venues: Map<string, SportsVenue>) => (e.venueId ? venues.get(e.venueId)?.name : undefined) ?? e.venue ?? undefined;

/** "Livestream + FTN Radio", "Livestream", "FTN Radio", or null when nothing is scheduled. */
export function broadcastLabel(eventId: string, broadcasts: SportsBroadcast[]): string | null {
  const b = broadcasts.filter((x) => x.sportsEventId === eventId);
  if (b.length === 0) return null;
  const stream = b.some((x) => x.onStream);
  const radio = b.some((x) => x.onRadio);
  return stream && radio ? "Livestream + FTN Radio" : stream ? "Livestream" : "FTN Radio";
}

/** Roblox headshots for the given drivers, keyed by lowercase username. Empty until loaded. */
export function useHeadshots(drivers: SportsDriver[]): Map<string, string> {
  const names = useMemo(
    () => Array.from(new Set(drivers.map((d) => d.robloxUsername).filter((n): n is string => !!n))).sort().join(","),
    [drivers]
  );
  const [shots, setShots] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!names) return;
    let live = true;
    fetch(`/api/sports/headshots?names=${encodeURIComponent(names)}`)
      .then((r) => r.json() as Promise<{ headshots?: Record<string, string> }>)
      .then((j) => live && setShots(new Map(Object.entries(j.headshots ?? {}))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [names]);
  return shots;
}

// ---------------------------------------------------------------------- marks

export function Avatar({ name, src, color, size = 32 }: { name: string; src?: string | null; color?: string | null; size?: number }) {
  const style = { width: size, height: size, backgroundColor: color || "var(--color-ftn-surface-2)" };
  if (src) return <img src={src} alt="" style={style} className="rounded-full object-cover flex-shrink-0" />;
  return (
    <div style={{ ...style, fontSize: Math.round(size * 0.36) }} className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0">
      {name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
    </div>
  );
}

/** Round mark. Near-square logos (full-bleed art) fill and are cropped to the circle; wide or tall logos are contained with a little padding on a neutral disc. Initials on a colour disc are only the fallback. */
function Mark({ logoUrl, color, label, size, fontScale }: { logoUrl?: string | null; color?: string | null; label: string; size: number; fontScale: number }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => setRatio(null), [logoUrl]);
  if (logoUrl) {
    const fill = ratio !== null && ratio >= 0.75 && ratio <= 1.5;
    const pad = fill || ratio === null ? 0 : Math.max(2, Math.round(size * 0.1));
    return (
      <span
        style={{ width: size, height: size, padding: pad }}
        className="inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-ftn-line bg-ftn-surface-2"
      >
        <img
          src={logoUrl}
          alt=""
          ref={(img) => {
            if (img?.complete && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
          }}
          onLoad={(e) => setRatio(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))}
          className={cn("h-full w-full", fill || ratio === null ? "object-cover" : "object-contain")}
        />
      </span>
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color || "var(--color-ftn-surface-2)", fontSize: Math.max(8, Math.round(size * fontScale)) }}
      className="rounded-full flex items-center justify-center font-black text-white flex-shrink-0"
    >
      {label}
    </div>
  );
}

export function TeamMark({ team, size = 28 }: { team?: SportsTeam; size?: number }) {
  return <Mark logoUrl={team?.logoUrl} color={team?.color} label={(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()} size={size} fontScale={0.34} />;
}

export function LeagueMark({ league, size = 40 }: { league: SportsLeague; size?: number }) {
  return <Mark logoUrl={league.logoUrl} color={league.color} label={leagueAbbrev(league.name)} size={size} fontScale={0.28} />;
}

// ------------------------------------------------------------- shared cards
// ResultCard and SlotCard are the hub's cards; Home's Sports lane uses the shared MediaCard instead.

/** A finished event: scoreboard for matches, top three for races. A dark league-colour tile in both themes. */
export function ResultCard({
  event,
  league,
  teams,
  drivers,
  className,
}: {
  event: SportsEvent;
  league?: SportsLeague;
  teams: Map<string, SportsTeam>;
  drivers: Map<string, SportsDriver>;
  className?: string;
}) {
  const match = isMatch(event);
  const top = match
    ? []
    : parseRaceResults(event.resultsJson)
        .filter((r) => r.status === "finished")
        .sort((a, b) => a.position - b.position)
        .slice(0, 3);
  const label = match ? (event.overtime ? "Final · OT" : "Final") : event.round ? `Round ${event.round}` : "Final";
  return (
    <Link
      href={league ? `/plus/sports/${league.slug}?tab=results` : "/plus/sports"}
      style={{ backgroundImage: `linear-gradient(145deg, ${league?.color || "var(--color-ftn-slate)"}, var(--color-ftn-night) 92%)` }}
      className={cn("flex min-h-52 flex-col justify-between rounded-3xl p-5 text-white ftn-shadow transition hover:-translate-y-0.5", className)}
    >
      <div className="flex items-center gap-2">
        {league && <LeagueMark league={league} size={22} />}
        <div className="text-xs font-semibold text-white/80 truncate">
          {league?.name} · {label}
        </div>
      </div>
      {match ? (
        <div className="space-y-1.5">
          {[
            { id: event.homeTeamId!, score: event.homeScore ?? 0, other: event.awayScore ?? 0 },
            { id: event.awayTeamId!, score: event.awayScore ?? 0, other: event.homeScore ?? 0 },
          ].map((side) => (
            <div key={side.id} className={cn("flex items-center justify-between ftn-title text-lg", side.score > side.other ? "text-white" : "text-white/55")}>
              <span className="flex items-center gap-2 min-w-0">
                <TeamMark team={teams.get(side.id)} size={24} />
                <span className="truncate">{teams.get(side.id)?.name ?? "TBD"}</span>
              </span>
              <b className="ftn-display text-2xl">{side.score}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="ftn-display text-2xl leading-tight [text-wrap:balance]">{event.name || "Race"}</div>
          <ol className="text-sm text-white/75 space-y-0.5">
            {top.map((r) => (
              <li key={r.driverId} className="truncate">
                {r.position} {drivers.get(r.driverId)?.name ?? "Unknown"}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Link>
  );
}

/** One upcoming event: time, title, league. The broadcast label is plain text. */
export function SlotCard({
  event,
  league,
  teams,
  tag,
}: {
  event: SportsEvent;
  league?: SportsLeague;
  teams: Map<string, SportsTeam>;
  tag?: string | null;
}) {
  return (
    <Link
      href={league ? `/plus/sports/${league.slug}?tab=calendar` : "/plus/sports"}
      className="grid gap-2 rounded-3xl border border-ftn-line bg-ftn-surface p-5 ftn-shadow transition hover:-translate-y-0.5"
    >
      <span className="ftn-display text-xl">
        {fmtDay(event.startsAt)} <span className="text-ftn-text-2">{fmtTime(event.startsAt)}</span>
      </span>
      <h3 className="text-base font-semibold leading-snug">{roundTitle(event, teams)}</h3>
      <div className="flex items-center gap-2 text-xs text-ftn-text-3">
        {league && <LeagueMark league={league} size={18} />}
        <span className="truncate">{[league?.name, tag].filter(Boolean).join(" · ")}</span>
      </div>
    </Link>
  );
}

export function LeagueCard({ league, meta }: { league: SportsLeague; meta: string }) {
  return (
    <Link
      href={`/plus/sports/${league.slug}`}
      style={{ backgroundImage: `linear-gradient(145deg, ${league.color || "var(--color-ftn-slate)"}, var(--color-ftn-night) 92%)` }}
      className="flex min-h-44 flex-col justify-between rounded-3xl p-5 text-white ftn-shadow transition hover:-translate-y-0.5"
    >
      <LeagueMark league={league} size={44} />
      <div>
        <div className="ftn-title text-lg leading-snug">{league.name}</div>
        <div className="text-xs text-white/70 pt-1">{meta}</div>
      </div>
    </Link>
  );
}

/** Full-bleed hero, same anatomy as Home's billboard. The photo is the venue upload; a league-colour gradient is the fallback. */
export function Billboard({
  photo,
  color,
  children,
  aside,
}: {
  photo?: string | null;
  color?: string | null;
  children: React.ReactNode;
  /** Right-hand slot on wide screens (e.g. the countdown). */
  aside?: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-[72vh] min-h-[500px] max-h-[700px] overflow-hidden select-none text-white">
      {photo ? (
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(135deg, ${color || "var(--color-ftn-slate)"}, var(--color-ftn-night) 80%)` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent w-full md:w-3/4" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ftn-bg to-transparent" />
      <div className="relative z-10 h-full flex items-end justify-between gap-10 pb-28 md:pb-24 px-5 md:px-12">
        <div className="max-w-3xl space-y-4">{children}</div>
        {aside && <div className="hidden md:block text-right flex-shrink-0">{aside}</div>}
      </div>
    </div>
  );
}

/** Section heading with an optional "see all" link, as on Home. */
export function SectionHead({ title, sub, href, hrefLabel }: { title: string; sub?: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <h2 className="ftn-title text-2xl sm:text-3xl">
        {title}
        {sub && <small className="ml-2 text-sm font-medium text-ftn-text-3">{sub}</small>}
      </h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-ftn-text-2 hover:text-ftn-text transition">
          {hrefLabel ?? "See all"}
        </Link>
      )}
    </div>
  );
}
