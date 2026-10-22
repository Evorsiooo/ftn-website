"use client";
import React from "react";
import Link from "next/link";
import { IconTrophy, IconMapPin, IconPlayerPlay } from "@tabler/icons-react";
import type { SportsData, SportsEvent, SportsLeague, SportsTeam } from "@/lib/use-sports-data";
import { parseRaceResults } from "@/lib/sports";

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
  const style = { width: size, height: size, backgroundColor: team?.color || "#262626" };
  if (team?.logoUrl) {
    return <img src={team.logoUrl} alt="" style={style} className="rounded-md object-cover flex-shrink-0" />;
  }
  return (
    <div
      style={style}
      className="rounded-md flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
    >
      {(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()}
    </div>
  );
}

export function LeagueMark({ league, size = 40 }: { league: SportsLeague; size?: number }) {
  const style = { width: size, height: size, backgroundColor: league.color || "#262626" };
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
    <Link
      href={`/plus/sports/${league.slug}`}
      className="group relative flex-shrink-0 w-56 sm:w-64 overflow-hidden rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition duration-300"
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: league.color || ACCENT }} />
      <div className="p-4 space-y-3">
        <LeagueMark league={league} />
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-neutral-200 group-hover:text-white line-clamp-2 leading-snug">
            {league.name}
          </h3>
          <div className="text-[11px] text-neutral-400">
            {league.sport} · Season {league.season}
          </div>
        </div>
        <div className="text-[11px] font-semibold" style={{ color: ACCENT }}>
          {count > 0 ? `${count} upcoming` : "View standings"}
        </div>
      </div>
    </Link>
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
    <Link
      href={league ? `/plus/sports/${league.slug}` : "#"}
      className="group relative flex-shrink-0 w-64 sm:w-72 overflow-hidden rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition duration-300 flex flex-col"
    >
      <div className="h-1 w-full" style={{ backgroundColor: league?.color || ACCENT }} />
      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="text-neutral-400 truncate">{showLeague ? league?.name : fmtDay(event.startsAt)}</span>
          {event.status !== "scheduled" && (
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-white">
              {final ? (event.overtime ? "Final · OT" : "Final") : event.status}
            </span>
          )}
        </div>
        {isMatch ? (
          <div className="space-y-2">
            {[
              { team: home, score: event.homeScore, win: (event.homeScore ?? 0) > (event.awayScore ?? 0) },
              { team: away, score: event.awayScore, win: (event.awayScore ?? 0) > (event.homeScore ?? 0) },
            ].map((side, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <TeamMark team={side.team} />
                <span className={`flex-1 truncate text-sm ${final && side.win ? "font-bold text-white" : "text-neutral-300"}`}>
                  {side.team?.name ?? "TBD"}
                </span>
                {final && <span className={`font-mono text-base ${side.win ? "text-white font-bold" : "text-neutral-400"}`}>{side.score}</span>}
              </div>
            ))}
          </div>
        ) : (
          <h3 className="text-sm font-bold text-neutral-200 group-hover:text-white line-clamp-2 leading-snug">
            {event.name || "Race"}
          </h3>
        )}
        <div className="space-y-0.5 text-[11px] text-neutral-400">
          {event.venue && (
            <div className="flex items-center gap-1 truncate">
              <IconMapPin className="h-3 w-3 flex-shrink-0" /> {event.venue}
            </div>
          )}
          {!final && (
            <div className="font-semibold" style={{ color: ACCENT }}>
              {fmtDay(event.startsAt)} · {fmtTime(event.startsAt)}
            </div>
          )}
        </div>
      </div>
    </Link>
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
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="w-28 flex-shrink-0">
          <div className="text-xs font-semibold" style={{ color: ACCENT }}>{fmtDay(event.startsAt)}</div>
          <div className="text-[11px] text-neutral-400">{fmtTime(event.startsAt)}</div>
        </div>
        <div className="flex-1 min-w-[12rem] space-y-1">
          {isMatch ? (
            <div className="flex items-center gap-2 text-sm">
              <TeamMark team={teams.get(event.homeTeamId!)} size={22} />
              <span className="text-white font-semibold truncate">{teams.get(event.homeTeamId!)?.name ?? "TBD"}</span>
              <span className="font-mono text-neutral-300 px-1">
                {final ? `${event.homeScore} – ${event.awayScore}` : "vs"}
              </span>
              <TeamMark team={teams.get(event.awayTeamId!)} size={22} />
              <span className="text-white font-semibold truncate">{teams.get(event.awayTeamId!)?.name ?? "TBD"}</span>
              {final && event.overtime && <span className="text-[10px] font-bold uppercase text-neutral-400">OT</span>}
            </div>
          ) : (
            <div className="text-sm font-semibold text-white">
              {event.round ? `Round ${event.round} · ` : ""}
              {event.name || "Race"}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
            {event.venue && <span>{event.venue}</span>}
            {event.status !== "scheduled" && event.status !== "final" && (
              <span className="uppercase font-bold">{event.status}</span>
            )}
          </div>
        </div>
        {event.videoUrl && (
          <a
            href={event.videoUrl}
            className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-black hover:bg-brand-hover transition"
          >
            <IconPlayerPlay className="h-3 w-3" /> Watch
          </a>
        )}
      </div>
      {results.length > 0 && (
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 border-t border-neutral-800 pt-3 text-xs">
          {results.slice(0, 10).map((r) => {
            const d = drivers.get(r.driverId);
            return (
              <li key={r.driverId} className="flex items-center gap-2">
                <span className="w-5 text-right font-mono text-neutral-400">{r.status === "dnf" ? "–" : r.position}</span>
                <span className="text-neutral-200 truncate">{d?.name ?? "Unknown"}</span>
                <span className="text-neutral-500 truncate">{d?.teamId ? teams.get(d.teamId)?.name : ""}</span>
                {r.status === "dnf" && <span className="text-red-400 font-bold">DNF</span>}
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
    <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-400">
            <th className="px-3 py-2.5 text-left w-10">#</th>
            {headers.map((h, i) => (
              <th key={h} className={`px-3 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-800/30">
              <td className="px-3 py-2.5 font-mono text-neutral-400">{i + 1}</td>
              {cells.map((c, j) => (
                <td key={j} className={`px-3 py-2.5 ${j === 0 ? "text-left text-neutral-100" : "text-right text-neutral-300 font-mono"} ${j === cells.length - 1 ? "font-bold text-white" : ""}`}>
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
