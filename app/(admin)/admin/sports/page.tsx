"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, Trophy, Trash2, Loader2 } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageSports } from "@/lib/rbac";
import { useSportsData, type SportsEvent, type SportsLeague } from "@/lib/use-sports-data";
import { parseRaceResults, parseRules, type RacingRules, type RaceResultEntry, type TeamRules } from "@/lib/sports";
import { formatDateTime } from "@/lib/utils";

type Tab = "leagues" | "roster" | "events";

const labelClass = "block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1";
const selectClass =
  "w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const cardClass = "p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none";
const primaryBtn = "font-semibold bg-[#00a9d2] hover:bg-[#0090b3] text-white cursor-pointer shadow-sm disabled:opacity-50";

async function api(method: string, entity: string, body?: unknown, id?: string) {
  const res = await fetch(`/api/sports/${entity}${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

export default function AdminSportsConsole() {
  const { data, loading, reload } = useSportsData();
  const [tab, setTab] = useState<Tab>("leagues");
  const [leagueId, setLeagueId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!leagueId && data.leagues.length > 0) setLeagueId(data.leagues[0].id);
  }, [data.leagues, leagueId]);

  const league = data.leagues.find((l) => l.id === leagueId);

  // Runs an API action, then refreshes; failures surface as an alert like the other admin pages.
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      return true;
    } catch (e: any) {
      alert(e.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminAuthGuard requiredPermission={canManageSports} featureTitle="Sports Division Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
            </Link>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2.5">
              <Trophy className="h-7 w-7 text-yellow-500" /> Sports Settings
            </h1>
          </div>
          <div className="flex gap-2">
            {(["leagues", "roster", "events"] as Tab[]).map((t) => (
              <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} className="cursor-pointer">
                {t === "leagues" ? "Leagues" : t === "roster" ? "Teams & drivers" : "Schedule & results"}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8 text-neutral-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <>
            {tab !== "leagues" && (
              <div className="max-w-xs">
                <Field label="League">
                  <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)} className={selectClass}>
                    {data.leagues.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.season})</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {tab === "leagues" && <LeaguesTab leagues={data.leagues} busy={busy} run={run} />}
            {tab !== "leagues" && !league && (
              <p className="text-xs text-neutral-500">Create a league first.</p>
            )}
            {tab === "roster" && league && <RosterTab league={league} data={data} busy={busy} run={run} />}
            {tab === "events" && league && <EventsTab league={league} data={data} busy={busy} run={run} />}
          </>
        )}
      </div>
    </AdminAuthGuard>
  );
}

type RunFn = (fn: () => Promise<unknown>) => Promise<boolean>;

function LeaguesTab({ leagues, busy, run }: { leagues: SportsLeague[]; busy: boolean; run: RunFn }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"racing" | "team">("racing");
  const [sport, setSport] = useState("Rally");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [color, setColor] = useState("#FFBB14");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <Card className={cardClass}>
        <h2 className="text-lg font-bold">Create league</h2>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("POST", "leagues", { name, kind, sport, season, color }))) setName("");
          }}
        >
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harrison Rallying Championship" /></Field>
          <Field label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={selectClass}>
              <option value="racing">Racing (drivers and constructors)</option>
              <option value="team">Team sport (matches)</option>
            </select>
          </Field>
          <Field label="Sport"><Input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Rally, Hockey, Football..." /></Field>
          <Field label="Season"><Input value={season} onChange={(e) => setSeason(e.target.value)} /></Field>
          <Field label="Colour"><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#FFBB14" /></Field>
          <Button type="submit" disabled={busy || !name.trim()} className={`w-full ${primaryBtn}`}>Register league</Button>
        </form>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-bold">Leagues</h2>
        {leagues.length === 0 && (
          <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">
            No leagues yet.
          </div>
        )}
        {leagues.map((l) => (
          <Card key={l.id} className="p-4 space-y-3 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">{l.name}</h3>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  <span className="uppercase font-mono text-[10px] text-blue-600 dark:text-blue-400">{l.kind}</span> · {l.sport} · Season {l.season}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setEditing(editing === l.id ? null : l.id)}>
                  Scoring
                </Button>
                <button
                  type="button"
                  title="Delete league"
                  className="text-neutral-400 hover:text-red-500 transition cursor-pointer p-1.5"
                  onClick={() => {
                    if (confirm(`Delete ${l.name} and all its teams, drivers and events?`)) run(() => api("DELETE", "leagues", undefined, l.id));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {editing === l.id && <RulesEditor league={l} busy={busy} run={run} />}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RulesEditor({ league, busy, run }: { league: SportsLeague; busy: boolean; run: RunFn }) {
  const rules = parseRules(league.kind, league.rulesJson);
  const [points, setPoints] = useState(league.kind === "racing" ? (rules as RacingRules).points.join(", ") : "");
  const [fl, setFl] = useState(String(league.kind === "racing" ? (rules as RacingRules).fastestLapPoint : 0));
  const t = rules as TeamRules;
  const [win, setWin] = useState(String(t.win ?? 3));
  const [draw, setDraw] = useState(String(t.draw ?? 1));
  const [loss, setLoss] = useState(String(t.loss ?? 0));
  const [otl, setOtl] = useState(String(t.overtimeLoss ?? 0));

  const save = () =>
    run(() =>
      api(
        "PATCH",
        "leagues",
        {
          kind: league.kind,
          rules:
            league.kind === "racing"
              ? { points: points.split(/[,\s]+/).filter(Boolean).map(Number), fastestLapPoint: Number(fl) }
              : { win: Number(win), draw: Number(draw), loss: Number(loss), overtimeLoss: Number(otl) },
        },
        league.id
      )
    );

  return (
    <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
      {league.kind === "racing" ? (
        <>
          <Field label="Points by position (1st, 2nd, ...)"><Input value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
          <Field label="Fastest lap bonus"><Input value={fl} onChange={(e) => setFl(e.target.value)} /></Field>
        </>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Field label="Win"><Input value={win} onChange={(e) => setWin(e.target.value)} /></Field>
          <Field label="Draw"><Input value={draw} onChange={(e) => setDraw(e.target.value)} /></Field>
          <Field label="Loss"><Input value={loss} onChange={(e) => setLoss(e.target.value)} /></Field>
          <Field label="OT loss"><Input value={otl} onChange={(e) => setOtl(e.target.value)} /></Field>
        </div>
      )}
      <Button size="sm" disabled={busy} onClick={save} className={primaryBtn}>Save scoring</Button>
    </div>
  );
}

function RosterTab({ league, data, busy, run }: { league: SportsLeague; data: ReturnType<typeof useSportsData>["data"]; busy: boolean; run: RunFn }) {
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const drivers = data.drivers.filter((d) => d.leagueId === league.id);
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [teamColor, setTeamColor] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverNumber, setDriverNumber] = useState("");
  const [driverTeam, setDriverTeam] = useState("");
  const racing = league.kind === "racing";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="space-y-4">
        <Card className={cardClass}>
          <h2 className="text-lg font-bold">{racing ? "Add constructor" : "Add team"}</h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("POST", "teams", { leagueId: league.id, name: teamName, shortName, color: teamColor }))) {
                setTeamName(""); setShortName(""); setTeamColor("");
              }
            }}
          >
            <Field label="Name"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Short name"><Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="ABC" /></Field>
              <Field label="Colour"><Input value={teamColor} onChange={(e) => setTeamColor(e.target.value)} placeholder="#FF0000" /></Field>
            </div>
            <Button type="submit" disabled={busy || !teamName.trim()} className={`w-full ${primaryBtn}`}>Add</Button>
          </form>
        </Card>
        {teams.map((t) => (
          <Card key={t.id} className="p-3 flex items-center justify-between border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color || "#525252" }} /> {t.name}
            </span>
            <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={() => confirm(`Delete ${t.name}?`) && run(() => api("DELETE", "teams", undefined, t.id))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>

      {racing && (
        <div className="space-y-4">
          <Card className={cardClass}>
            <h2 className="text-lg font-bold">Add driver</h2>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => api("POST", "drivers", { leagueId: league.id, name: driverName, number: driverNumber || null, teamId: driverTeam || null }))) {
                  setDriverName(""); setDriverNumber("");
                }
              }}
            >
              <Field label="Name"><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Number"><Input value={driverNumber} onChange={(e) => setDriverNumber(e.target.value)} /></Field>
                <Field label="Constructor">
                  <select value={driverTeam} onChange={(e) => setDriverTeam(e.target.value)} className={selectClass}>
                    <option value="">None</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
              <Button type="submit" disabled={busy || !driverName.trim()} className={`w-full ${primaryBtn}`}>Add</Button>
            </form>
          </Card>
          {drivers.map((d) => (
            <Card key={d.id} className="p-3 flex items-center justify-between border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
              <span className="text-sm">
                <span className="font-semibold">{d.number != null ? `#${d.number} ` : ""}{d.name}</span>
                <span className="text-neutral-500 text-xs ml-2">{teams.find((t) => t.id === d.teamId)?.name ?? ""}</span>
              </span>
              <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={() => confirm(`Delete ${d.name}?`) && run(() => api("DELETE", "drivers", undefined, d.id))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EventsTab({ league, data, busy, run }: { league: SportsLeague; data: ReturnType<typeof useSportsData>["data"]; busy: boolean; run: RunFn }) {
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const events = useMemo(
    () => data.events.filter((e) => e.leagueId === league.id).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [data.events, league.id]
  );
  const racing = league.kind === "racing";
  const [name, setName] = useState("");
  const [round, setRound] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Card className={`${cardClass} lg:col-span-1 self-start`}>
        <h2 className="text-lg font-bold">{racing ? "Add round" : "Add match"}</h2>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              api("POST", "events", {
                leagueId: league.id,
                name: name || null,
                round: round || null,
                venue: venue || null,
                startsAt: new Date(startsAt).toISOString(),
                homeTeamId: racing ? null : home || null,
                awayTeamId: racing ? null : away || null,
              })
            );
            if (ok) { setName(""); setRound(""); setVenue(""); }
          }}
        >
          {racing ? (
            <>
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal Rally" /></Field>
              <Field label="Round"><Input value={round} onChange={(e) => setRound(e.target.value)} /></Field>
            </>
          ) : (
            <>
              <Field label="Home">
                <select value={home} onChange={(e) => setHome(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Away">
                <select value={away} onChange={(e) => setAway(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Venue"><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
          <Field label="Start (your local time)"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Button type="submit" disabled={busy || !startsAt || (!racing && (!home || !away))} className={`w-full ${primaryBtn}`}>Add</Button>
        </form>
      </Card>

      <div className="lg:col-span-2 space-y-3">
        <h2 className="text-lg font-bold">Schedule and results</h2>
        {events.length === 0 && <p className="text-xs text-neutral-500">No events yet.</p>}
        {events.map((e) => (
          <Card key={e.id} className="p-4 space-y-3 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-sm">
                  {e.homeTeamId && e.awayTeamId
                    ? `${teams.find((t) => t.id === e.homeTeamId)?.name ?? "?"} vs ${teams.find((t) => t.id === e.awayTeamId)?.name ?? "?"}`
                    : `${e.round ? `Round ${e.round}: ` : ""}${e.name || "Race"}`}
                  {e.status === "final" && e.homeScore != null && ` (${e.homeScore}-${e.awayScore}${e.overtime ? " OT" : ""})`}
                </div>
                <div className="text-xs text-neutral-500">
                  {formatDateTime(e.startsAt)} · <span className="uppercase font-mono">{e.status}</span>
                  {e.venue ? ` · ${e.venue}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setEditing(editing === e.id ? null : e.id)}>
                  {e.status === "final" ? "Edit result" : "Enter result"}
                </Button>
                {e.status === "scheduled" && (
                  <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => run(() => api("PATCH", "events", { status: "postponed" }, e.id))}>
                    Postpone
                  </Button>
                )}
                {e.status !== "scheduled" && e.status !== "final" && (
                  <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => run(() => api("PATCH", "events", { status: "scheduled" }, e.id))}>
                    Reschedule
                  </Button>
                )}
                <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={() => confirm("Delete this event?") && run(() => api("DELETE", "events", undefined, e.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {editing === e.id && (
              <ResultEditor
                event={e}
                racing={racing}
                drivers={data.drivers.filter((d) => d.leagueId === league.id)}
                busy={busy}
                run={run}
                onSaved={() => setEditing(null)}
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResultEditor({
  event,
  racing,
  drivers,
  busy,
  run,
  onSaved,
}: {
  event: SportsEvent;
  racing: boolean;
  drivers: { id: string; name: string; number: number | null }[];
  busy: boolean;
  run: RunFn;
  onSaved: () => void;
}) {
  const [homeScore, setHomeScore] = useState(String(event.homeScore ?? 0));
  const [awayScore, setAwayScore] = useState(String(event.awayScore ?? 0));
  const [overtime, setOvertime] = useState(event.overtime);
  const [startsAt, setStartsAt] = useState(toLocalInput(event.startsAt));
  const [videoUrl, setVideoUrl] = useState(event.videoUrl ?? "");

  // Racing: one row per finishing position, in order.
  const existing = parseRaceResults(event.resultsJson).sort((a, b) => a.position - b.position);
  const [rows, setRows] = useState<{ driverId: string; dnf: boolean; fl: boolean }[]>(
    existing.length > 0
      ? existing.map((r) => ({ driverId: r.driverId, dnf: r.status === "dnf", fl: !!r.fastestLap }))
      : drivers.map(() => ({ driverId: "", dnf: false, fl: false }))
  );

  const save = async () => {
    const body: Record<string, unknown> = { status: "final", startsAt: new Date(startsAt).toISOString(), videoUrl: videoUrl || null };
    if (racing) {
      const used = rows.filter((r) => r.driverId);
      if (new Set(used.map((r) => r.driverId)).size !== used.length) {
        alert("A driver appears more than once.");
        return;
      }
      body.results = used.map<RaceResultEntry>((r, i) => ({
        driverId: r.driverId,
        position: i + 1,
        status: r.dnf ? "dnf" : "finished",
        fastestLap: r.fl,
      }));
    } else {
      body.homeScore = Number(homeScore);
      body.awayScore = Number(awayScore);
      body.overtime = overtime;
    }
    if (await run(() => api("PATCH", "events", body, event.id))) onSaved();
  };

  return (
    <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Start (local)"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
        <Field label="Video link (optional)"><Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="/plus/watch/..." /></Field>
      </div>
      {racing ? (
        <div className="space-y-1.5">
          <label className={labelClass}>Finishing order</label>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-right font-mono text-xs text-neutral-500">{i + 1}</span>
              <select
                value={r.driverId}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, driverId: e.target.value } : x)))}
                className={selectClass}
              >
                <option value="">-</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.number != null ? `#${d.number} ` : ""}{d.name}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input type="checkbox" checked={r.dnf} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dnf: e.target.checked } : x)))} /> DNF
              </label>
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input type="radio" name={`fl-${event.id}`} checked={r.fl} onChange={() => setRows(rows.map((x, j) => ({ ...x, fl: j === i })))} /> FL
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 items-end">
          <Field label="Home score"><Input value={homeScore} onChange={(e) => setHomeScore(e.target.value)} /></Field>
          <Field label="Away score"><Input value={awayScore} onChange={(e) => setAwayScore(e.target.value)} /></Field>
          <label className="flex items-center gap-1.5 text-xs h-9">
            <input type="checkbox" checked={overtime} onChange={(e) => setOvertime(e.target.checked)} /> Overtime
          </label>
        </div>
      )}
      <Button size="sm" disabled={busy} onClick={save} className={primaryBtn}>Save result (marks final)</Button>
    </div>
  );
}
