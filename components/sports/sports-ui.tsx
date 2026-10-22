"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SportsBroadcast, SportsData, SportsDriver, SportsEvent, SportsLeague, SportsTeam, SportsVenue } from "@/lib/use-sports-data";
import { parseRaceResults } from "@/lib/sports";
import { ArtTile } from "@/components/ftn/media";
import { Tag } from "@/components/ftn/ui";
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

const eyebrow = "ftn-eyebrow text-ftn-text-3";

/** A finished event: scoreboard for matches, top three for races. */
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
  const label = match ? (event.overtime ? "Final · OT" : "Final") : event.round ? `R${event.round}` : "Final";
  return (
    <Link
      href={league ? `/plus/sports/${league.slug}?tab=results` : "/plus/sports"}
      className={cn("block rounded-2xl border border-ftn-line bg-ftn-surface px-4 py-3.5 transition hover:border-ftn-line-strong", className)}
    >
      <div className="flex items-center gap-2 mb-2.5">
        {league && <LeagueMark league={league} size={20} />}
        <div className={cn(eyebrow, "truncate")}>
          {league?.name} · {label}
        </div>
      </div>
      {match ? (
        [
          { id: event.homeTeamId!, score: event.homeScore ?? 0, other: event.awayScore ?? 0 },
          { id: event.awayTeamId!, score: event.awayScore ?? 0, other: event.homeScore ?? 0 },
        ].map((side) => (
          <div key={side.id} className="flex items-center justify-between ftn-title text-base">
            <span className={cn("flex items-center gap-2 min-w-0", side.score > side.other ? "text-ftn-text" : "text-ftn-text-3")}>
              <TeamMark team={teams.get(side.id)} size={22} />
              <span className="truncate">{teams.get(side.id)?.name ?? "TBD"}</span>
            </span>
            <b className={cn("ftn-mono text-xl", side.score > side.other ? "text-ftn-text" : "text-ftn-text-3")}>{side.score}</b>
          </div>
        ))
      ) : (
        <>
          <div className="ftn-title text-base leading-snug">{event.name || "Race"}</div>
          <ol className="text-xs text-ftn-text-3 mt-1.5 space-y-0.5">
            {top.map((r) => (
              <li key={r.driverId} className="truncate">
                {r.position} {drivers.get(r.driverId)?.name ?? "Unknown"}
              </li>
            ))}
          </ol>
        </>
      )}
    </Link>
  );
}

/** One upcoming event: time, optional tag, title, league. */
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
      className="grid gap-1.5 rounded-2xl border border-ftn-line bg-ftn-surface px-4 py-3.5 transition hover:border-ftn-line-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ftn-mono text-sm">
          {fmtDay(event.startsAt)} {fmtTime(event.startsAt)}
        </span>
        {tag && <Tag>{tag}</Tag>}
      </div>
      <h3 className="text-sm font-semibold leading-snug">{roundTitle(event, teams)}</h3>
      <div className="flex items-center gap-1.5 text-xs text-ftn-text-3">
        {league && <LeagueMark league={league} size={16} />}
        <span className="ftn-eyebrow text-sports">Sports</span>
        <span className="truncate">{league?.name}</span>
      </div>
    </Link>
  );
}

export function LeagueCard({ league, meta }: { league: SportsLeague; meta: string }) {
  return (
    <Link href={`/plus/sports/${league.slug}`} className="block rounded-2xl border border-ftn-line bg-ftn-surface p-4 transition hover:border-ftn-line-strong">
      <LeagueMark league={league} size={38} />
      <div className="ftn-title text-base mt-3 mb-1 leading-snug">{league.name}</div>
      <div className="text-xs text-ftn-text-3">{meta}</div>
    </Link>
  );
}

/** Full-bleed hero, same anatomy as Home's billboard. The photo is the venue upload; a league-colour gradient is the fallback. */
export function Billboard({
  photo,
  color,
  children,
}: {
  photo?: string | null;
  color?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-[60vh] min-h-[420px] max-h-[560px] overflow-hidden select-none">
      {photo ? (
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(135deg, ${color || "var(--color-ftn-surface-2)"}, var(--color-ftn-bg) 80%)` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ftn-bg via-ftn-bg/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ftn-bg/90 via-ftn-bg/50 to-transparent w-full md:w-3/4" />
      <div className="relative z-10 h-full flex flex-col justify-end pb-16 max-w-4xl space-y-4 px-5 md:px-12">{children}</div>
    </div>
  );
}

/** Section heading with an optional "see all" link, as on Home. */
export function SectionHead({ title, sub, href, hrefLabel }: { title: string; sub?: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3.5">
      <h2 className="ftn-title text-xl sm:text-2xl">
        {title}
        {sub && <small className="ml-2 text-sm font-medium text-ftn-text-3">{sub}</small>}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-ftn-text-2 hover:text-ftn-text transition">
          {hrefLabel ?? "See all"}
        </Link>
      )}
    </div>
  );
}
