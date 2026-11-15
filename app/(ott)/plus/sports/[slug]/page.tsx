"use client";
export const runtime = "edge";
// A league: its banner, then Races (or Matches), Standings and Teams (the approved mockup). Results open under
// each finished race; standings are worked out from the results with the league's own rules, as before.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { broadcastLabel, eventPhoto, fmtDay, fmtTime, indexDrivers, indexTeams, indexVenues, isMatch, roundTitle, useHeadshots, venueName } from "@/components/sports/sports-ui";
import { Ava, LeagueArt, TeamLogo } from "@/components/plus/sports";
import { useSportsData, type SportsArticle, type SportsDriver, type SportsEvent, type SportsLeague, type SportsTeam } from "@/lib/use-sports-data";
import { computeRacingStandings, computeTeamStandings, parseRaceResults, parseRules, racePoints, type RacingRules, type TeamRules } from "@/lib/sports";

type Tab = "races" | "standings" | "teams";
const OLD_TABS: Record<string, Tab> = { calendar: "races", results: "races", roster: "teams", standings: "standings", races: "races", teams: "teams" };

interface Ctx {
  league: SportsLeague;
  teams: Map<string, SportsTeam>;
  drivers: Map<string, SportsDriver>;
  articles: Map<string, SportsArticle>;
  shots: Map<string, string>;
  rules: RacingRules | TeamRules;
}

const shotFor = (d: SportsDriver | undefined, shots: Map<string, string>) => (d?.robloxUsername ? shots.get(d.robloxUsername.toLowerCase()) ?? null : null);

