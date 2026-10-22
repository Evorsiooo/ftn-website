"use client";
import React from "react";
import Link from "next/link";
import { IconTrophy, IconMapPin, IconPlayerPlay } from "@tabler/icons-react";
import type { SportsData, SportsEvent, SportsLeague, SportsTeam } from "@/lib/use-sports-data";
import { parseRaceResults } from "@/lib/sports";
import { CardSurface } from "@/components/ftn/media";
import { Button, Tag } from "@/components/ftn/ui";

const ACCENT = "var(--color-brand)";

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export const fmtDay = (iso: string) => dateFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));

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
    const h = teams.get(e.homeTeamId);
    const a = teams.get(e.awayTeamId);
    return `${h?.name ?? "TBD"} vs ${a?.name ?? "TBD"}`;
  }
  return e.name || "Event";
}

export function indexTeams(data: SportsData) {
  return new Map(data.teams.map((t) => [t.id, t]));
}

export function TeamMark({ team, size = 28 }: { team?: SportsTeam; size?: number }) {
  const style = { width: size, height: size, backgroundColor: team?.color || "var(--color-ftn-surface-2)" };
  if (team?.logoUrl) {
    return <img src={team.logoUrl} alt="" style={style} className="rounded-lg object-cover flex-shrink-0" />;
  }
  return (
    <div
      style={style}
      className="rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
    >
      {(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()}
    </div>
  );
}

export function LeagueMark({ league, size = 40 }: { league: SportsLeague; size?: number }) {
  const style = { width: size, height: size, backgroundColor: league.color || "var(--color-ftn-surface-2)" };
  return league.logoUrl ? (
    <img src={league.logoUrl} alt="" style={style} className="rounded-lg object-cover flex-shrink-0" />
  ) : (
    <div style={style} className="rounded-lg flex items-center justify-center flex-shrink-0">
      <IconTrophy className="h-1/2 w-1/2 text-white" />
    </div>
  );
}

export function LeagueCard({ league, count }: { league: SportsLeague; count: number }) {
  return (
    <CardSurface href={`/plus/sports/${league.slug}`} className="w-56 sm:w-64">
      <div className="h-1.5 w-full" style={{ backgroundColor: league.color || ACCENT }} />
      <div className="p-4 space-y-3">
        <LeagueMark league={league} />
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-ftn-text  line-clamp-2 leading-snug">
            {league.name}
          </h3>
          <div className="text-xs text-ftn-text-3">
            {league.sport} · Season {league.season}
          </div>
        </div>
        <div className="text-xs font-semibold text-brand">{count > 0 ? `${count} upcoming` : "View standings"}</div>
      </div>
    </CardSurface>
  );
}

export function EventCard({
  event,
  league,
  teams,
  showLeague = true,
}: {
  event: SportsEvent;
  league?: SportsLeague;
  teams: Map<string, SportsTeam>;
  showLeague?: boolean;
}) {
  const home = event.homeTeamId ? teams.get(event.homeTeamId) : undefined;
  const away = event.awayTeamId ? teams.get(event.awayTeamId) : undefined;
  const isMatch = !!(event.homeTeamId && event.awayTeamId);
  const final = event.status === "final";
  return (
    <CardSurface href={league ? `/plus/sports/${league.slug}` : undefined} className="w-64 sm:w-72">
      <div className="h-1 w-full" style={{ backgroundColor: league?.color || ACCENT }} />
      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="ftn-eyebrow text-ftn-text-3 truncate">{showLeague ? league?.name : fmtDay(event.startsAt)}</span>
          {event.status !== "scheduled" && <Tag>{final ? (event.overtime ? "Final · OT" : "Final") : event.status}</Tag>}
        </div>
        {isMatch ? (
          <div className="space-y-2">
            {[
              { team: home, score: event.homeScore, win: (event.homeScore ?? 0) > (event.awayScore ?? 0) },
              { team: away, score: event.awayScore, win: (event.awayScore ?? 0) > (event.homeScore ?? 0) },
            ].map((side, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <TeamMark team={side.team} />
                <span className={`flex-1 truncate text-sm ${final && side.win ? "font-bold text-ftn-text" : "text-ftn-text-2"}`}>
                  {side.team?.name ?? "TBD"}
                </span>
                {final && <span className={`ftn-mono text-base ${side.win ? "text-ftn-text font-bold" : "text-ftn-text-3"}`}>{side.score}</span>}
              </div>
            ))}
          </div>
        ) : (
          <h3 className="text-sm font-bold text-ftn-text  line-clamp-2 leading-snug">
            {event.name || "Race"}
          </h3>
        )}
        <div className="space-y-0.5 text-xs text-ftn-text-3">
          {event.venue && (
            <div className="flex items-center gap-1 truncate">
              <IconMapPin className="h-3 w-3 flex-shrink-0" /> {event.venue}
            </div>
          )}
          {!final && (
            <div className="font-semibold text-brand">
              {fmtDay(event.startsAt)} · {fmtTime(event.startsAt)}
            </div>
          )}
        </div>
      </div>
    </CardSurface>
  );
}

// Compact list row used on league pages (schedule + results).
export function EventRow({
  event,
  league,
  teams,
  drivers,
}: {
  event: SportsEvent;
  league: SportsLeague;
  teams: Map<string, SportsTeam>;
  drivers: Map<string, { name: string; teamId: string | null }>;
}) {
  const isMatch = !!(event.homeTeamId && event.awayTeamId);
  const final = event.status === "final";
  const results = !isMatch && final ? parseRaceResults(event.resultsJson).sort((a, b) => a.position - b.position) : [];
  return (
    <div className="rounded-2xl border border-ftn-line bg-ftn-surface p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="w-28 flex-shrink-0">
          <div className="text-xs font-semibold text-brand">{fmtDay(event.startsAt)}</div>
          <div className="text-xs text-ftn-text-3 ftn-mono">{fmtTime(event.startsAt)}</div>
        </div>
        <div className="flex-1 min-w-[12rem] space-y-1">
          {isMatch ? (
            <div className="flex items-center gap-2 text-sm">
              <TeamMark team={teams.get(event.homeTeamId!)} size={22} />
              <span className="text-ftn-text font-semibold truncate">{teams.get(event.homeTeamId!)?.name ?? "TBD"}</span>
              <span className="ftn-mono text-ftn-text-2 px-1">
                {final ? `${event.homeScore} – ${event.awayScore}` : "vs"}
              </span>
              <TeamMark team={teams.get(event.awayTeamId!)} size={22} />
              <span className="text-ftn-text font-semibold truncate">{teams.get(event.awayTeamId!)?.name ?? "TBD"}</span>
              {final && event.overtime && <span className="text-xs font-bold uppercase text-ftn-text-3">OT</span>}
            </div>
          ) : (
            <div className="text-sm font-semibold text-ftn-text">
              {event.round ? `Round ${event.round} · ` : ""}
              {event.name || "Race"}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 text-xs text-ftn-text-3">
            {event.venue && <span>{event.venue}</span>}
            {event.status !== "scheduled" && event.status !== "final" && (
              <span className="uppercase font-bold">{event.status}</span>
            )}
          </div>
        </div>
        {event.videoUrl && (
          <Button href={event.videoUrl} size="sm" hard>
            <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Watch
          </Button>
        )}
      </div>
      {results.length > 0 && (
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 border-t border-ftn-line pt-3 text-xs">
          {results.slice(0, 10).map((r) => {
            const d = drivers.get(r.driverId);
            return (
              <li key={r.driverId} className="flex items-center gap-2">
                <span className="w-5 text-right ftn-mono text-ftn-text-3">{r.status === "dnf" ? "–" : r.position}</span>
                <span className="text-ftn-text truncate">{d?.name ?? "Unknown"}</span>
                <span className="text-ftn-text-3 truncate">{d?.teamId ? teams.get(d.teamId)?.name : ""}</span>
                {r.status === "dnf" && <span className="text-live-ink font-bold">DNF</span>}
                {r.fastestLap && <span className="text-purple-400 font-bold">FL</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function StandingsTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ftn-line bg-ftn-surface">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-ftn-line ftn-eyebrow text-ftn-text-3">
            <th className="px-3 py-2.5 text-left w-10">#</th>
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-ftn-line last:border-0 hover:bg-white/[0.03]">
              <td className="px-3 py-2.5 ftn-mono text-ftn-text-3">{i + 1}</td>
              {cells.map((c, j) => (
                <td key={j} className={`px-3 py-2.5 ${j === 0 ? "text-left text-ftn-text" : "text-right text-ftn-text-2 ftn-mono"} ${j === cells.length - 1 ? "font-bold text-ftn-text" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
