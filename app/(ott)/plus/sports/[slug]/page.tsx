"use client";
export const runtime = "edge";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft, IconChevronDown, IconPlayerPlay } from "@tabler/icons-react";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, Segmented, Skeleton } from "@/components/ftn/ui";
import { cn } from "@/lib/utils";
import {
  Avatar,
  LeagueMark,
  TeamMark,
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
  useHeadshots,
  venueName,
} from "@/components/sports/sports-ui";
import { useSportsData, type SportsArticle, type SportsDriver, type SportsEvent, type SportsLeague, type SportsTeam } from "@/lib/use-sports-data";
import {
  computeRacingStandings,
  computeTeamStandings,
  parseRaceResults,
  parseRules,
  racePoints,
  type RacingRules,
  type TeamRules,
} from "@/lib/sports";

type Tab = "overview" | "calendar" | "results" | "standings" | "roster";

export default function LeaguePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading } = useSportsData();
  const [tab, setTabState] = useState<Tab>("overview");
  const [now, setNow] = useState(() => Date.now());

  // The tab lives in the URL (?tab=results) so links from the hub and Home can land on it.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "calendar" || t === "results" || t === "standings" || t === "roster") setTabState(t);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", t === "overview" ? window.location.pathname : `?tab=${t}`);
  };

  const league = data.leagues.find((l) => l.slug === slug);
  const teams = useMemo(() => indexTeams(data), [data]);
  const venues = useMemo(() => indexVenues(data), [data]);
  const driverMap = useMemo(() => indexDrivers(data), [data]);
  const articles = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const leagueTeams = useMemo(() => data.teams.filter((t) => t.leagueId === league?.id), [data.teams, league?.id]);
  const leagueDrivers = useMemo(() => data.drivers.filter((d) => d.leagueId === league?.id), [data.drivers, league?.id]);
  const headshots = useHeadshots(leagueDrivers);
  // data.events arrive in date order.
  const events = useMemo(() => data.events.filter((e) => e.leagueId === league?.id), [data.events, league?.id]);

  const { upcoming, finals } = useMemo(() => {
    const upcoming = events.filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000);
    const finals = events.filter((e) => e.status === "final");
    return { upcoming, finals };
  }, [events, now]);

  const rules = useMemo(() => (league ? parseRules(league.kind, league.rulesJson) : null), [league]);

  if (loading) {
    return (
      <PageShell>
        <PageHeader title=" " />
        <div className={cn("grid gap-3 md:grid-cols-2", GUTTER)}>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </PageShell>
    );
  }

  if (!league || !rules) {
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

  const racing = league.kind === "racing";
  const total = events.filter((e) => e.status !== "cancelled").length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "calendar", label: "Calendar" },
    { id: "results", label: "Results" },
    { id: "standings", label: "Standings" },
    { id: "roster", label: racing ? "Drivers & teams" : "Teams" },
  ];

  const shared = { league, events, teams, venues, drivers: driverMap, articles, headshots, broadcasts: data.broadcasts, now };

  return (
    <PageShell>
      <PageHeader
        back={
          <Link href="/plus/sports" className="inline-flex items-center gap-1 text-xs font-semibold text-ftn-text-3 hover:text-ftn-text transition">
            <IconArrowLeft className="h-3.5 w-3.5" /> Sports
          </Link>
        }
        eyebrow={league.sport}
        title={
          <span className="flex items-center gap-4">
            <LeagueMark league={league} size={52} />
            <span>{league.name}</span>
          </span>
        }
        subtitle={`Season ${league.season}${total > 0 ? ` · ${racing ? "Round" : "Played"} ${finals.length} of ${total}` : ""}`}
      />

      <div role="tablist" className={cn("flex gap-7 border-b border-ftn-line overflow-x-auto", GUTTER)}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition cursor-pointer focus-visible:outline-2 focus-visible:outline-brand",
              tab === t.id ? "text-ftn-text border-brand" : "text-ftn-text-3 border-transparent hover:text-ftn-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={cn("pt-7 max-w-6xl", GUTTER)}>
        {tab === "overview" && <Overview {...shared} upcoming={upcoming} finals={finals} driverCount={leagueDrivers.length} teamCount={leagueTeams.length} onTab={setTab} />}
        {tab === "calendar" && <Calendar {...shared} />}
        {tab === "results" && <Results {...shared} finals={[...finals].reverse()} rules={rules} />}
        {tab === "standings" && <Standings {...shared} finals={finals} leagueTeams={leagueTeams} leagueDrivers={leagueDrivers} rules={rules} />}
        {tab === "roster" && <Roster {...shared} finals={finals} leagueTeams={leagueTeams} leagueDrivers={leagueDrivers} rules={rules} />}
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ shared */

interface Shared {
  league: SportsLeague;
  events: SportsEvent[];
  teams: Map<string, SportsTeam>;
  venues: ReturnType<typeof indexVenues>;
  drivers: Map<string, SportsDriver>;
  articles: Map<string, SportsArticle>;
  headshots: Map<string, string>;
  broadcasts: ReturnType<typeof useSportsData>["data"]["broadcasts"];
  now: number;
}

const card = "rounded-3xl border border-ftn-line bg-ftn-surface ftn-shadow";
const th = "px-3 py-3 ftn-eyebrow text-ftn-text-3 text-right first:text-left";
const td = "px-3 py-3 text-sm text-right first:text-left";

function DataTable({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn(card, "overflow-x-auto")}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-ftn-line">{head}</tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-ftn-line [&>tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}

const headshotFor = (d: SportsDriver | undefined, shots: Map<string, string>) => (d?.robloxUsername ? shots.get(d.robloxUsername.toLowerCase()) ?? null : null);

function DriverName({ d, s, size = 30 }: { d?: SportsDriver; s: Shared; size?: number }) {
  const team = d?.teamId ? s.teams.get(d.teamId) : undefined;
  return (
    <span className="flex items-center gap-3 min-w-0">
      <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: team?.color || "var(--color-ftn-line-strong)" }} />
      <Avatar name={d?.name ?? "?"} src={headshotFor(d, s.headshots)} color={team?.color} size={size} />
      <span className="min-w-0">
        <span className="block font-semibold text-ftn-text truncate">{d?.name ?? "Unknown"}</span>
        {d?.number != null && <span className="block text-xs text-ftn-text-3 ftn-mono">#{d.number}</span>}
      </span>
    </span>
  );
}

function ReportLink({ event, s }: { event: SportsEvent; s: Shared }) {
  const a = event.articleId ? s.articles.get(event.articleId) : undefined;
  return a ? (
    <Link href={`/articles/${a.slug}`} className="inline-flex text-sm font-semibold text-brand-text hover:underline">
      Read the report
    </Link>
  ) : null;
}

function Form({ finishes }: { finishes: (number | null)[] }) {
  return (
    <span className="inline-flex gap-1">
      {finishes.slice(-5).map((f, i) => (
        <i
          key={i}
          className={cn(
            "h-6 w-6 rounded-md inline-flex items-center justify-center ftn-mono text-xs not-italic",
            f === 1 ? "bg-brand text-brand-ink" : f !== null && f <= 3 ? "bg-brand/15 text-brand-text" : "bg-ftn-surface-2 text-ftn-text-2"
          )}
        >
          {f ?? "–"}
        </i>
      ))}
    </span>
  );
}

/** Top finishers (racing) or the scoreboard (matches) for a finished event. */
function Podium({ event, s, count = 3 }: { event: SportsEvent; s: Shared; count?: number }) {
  if (isMatch(event)) {
    return (
      <div className="space-y-2">
        {[
          { id: event.homeTeamId!, score: event.homeScore ?? 0, other: event.awayScore ?? 0 },
          { id: event.awayTeamId!, score: event.awayScore ?? 0, other: event.homeScore ?? 0 },
        ].map((side) => (
          <div key={side.id} className="flex items-center gap-3">
            <TeamMark team={s.teams.get(side.id)} size={28} />
            <span className={cn("flex-1 truncate font-semibold", side.score > side.other ? "text-ftn-text" : "text-ftn-text-3")}>{s.teams.get(side.id)?.name ?? "TBD"}</span>
            <b className={cn("ftn-mono text-xl", side.score > side.other ? "text-ftn-text" : "text-ftn-text-3")}>{side.score}</b>
          </div>
        ))}
        {event.overtime && <div className="ftn-eyebrow text-ftn-text-3">Final · overtime</div>}
      </div>
    );
  }
  const top = parseRaceResults(event.resultsJson)
    .filter((r) => r.status === "finished")
    .sort((a, b) => a.position - b.position)
    .slice(0, count);
  return (
    <ol className="space-y-1.5">
      {top.map((r) => {
        const d = s.drivers.get(r.driverId);
        const team = d?.teamId ? s.teams.get(d.teamId) : undefined;
        return (
          <li key={r.driverId} className="flex items-center gap-3">
            <span className={cn("w-4 ftn-mono text-sm", r.position === 1 ? "text-brand-text" : "text-ftn-text-3")}>{r.position}</span>
            <Avatar name={d?.name ?? "?"} src={headshotFor(d, s.headshots)} color={team?.color} size={28} />
            <span className={cn("truncate", r.position === 1 ? "font-bold text-ftn-text" : "text-ftn-text")}>{d?.name ?? "Unknown"}</span>
            <span className="ml-auto text-xs text-ftn-text-3 truncate">{team?.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview(props: Shared & { upcoming: SportsEvent[]; finals: SportsEvent[]; driverCount: number; teamCount: number; onTab: (t: Tab) => void }) {
  const { league, upcoming, finals, venues, teams, driverCount, teamCount, onTab, now } = props;
  const next = upcoming[0];
  const last = finals[finals.length - 1];
  const racing = league.kind === "racing";
  const winners = new Set(
    finals.map((e) => parseRaceResults(e.resultsJson).find((r) => r.position === 1 && r.status === "finished")?.driverId).filter(Boolean)
  );
  const stats = racing
    ? [
        ["Rounds", `${finals.length} / ${props.events.filter((e) => e.status !== "cancelled").length}`],
        ["Different winners", String(winners.size)],
        ["Drivers", String(driverCount)],
        ["Teams", String(teamCount)],
      ]
    : [
        ["Played", String(finals.length)],
        ["To play", String(upcoming.length)],
        ["Teams", String(teamCount)],
      ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className={cn(card, "overflow-hidden")}>
          {next ? (
            <>
              <div className="h-52 relative" style={eventPhoto(next, venues) ? undefined : { backgroundImage: `linear-gradient(135deg, ${league.color || "var(--color-ftn-surface-2)"}, var(--color-ftn-bg) 85%)` }}>
                {eventPhoto(next, venues) && <img src={eventPhoto(next, venues)!} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="p-5 space-y-2">
                <div className="ftn-eyebrow text-sports">Next{next.round && !isMatch(next) ? ` · Round ${next.round}` : ""}</div>
                <h2 className="ftn-display text-2xl">{isMatch(next) ? roundTitle(next, teams) : next.name || "Race"}</h2>
                <p className="text-sm text-ftn-text-2">
                  {fmtDay(next.startsAt)} · {fmtTime(next.startsAt)}
                  {venueName(next, venues) ? ` · ${venueName(next, venues)}` : ""} · {countdown(next.startsAt, now)}
                </p>
                {broadcastLabel(next.id, props.broadcasts) && <p className="text-sm text-ftn-text-2">{broadcastLabel(next.id, props.broadcasts)}</p>}
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-ftn-text-2">Nothing scheduled right now.</div>
          )}
        </div>

        <div className={cn(card, "p-5 space-y-3")}>
          {last ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="ftn-eyebrow text-ftn-text-3">
                  Latest{last.round && !isMatch(last) ? ` · Round ${last.round}` : ""} · {isMatch(last) ? roundTitle(last, teams) : last.name || "Race"}
                </div>
                <ReportLink event={last} s={props} />
              </div>
              <Podium event={last} s={props} />
              <button onClick={() => onTab("results")} className="text-xs font-semibold text-ftn-text-2 hover:text-ftn-text transition cursor-pointer">
                Full results
              </button>
            </>
          ) : (
            <p className="text-sm text-ftn-text-2">No results yet.</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className={cn(card, "px-4 py-4")}>
            <div className="ftn-eyebrow text-ftn-text-3">{label}</div>
            <div className="ftn-display text-3xl mt-1">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- calendar */

function Calendar(s: Shared) {
  if (s.events.length === 0) return <p className="text-sm text-ftn-text-2">No events scheduled yet.</p>;
  const next = s.events.find((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= s.now - 3 * 3600_000);
  return (
    <div className={cn(card, "overflow-hidden")}>
      {s.events.map((e) => {
        const photo = eventPhoto(e, s.venues);
        const win = e.status === "final" && !isMatch(e) ? parseRaceResults(e.resultsJson).find((r) => r.position === 1 && r.status === "finished") : undefined;
        const b = e.status === "scheduled" ? broadcastLabel(e.id, s.broadcasts) : null;
        return (
          <div key={e.id} className={cn("flex items-center gap-4 px-4 py-3 border-b border-ftn-line last:border-0", next?.id === e.id && "bg-sports/5")}>
            <span className="w-8 ftn-mono text-sm text-ftn-text-3">{e.round ? `R${e.round}` : ""}</span>
            <div className="hidden sm:block w-28 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-ftn-surface-2">
              {photo && <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{isMatch(e) ? roundTitle(e, s.teams) : e.name || "Race"}</div>
              <div className="text-xs text-ftn-text-3 truncate">
                {fmtDay(e.startsAt)} · {fmtTime(e.startsAt)}
                {venueName(e, s.venues) ? ` · ${venueName(e, s.venues)}` : ""}
                {win ? ` · Won by ${s.drivers.get(win.driverId)?.name ?? "Unknown"}` : ""}
                {e.status === "final" && isMatch(e) ? ` · ${e.homeScore}–${e.awayScore}${e.overtime ? " OT" : ""}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {b && <span className="hidden sm:inline text-xs text-ftn-text-3">{b}</span>}
              <ReportLink event={e} s={s} />
              {e.status !== "final" && e.status !== "scheduled" && <span className="text-xs font-semibold text-ftn-text-3 capitalize">{e.status}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- results */

function Results(s: Shared & { finals: SportsEvent[]; rules: RacingRules | TeamRules }) {
  const [open, setOpen] = useState<string | null>(s.finals[0]?.id ?? null);
  if (s.finals.length === 0) return <p className="text-sm text-ftn-text-2">No results yet.</p>;
  const racing = s.league.kind === "racing";
  const points = racing && s.league.scoring === "points";
  return (
    <div className="space-y-3">
      {s.finals.map((e) => {
        const isOpen = open === e.id;
        const rows = !isMatch(e) ? parseRaceResults(e.resultsJson).sort((a, b) => a.position - b.position) : [];
        return (
          <div key={e.id} className={cn(card, "overflow-hidden")}>
            <div className="flex items-center gap-3 px-5 py-4">
              <button onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} className="flex flex-1 items-center gap-3 min-w-0 text-left cursor-pointer">
                <div className="min-w-0 flex-1">
                  <div className="ftn-eyebrow text-ftn-text-3">
                    {e.round && !isMatch(e) ? `Round ${e.round} · ` : ""}
                    {fmtDay(e.startsAt)}
                  </div>
                  <div className="ftn-title text-lg truncate">{isMatch(e) ? roundTitle(e, s.teams) : e.name || "Race"}</div>
                  {!isOpen && (
                    <div className="text-xs text-ftn-text-3 truncate mt-0.5">
                      {isMatch(e)
                        ? `${e.homeScore}–${e.awayScore}${e.overtime ? " OT" : ""}`
                        : rows.filter((r) => r.status === "finished").slice(0, 3).map((r) => `${r.position} ${s.drivers.get(r.driverId)?.name ?? "Unknown"}`).join(" · ")}
                    </div>
                  )}
                </div>
                <IconChevronDown className={cn("h-4 w-4 text-ftn-text-3 transition flex-shrink-0", isOpen && "rotate-180")} />
              </button>
              <ReportLink event={e} s={s} />
              {e.videoUrl && (
                <Button href={e.videoUrl} size="sm" variant="ghost">
                  <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Replay
                </Button>
              )}
            </div>
            {isOpen &&
              (isMatch(e) ? (
                <div className="border-t border-ftn-line px-5 py-4 max-w-md">
                  <Podium event={e} s={s} />
                </div>
              ) : (
                <div className="border-t border-ftn-line overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ftn-line">
                        <th className={th}>Pos</th>
                        <th className={cn(th, "text-left")}>Driver</th>
                        <th className={cn(th, "hidden sm:table-cell")}>Team</th>
                        <th className={th}>Time / gap</th>
                        {points && <th className={th}>Pts</th>}
                      </tr>
                    </thead>
                    <tbody className="[&>tr]:border-b [&>tr]:border-ftn-line [&>tr:last-child]:border-0">
                      {rows.map((r) => {
                        const d = s.drivers.get(r.driverId);
                        const team = d?.teamId ? s.teams.get(d.teamId) : undefined;
                        return (
                          <tr key={r.driverId}>
                            <td className={cn(td, "ftn-mono text-ftn-text-3 w-14")}>{r.status === "finished" ? r.position : "–"}</td>
                            <td className={cn(td, "text-left")}>
                              <DriverName d={d} s={s} />
                            </td>
                            <td className={cn(td, "hidden sm:table-cell text-left text-ftn-text-2")}>{team?.name}</td>
                            <td className={cn(td, "ftn-mono")}>
                              {r.status !== "finished" ? <span className="text-live-ink font-bold uppercase">{r.status}</span> : r.time ?? ""}
                            </td>
                            {points && <td className={cn(td, "ftn-mono font-bold")}>{racePoints(r, s.rules as RacingRules)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- standings */

function Standings(s: Shared & { finals: SportsEvent[]; leagueTeams: SportsTeam[]; leagueDrivers: SportsDriver[]; rules: RacingRules | TeamRules }) {
  const { league, finals, leagueTeams, leagueDrivers, rules } = s;
  const [view, setView] = useState<"drivers" | "constructors">("drivers");
  const racing = league.kind === "racing";

  const racingTable = useMemo(
    () => (racing ? computeRacingStandings(leagueDrivers, leagueTeams.map((t) => t.id), finals, rules as RacingRules, league.scoring) : null),
    [racing, leagueDrivers, leagueTeams, finals, rules, league.scoring]
  );
  const teamTable = useMemo(
    () => (!racing ? computeTeamStandings(leagueTeams.map((t) => t.id), finals, rules as TeamRules) : null),
    [racing, leagueTeams, finals, rules]
  );

  if (teamTable) {
    if (teamTable.length === 0) return <p className="text-sm text-ftn-text-2">No teams yet.</p>;
    return (
      <DataTable
        head={["Team", "P", "W", "D", "L", "OTL", "GF", "GA", "GD", "Pts"].map((h) => (
          <th key={h} className={th}>
            {h}
          </th>
        ))}
      >
        {teamTable.map((r, i) => {
          const t = s.teams.get(r.teamId);
          return (
            <tr key={r.teamId}>
              <td className={td}>
                <span className="flex items-center gap-3">
                  <span className="w-5 ftn-mono text-ftn-text-3">{i + 1}</span>
                  <TeamMark team={t} size={26} />
                  <span className="font-semibold text-ftn-text">{t?.name ?? "Unknown"}</span>
                </span>
              </td>
              {[r.played, r.wins, r.draws, r.losses, r.overtimeLosses, r.goalsFor, r.goalsAgainst, r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff].map((v, j) => (
                <td key={j} className={cn(td, "ftn-mono text-ftn-text-2")}>
                  {v}
                </td>
              ))}
              <td className={cn(td, "ftn-mono font-bold text-ftn-text")}>{r.points}</td>
            </tr>
          );
        })}
      </DataTable>
    );
  }

  if (!racingTable) return null;
  const points = league.scoring === "points";
  const leader = racingTable.drivers[0]?.points ?? 0;
  const note = points
    ? `Points: ${(rules as RacingRules).points.slice(0, 8).join(" · ")}${(rules as RacingRules).points.length > 8 ? " …" : ""}`
    : "No points in this series: ranked by wins, then podiums.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {league.constructors ? (
          <Segmented value={view} onChange={setView} options={[{ id: "drivers", label: "Drivers" }, { id: "constructors", label: "Constructors" }]} />
        ) : (
          <span />
        )}
        <span className="text-xs text-ftn-text-3">{note}</span>
      </div>

      {view === "drivers" || !league.constructors ? (
        racingTable.drivers.length === 0 ? (
          <p className="text-sm text-ftn-text-2">No drivers yet.</p>
        ) : (
          <DataTable
            head={
              <>
                <th className={th}>Pos</th>
                <th className={cn(th, "text-left")}>Driver</th>
                <th className={cn(th, "hidden md:table-cell")}>Team</th>
                <th className={cn(th, "hidden md:table-cell")}>Form</th>
                <th className={th}>Wins</th>
                <th className={th}>Podiums</th>
                {points ? (
                  <>
                    <th className={cn(th, "hidden sm:table-cell")}>Gap</th>
                    <th className={th}>Points</th>
                  </>
                ) : (
                  <>
                    <th className={cn(th, "hidden sm:table-cell")}>Best</th>
                    <th className={cn(th, "hidden sm:table-cell")}>Avg. finish</th>
                  </>
                )}
              </>
            }
          >
            {racingTable.drivers.map((r, i) => {
              const d = s.drivers.get(r.driverId);
              const team = r.teamId ? s.teams.get(r.teamId) : undefined;
              return (
                <tr key={r.driverId}>
                  <td className={cn(td, "ftn-display text-lg text-ftn-text-2 w-14")}>{i + 1}</td>
                  <td className={cn(td, "text-left")}>
                    <DriverName d={d} s={s} />
                  </td>
                  <td className={cn(td, "hidden md:table-cell text-left text-ftn-text-2")}>
                    <span className="flex items-center gap-2">
                      <TeamMark team={team} size={22} /> {team?.name}
                    </span>
                  </td>
                  <td className={cn(td, "hidden md:table-cell")}>
                    <Form finishes={r.finishes} />
                  </td>
                  <td className={cn(td, "ftn-mono")}>{r.wins}</td>
                  <td className={cn(td, "ftn-mono")}>{r.podiums}</td>
                  {points ? (
                    <>
                      <td className={cn(td, "hidden sm:table-cell ftn-mono text-ftn-text-3")}>{i === 0 ? "–" : `−${leader - r.points}`}</td>
                      <td className={cn(td, "ftn-mono font-bold text-ftn-text")}>{r.points}</td>
                    </>
                  ) : (
                    <>
                      <td className={cn(td, "hidden sm:table-cell ftn-mono")}>{r.best ? `P${r.best}` : "–"}</td>
                      <td className={cn(td, "hidden sm:table-cell ftn-mono")}>{r.avgFinish ? r.avgFinish.toFixed(1) : "–"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </DataTable>
        )
      ) : (
        <DataTable
          head={
            <>
              <th className={th}>Pos</th>
              <th className={cn(th, "text-left")}>Constructor</th>
              <th className={th}>Wins</th>
              <th className={th}>Podiums</th>
              {points && <th className={th}>Points</th>}
            </>
          }
        >
          {racingTable.constructors.map((r, i) => {
            const t = s.teams.get(r.teamId);
            return (
              <tr key={r.teamId}>
                <td className={cn(td, "ftn-display text-lg text-ftn-text-2 w-14")}>{i + 1}</td>
                <td className={cn(td, "text-left")}>
                  <span className="flex items-center gap-3">
                    <TeamMark team={t} size={26} />
                    <span className="font-semibold text-ftn-text">{t?.name ?? "Unknown"}</span>
                  </span>
                </td>
                <td className={cn(td, "ftn-mono")}>{r.wins}</td>
                <td className={cn(td, "ftn-mono")}>{r.podiums}</td>
                {points && <td className={cn(td, "ftn-mono font-bold text-ftn-text")}>{r.points}</td>}
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- roster */

function Roster(s: Shared & { finals: SportsEvent[]; leagueTeams: SportsTeam[]; leagueDrivers: SportsDriver[]; rules: RacingRules | TeamRules }) {
  const racing = s.league.kind === "racing";
  const [view, setView] = useState<"drivers" | "teams">(racing ? "drivers" : "teams");
  const wins = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of s.finals) {
      const w = parseRaceResults(e.resultsJson).find((r) => r.position === 1 && r.status === "finished");
      if (w) m.set(w.driverId, (m.get(w.driverId) ?? 0) + 1);
    }
    return m;
  }, [s.finals]);

  return (
    <div className="space-y-5">
      {racing && <Segmented value={view} onChange={setView} options={[{ id: "drivers", label: "Drivers" }, { id: "teams", label: "Teams" }]} />}
      {view === "drivers" && racing ? (
        s.leagueDrivers.length === 0 ? (
          <p className="text-sm text-ftn-text-2">No drivers yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.leagueDrivers.map((d) => {
              const team = d.teamId ? s.teams.get(d.teamId) : undefined;
              const w = wins.get(d.id) ?? 0;
              return (
                <div key={d.id} className={cn(card, "flex items-center gap-4 p-4")}>
                  <Avatar name={d.name} src={headshotFor(d, s.headshots)} color={team?.color} size={56} />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{d.name}</div>
                    <div className="text-xs text-ftn-text-3 truncate">
                      {d.number != null ? `#${d.number} · ` : ""}
                      {team?.name ?? "Independent"}
                    </div>
                    {w > 0 && (
                      <div className="mt-1 text-xs font-semibold text-brand-text">
                        {w} {w === 1 ? "win" : "wins"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : s.leagueTeams.length === 0 ? (
        <p className="text-sm text-ftn-text-2">No teams yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {s.leagueTeams.map((t) => (
            <div key={t.id} className={cn(card, "p-4")} style={t.color ? { borderTopColor: t.color, borderTopWidth: 3 } : undefined}>
              <TeamMark team={t} size={36} />
              <div className="ftn-title text-base mt-3 leading-snug">{t.name}</div>
              {racing && (
                <div className="text-xs text-ftn-text-3 mt-1">
                  {s.leagueDrivers.filter((d) => d.teamId === t.id).map((d) => d.name.split(" ").slice(-1)[0]).join(" · ") || "No drivers yet"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