export default function LeaguePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading } = useSportsData();
  const [tab, setTabState] = useState<Tab>("races");
  const [now, setNow] = useState(() => Date.now());

  // The tab lives in the URL (?tab=standings) so links can land on it.
  useEffect(() => {
    const t = OLD_TABS[new URLSearchParams(window.location.search).get("tab") ?? ""];
    if (t) setTabState(t);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", t === "races" ? window.location.pathname : `?tab=${t}`);
  };

  const league = data.leagues.find((l) => l.slug === slug);
  const teams = useMemo(() => indexTeams(data), [data]);
  const venues = useMemo(() => indexVenues(data), [data]);
  const drivers = useMemo(() => indexDrivers(data), [data]);
  const articles = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const leagueTeams = useMemo(() => data.teams.filter((t) => t.leagueId === league?.id), [data.teams, league?.id]);
  const leagueDrivers = useMemo(() => data.drivers.filter((d) => d.leagueId === league?.id), [data.drivers, league?.id]);
  const shots = useHeadshots(leagueDrivers);
  const events = useMemo(() => data.events.filter((e) => e.leagueId === league?.id), [data.events, league?.id]);
  const finals = useMemo(() => events.filter((e) => e.status === "final"), [events]);
  const rules = useMemo(() => (league ? parseRules(league.kind, league.rulesJson) : null), [league]);

  if (loading) {
    return (
      <main>
        <section className="lbanner ph-box" style={{ borderRadius: 0 }} aria-label="Loading" />
      </main>
    );
  }
  if (!league || !rules) {
    return (
      <main className="page">
        <div className="empty">
          <h1 className="h2">League not found</h1>
          <div>It doesn&apos;t exist or is no longer shown.</div>
          <div style={{ marginTop: 20 }}>
            <Link href="/plus/sports" className="btn sec">
              Back to Sports
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const racing = league.kind === "racing";
  const ctx: Ctx = { league, teams, drivers, articles, shots, rules };
  const next = events.find((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000);
  const tabs: [Tab, string][] = [
    ["races", racing ? "Races" : "Matches"],
    ["standings", "Standings"],
    ["teams", "Teams"],
  ];

  return (
    <main>
      <section className="lbanner">
        <LeagueArt league={league} />
        <div className="copy">
          {league.logoUrl && <img src={league.logoUrl} alt="" />}
          <div>
            <h1 className="h1">{league.name}</h1>
            <div className="muted" style={{ marginTop: 6 }}>
              {league.sport} · {league.season}
            </div>
          </div>
        </div>
      </section>
      <div style={{ padding: "0 var(--pad) 64px", maxWidth: 1100 }}>
        <div className="tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "races" &&
          (events.length === 0 ? (
            <div className="empty">{racing ? "No races yet." : "No matches yet."}</div>
          ) : (
            events.map((e) => (
              <EventRow
                key={e.id}
                e={e}
                ctx={ctx}
                photo={eventPhoto(e, venues)}
                where={venueName(e, venues)}
                tag={e.status === "scheduled" ? broadcastLabel(e.id, data.broadcasts) : null}
                isNext={next?.id === e.id}
                past={e.status === "scheduled" && new Date(e.startsAt).getTime() < now - 3 * 3600_000}
              />
            ))
          ))}
        {tab === "standings" && <Standings ctx={ctx} finals={finals} leagueTeams={leagueTeams} leagueDrivers={leagueDrivers} />}
        {tab === "teams" && <Teams ctx={ctx} leagueTeams={leagueTeams} leagueDrivers={leagueDrivers} />}
      </div>
    </main>
  );
}

/* One race or match. A finished race opens its full result underneath. */
function EventRow({ e, ctx, photo, where, tag, isNext, past }: { e: SportsEvent; ctx: Ctx; photo: string | null; where?: string; tag: string | null; isNext: boolean; past: boolean }) {
  const [open, setOpen] = useState(false);
  const match = isMatch(e);
  const rows = !match && e.status === "final" ? parseRaceResults(e.resultsJson).sort((a, b) => a.position - b.position) : [];
  const winner = rows.find((r) => r.position === 1 && r.status === "finished");
  const report = e.articleId ? ctx.articles.get(e.articleId) : undefined;
  const points = ctx.league.kind === "racing" && ctx.league.scoring === "points";

  const status =
    e.status === "final"
      ? match
        ? `Final · ${ctx.teams.get(e.homeTeamId!)?.shortName || ctx.teams.get(e.homeTeamId!)?.name || "Home"} ${e.homeScore ?? 0}–${e.awayScore ?? 0} ${ctx.teams.get(e.awayTeamId!)?.shortName || ctx.teams.get(e.awayTeamId!)?.name || "Away"}${e.overtime ? " (OT)" : ""}`
        : winner
          ? `Final · won by ${ctx.drivers.get(winner.driverId)?.name ?? "Unknown"}`
          : "Final"
      : e.status === "postponed"
        ? "Postponed"
        : e.status === "cancelled"
          ? "Cancelled"
          : fmtTime(e.startsAt);

  return (
    <div className={`event${e.status === "cancelled" ? " cancelled" : ""}${past ? " past" : ""}`}>
      <div className="ph">{photo ? <img src={photo} alt="" loading="lazy" /> : "No photo yet"}</div>
      <div style={{ minWidth: 0 }}>
        {isNext && <div className="next">Next</div>}
        <div className="n">{roundTitle(e, ctx.teams)}</div>
        <div className="s">{[fmtDay(e.startsAt), status, where, tag].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="acts">
        {rows.length > 0 && (
          <button className="btn sec sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide results" : "Results"}
          </button>
        )}
        {e.videoUrl && (
          <a className="btn sec sm" href={e.videoUrl} target="_blank" rel="noopener noreferrer">
            Replay
          </a>
        )}
        {report && (
          <Link className="btn ghost sm" href={`/articles/${report.slug}`}>
            Report
          </Link>
        )}
      </div>
      {open && rows.length > 0 && (
        <div className="res">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="l">Driver</th>
                <th className="l wide">Team</th>
                <th>Time / gap</th>
                {points && <th>Pts</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = ctx.drivers.get(r.driverId);
                const team = d?.teamId ? ctx.teams.get(d.teamId) : undefined;
                return (
                  <tr key={r.driverId}>
                    <td className="pos">{r.status === "finished" ? r.position : "–"}</td>
                    <td className="l">
                      <Driver d={d} ctx={ctx} />
                    </td>
                    <td className="l wide muted">{team?.name}</td>
                    <td>{r.status !== "finished" ? <span className="dnf">{r.status}</span> : r.time ?? ""}</td>
                    {points && <td className="pts">{racePoints(r, ctx.rules as RacingRules)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Driver({ d, ctx }: { d?: SportsDriver; ctx: Ctx }) {
  return (
    <span className="who">
      <Ava name={d?.name ?? "?"} src={shotFor(d, ctx.shots)} size={30} />
      <span style={{ minWidth: 0 }}>
        <b>{d?.name ?? "Unknown"}</b>
        {d?.number != null && <span className="faint num"> #{d.number}</span>}
      </span>
    </span>
  );
}

function Form({ finishes }: { finishes: (number | null)[] }) {
  return (
    <span className="form">
      {finishes.slice(-5).map((f, i) => (
        <i key={i} className={f === 1 ? "win" : f !== null && f <= 3 ? "pod" : undefined}>
          {f ?? "–"}
        </i>
      ))}
    </span>
  );
}

function Standings({ ctx, finals, leagueTeams, leagueDrivers }: { ctx: Ctx; finals: SportsEvent[]; leagueTeams: SportsTeam[]; leagueDrivers: SportsDriver[] }) {
  const { league, rules } = ctx;
  const racing = league.kind === "racing";
  const [view, setView] = useState<"drivers" | "constructors">("drivers");
  const racingTable = useMemo(
    () => (racing ? computeRacingStandings(leagueDrivers, leagueTeams.map((t) => t.id), finals, rules as RacingRules, league.scoring) : null),
    [racing, leagueDrivers, leagueTeams, finals, rules, league.scoring]
  );
  const teamTable = useMemo(() => (!racing ? computeTeamStandings(leagueTeams.map((t) => t.id), finals, rules as TeamRules) : null), [racing, leagueTeams, finals, rules]);

  if (finals.length === 0) return <div className="empty">No results yet.</div>;

  if (teamTable) {
    return (
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Pos</th>
              <th className="l">Team</th>
              {["P", "W", "D", "L", "OTL", "GF", "GA", "GD"].map((h) => (
                <th key={h} className={h === "P" || h === "W" || h === "L" ? undefined : "wide"}>
                  {h}
                </th>
              ))}
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {teamTable.map((r, i) => {
              const t = ctx.teams.get(r.teamId);
              return (
                <tr key={r.teamId}>
                  <td className="pos">{i + 1}</td>
                  <td className="l">
                    <span className="who">
                      <TeamLogo team={t} size={26} />
                      <b>{t?.name ?? "Unknown"}</b>
                    </span>
                  </td>
                  {[r.played, r.wins, r.draws, r.losses, r.overtimeLosses, r.goalsFor, r.goalsAgainst, r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff].map((v, j) => (
                    <td key={j} className={j === 0 || j === 1 || j === 3 ? undefined : "wide"}>
                      {v}
                    </td>
                  ))}
                  <td className="pts">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (!racingTable) return null;
  const points = league.scoring === "points";
  const leader = racingTable.drivers[0]?.points ?? 0;
  const showDrivers = view === "drivers" || !league.constructors;
  return (
    <>
      <div className="tblbar">
        {league.constructors && (
          <div className="seg">
            <button aria-pressed={view === "drivers"} onClick={() => setView("drivers")}>
              Drivers
            </button>
            <button aria-pressed={view === "constructors"} onClick={() => setView("constructors")}>
              Constructors
            </button>
          </div>
        )}
        <span className="faint" style={{ fontSize: 13 }}>
          {points
            ? `Points: ${(rules as RacingRules).points.slice(0, 8).join(" · ")}${(rules as RacingRules).points.length > 8 ? " …" : ""}`
            : "No points in this series: ranked by wins, then podiums."}
        </span>
      </div>
      <div className="tblwrap">
        {showDrivers ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="l">Driver</th>
                <th className="l wide">Team</th>
                <th className="wide">Form</th>
                <th>Wins</th>
                <th className="wide">Podiums</th>
                {points ? (
                  <>
                    <th className="wide">Gap</th>
                    <th>Pts</th>
                  </>
                ) : (
                  <>
                    <th>Best</th>
                    <th className="wide">Avg.</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {racingTable.drivers.map((r, i) => {
                const d = ctx.drivers.get(r.driverId);
                const team = r.teamId ? ctx.teams.get(r.teamId) : undefined;
                return (
                  <tr key={r.driverId}>
                    <td className="pos">{i + 1}</td>
                    <td className="l">
                      <Driver d={d} ctx={ctx} />
                    </td>
                    <td className="l wide muted">{team?.name}</td>
                    <td className="wide">
                      <Form finishes={r.finishes} />
                    </td>
                    <td>{r.wins}</td>
                    <td className="wide">{r.podiums}</td>
                    {points ? (
                      <>
                        <td className="wide faint">{i === 0 ? "–" : `−${leader - r.points}`}</td>
                        <td className="pts">{r.points}</td>
                      </>
                    ) : (
                      <>
                        <td>{r.best ? `P${r.best}` : "–"}</td>
                        <td className="wide">{r.avgFinish ? r.avgFinish.toFixed(1) : "–"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="l">Constructor</th>
                <th>Wins</th>
                <th>Podiums</th>
                {points && <th>Pts</th>}
              </tr>
            </thead>
            <tbody>
              {racingTable.constructors.map((r, i) => {
                const t = ctx.teams.get(r.teamId);
                return (
                  <tr key={r.teamId}>
                    <td className="pos">{i + 1}</td>
                    <td className="l">
                      <span className="who">
                        <TeamLogo team={t} size={26} />
                        <b>{t?.name ?? "Unknown"}</b>
                      </span>
                    </td>
                    <td>{r.wins}</td>
                    <td>{r.podiums}</td>
                    {points && <td className="pts">{r.points}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* Teams, as in the mockup: logo, name, short name. In a racing series each team also lists its drivers. */
function Teams({ ctx, leagueTeams, leagueDrivers }: { ctx: Ctx; leagueTeams: SportsTeam[]; leagueDrivers: SportsDriver[] }) {
  const racing = ctx.league.kind === "racing";
  const independents = leagueDrivers.filter((d) => !d.teamId || !ctx.teams.has(d.teamId));
  if (leagueTeams.length === 0 && independents.length === 0) return <div className="empty">No teams yet.</div>;
  const driverList = (list: SportsDriver[]) =>
    list.length > 0 && (
      <div className="crew">
        {list.map((d) => (
          <span key={d.id} className="who">
            <Ava name={d.name} src={shotFor(d, ctx.shots)} size={28} />
            <span>
              {d.name}
              {d.number != null && <span className="faint num"> #{d.number}</span>}
            </span>
          </span>
        ))}
      </div>
    );
  return (
    <>
      {leagueTeams.map((t) => (
        <div key={t.id} className="event team">
          <TeamLogo team={t} size={56} />
          <div style={{ minWidth: 0 }}>
            <div className="n">{t.name}</div>
            {t.shortName && <div className="s">{t.shortName}</div>}
            {racing && driverList(leagueDrivers.filter((d) => d.teamId === t.id))}
          </div>
        </div>
      ))}
      {racing && independents.length > 0 && (
        <div className="event team">
          <span />
          <div style={{ minWidth: 0 }}>
            <div className="n">Independent</div>
            {driverList(independents)}
          </div>
        </div>
      )}
    </>
  );
}
