"use client";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { AdminRow, AdminSwitch } from "@/components/gs/admin-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, ArrowDown, ArrowUp, Trophy, Trash2, Loader2, Upload } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canManageSports } from "@/lib/rbac";
import { useSportsData, type SportsArticle, type SportsDriver, type SportsEvent, type SportsLeague, type SportsVenue } from "@/lib/use-sports-data";
import { broadcastLabel } from "@/components/sports/sports-ui";
import { parseRaceResults, parseRules, type RacingRules, type RaceResultEntry, type TeamRules } from "@/lib/sports";
import { formatDateTime } from "@/lib/utils";

type Tab = "overview" | "events" | "roster" | "leagues" | "venues";

const labelClass = "block text-sm font-semibold mb-1";
const selectClass =
  "w-full h-10 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const cardClass = "p-5 sm:p-6 space-y-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:sticky lg:top-24 self-start";
const primaryBtn = "font-semibold bg-brand hover:bg-brand-hover text-brand-ink cursor-pointer shadow-sm disabled:opacity-50";

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

async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", "sports");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

/** Upload button: sends the picked image to /api/upload and hands back its URL. */
function PhotoButton({ label = "Upload", onUploaded }: { label?: string; onUploaded: (url: string) => void | Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            await onUploaded(await uploadPhoto(file));
          } catch (err: any) {
            toast(err.message || "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
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
  const [tab, setTab] = useState<Tab>("overview");
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState("");
  const [busy, setBusy] = useState(false);
  const [articles, setArticles] = useState<SportsArticle[]>([]);

  // Published articles, for linking a round report to an event.
  useEffect(() => {
    fetch("/api/articles?limit=100")
      .then((r) => r.json() as Promise<{ articles?: SportsArticle[] }>)
      .then((j) => setArticles((j.articles ?? []).map((a) => ({ id: a.id, slug: a.slug, title: a.title }))))
      .catch(() => {});
  }, []);

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
      toast(e.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminAuthGuard requiredPermission={canManageSports} featureTitle="Sports Division Console">
      <div className="mx-auto max-w-6xl space-y-8 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Sports"
          description="Manage league rosters and record match or race scores."
          tabs={(["overview", "events", "roster", "leagues", "venues"] as Tab[]).map((t) => (
            <AdminTab key={t} active={tab === t} onClick={() => { setOpenEvent(null); setTab(t); }}>
              {t === "overview" ? "Overview" : t === "events" ? "Schedule & results" : t === "roster" ? "Teams & drivers" : t === "leagues" ? "Leagues" : "Venues"}
            </AdminTab>
          ))}
        />

        {loading ? (
          <div className="flex items-center justify-center p-8 text-neutral-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <>
            {(tab === "overview" || tab === "roster" || tab === "events") && data.leagues.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="League">
                {data.leagues.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={leagueId === l.id}
                    onClick={() => setLeagueId(l.id)}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition ${
                      leagueId === l.id ? "border-brand bg-brand text-brand-ink" : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
                    }`}
                  >
                    {l.name} <span className="font-medium opacity-70">{l.season}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setTab("leagues")} className="cursor-pointer rounded-full border border-dashed border-neutral-400 px-4 py-2 text-sm font-bold text-neutral-600 hover:border-neutral-700 dark:text-neutral-400">
                  + New league
                </button>
              </div>
            )}
            {(tab === "overview" || tab === "roster" || tab === "events") && !league && (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
                <p className="text-sm text-neutral-500">No league yet. Create one to start entering teams, rounds and results.</p>
                <Button onClick={() => setTab("leagues")} className="mt-4 cursor-pointer">Create a league</Button>
              </div>
            )}
            {tab === "overview" && league && (
              <Overview league={league} data={data} onEnterResult={(id) => { setOpenEvent(id); setTab("events"); }} onTab={(t) => { setOpenEvent(null); setTab(t); }} />
            )}
            {tab === "leagues" && <LeaguesTab leagues={data.leagues} busy={busy} run={run} />}
            {tab === "venues" && <VenuesTab venues={data.venues} busy={busy} run={run} />}
            {tab === "roster" && league && <RosterTab league={league} data={data} busy={busy} run={run} />}
            {tab === "events" && league && <EventsTab league={league} data={data} articles={articles} busy={busy} run={run} initialEditing={openEvent} />}
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
  const [scoring, setScoring] = useState<"points" | "order">("points");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card className={cardClass}>
        <div>
          <h2 className="text-lg font-extrabold">New league</h2>
          <p className="mt-1 text-xs text-neutral-500">A season of racing or a team sport. Rules and logos are set afterwards, from the league card.</p>
        </div>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("POST", "leagues", { name, kind, sport, season, color, scoring: kind === "racing" ? scoring : "points" }))) setName("");
          }}
        >
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harrison Rallying Championship" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sport"><Input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Rally, Hockey..." /></Field>
            <Field label="Season"><Input value={season} onChange={(e) => setSeason(e.target.value)} /></Field>
          </div>
          <Field label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={selectClass}>
              <option value="racing">Racing (drivers and constructors)</option>
              <option value="team">Team sport (matches)</option>
            </select>
          </Field>
          {kind === "racing" && (
            <Field label="Scoring">
              <select value={scoring} onChange={(e) => setScoring(e.target.value as any)} className={selectClass}>
                <option value="points">Points table (championship)</option>
                <option value="order">Finishing order only (no points)</option>
              </select>
            </Field>
          )}
          <Field label="Colour"><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#FFBB14" /></Field>
          <Button type="submit" disabled={busy || !name.trim()} className={`w-full ${primaryBtn}`}>Create league</Button>
        </form>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-extrabold">Leagues ({leagues.length})</h2>
        {leagues.length === 0 && (
          <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg text-xs text-neutral-500">
            No leagues yet.
          </div>
        )}
        {leagues.map((l) => (
          <Card key={l.id} className="p-5 space-y-3 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">{l.name}</h3>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  <span className="uppercase font-mono text-[10px] text-neutral-500">{l.kind}</span> · {l.sport} · Season {l.season}
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
                  onClick={async () => {
                    if (await confirmDialog(`Delete ${l.name} and all its teams, drivers and events?`)) run(() => api("DELETE", "leagues", undefined, l.id));
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
  const racing = league.kind === "racing";
  const [scoring, setScoring] = useState<"points" | "order">(league.scoring);
  const [constructors, setConstructors] = useState(league.constructors);
  const [color, setColor] = useState(league.color ?? "");
  const [points, setPoints] = useState(racing ? (rules as RacingRules).points.join(", ") : "");
  const [fl, setFl] = useState(String(racing ? (rules as RacingRules).fastestLapPoint : 0));
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
          color: color || null,
          ...(racing ? { scoring, constructors } : {}),
          rules: racing
            ? { points: points.split(/[,\s]+/).filter(Boolean).map(Number), fastestLapPoint: Number(fl) }
            : { win: Number(win), draw: Number(draw), loss: Number(loss), overtimeLoss: Number(otl) },
        },
        league.id
      )
    );

  return (
    <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
      <Field label="Accent colour"><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#2DD4BF" /></Field>
      <div>
        <label className={labelClass}>Logo</label>
        <div className="flex items-center gap-3">
          {league.logoUrl && <img src={league.logoUrl} alt="" className="h-12 w-12 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 p-1.5 object-contain" />}
          <PhotoButton label={league.logoUrl ? "Replace" : "Upload"} onUploaded={(url) => run(() => api("PATCH", "leagues", { logoUrl: url }, league.id))} />
          {league.logoUrl && (
            <button type="button" className="text-xs text-neutral-500 hover:text-red-500 cursor-pointer" onClick={() => run(() => api("PATCH", "leagues", { logoUrl: null }, league.id))}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-1">Shown on a transparent background; a PNG with transparency works best. Initials are used until one is uploaded.</p>
      </div>
      <div>
        <label className={labelClass}>Banner photo</label>
        <div className="flex items-center gap-3">
          {league.bannerUrl && <img src={league.bannerUrl} alt="" className="h-12 w-20 rounded-md object-cover" />}
          <PhotoButton label={league.bannerUrl ? "Replace" : "Upload"} onUploaded={(url) => run(() => api("PATCH", "leagues", { bannerUrl: url }, league.id))} />
        </div>
      </div>
      {racing && (
        <Field label="Scoring">
          <select value={scoring} onChange={(e) => setScoring(e.target.value as any)} className={selectClass}>
            <option value="points">Points table (championship)</option>
            <option value="order">Finishing order only: ranked by wins, then podiums</option>
          </select>
        </Field>
      )}
      {racing && scoring === "points" && (
        <>
          <Field label="Points by position (1st, 2nd, ...)"><Input value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
          <Field label="Fastest lap bonus"><Input value={fl} onChange={(e) => setFl(e.target.value)} /></Field>
        </>
      )}
      {racing && (
        <AdminRow label="Constructors' standings" hint="Also rank teams, not just drivers.">
          <AdminSwitch checked={constructors} onChange={setConstructors} label="Constructors' standings" />
        </AdminRow>
      )}
      {!racing && (
        <div className="grid grid-cols-4 gap-2">
          <Field label="Win"><Input value={win} onChange={(e) => setWin(e.target.value)} /></Field>
          <Field label="Draw"><Input value={draw} onChange={(e) => setDraw(e.target.value)} /></Field>
          <Field label="Loss"><Input value={loss} onChange={(e) => setLoss(e.target.value)} /></Field>
          <Field label="OT loss"><Input value={otl} onChange={(e) => setOtl(e.target.value)} /></Field>
        </div>
      )}
      <Button size="sm" disabled={busy} onClick={save} className={primaryBtn}>Save league settings</Button>
    </div>
  );
}

function VenuesTab({ venues, busy, run }: { venues: SportsVenue[]; busy: boolean; run: RunFn }) {
  const [name, setName] = useState("");
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card className={`${cardClass} self-start`}>
        <h2 className="text-lg font-extrabold">Add venue</h2>
        <p className="text-xs text-neutral-500">Tracks and stages. The photo shows on the Sports hub, calendar and league overview.</p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("POST", "venues", { name }))) setName("");
          }}
        >
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal Pass" /></Field>
          <Button type="submit" disabled={busy || !name.trim()} className={`w-full ${primaryBtn}`}>Add</Button>
        </form>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
        {venues.length === 0 && <p className="text-xs text-neutral-500">No venues yet.</p>}
        {venues.map((v) => (
          <Card key={v.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="h-32 bg-neutral-200 dark:bg-neutral-900">
              {v.photoUrl && <img src={v.photoUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="p-3 flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate">{v.name}</span>
              <div className="flex items-center gap-2">
                <PhotoButton label={v.photoUrl ? "Replace" : "Upload"} onUploaded={(url) => run(() => api("PATCH", "venues", { photoUrl: url }, v.id))} />
                <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={async () => await confirmDialog(`Delete ${v.name}?`) && run(() => api("DELETE", "venues", undefined, v.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RosterTab({ league, data, busy, run }: { league: SportsLeague; data: ReturnType<typeof useSportsData>["data"]; busy: boolean; run: RunFn }) {
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const drivers = data.drivers.filter((d) => d.leagueId === league.id);
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [teamColor, setTeamColor] = useState("");
  const [teamLogo, setTeamLogo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverNumber, setDriverNumber] = useState("");
  const [driverTeam, setDriverTeam] = useState("");
  const [driverRoblox, setDriverRoblox] = useState("");
  const racing = league.kind === "racing";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className={cardClass}>
          <h2 className="text-lg font-extrabold">{racing ? "Add constructor" : "Add team"}</h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("POST", "teams", { leagueId: league.id, name: teamName, shortName, color: teamColor, logoUrl: teamLogo || null }))) {
                setTeamName(""); setShortName(""); setTeamColor(""); setTeamLogo("");
              }
            }}
          >
            <Field label="Name"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Short name"><Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="ABC" /></Field>
              <Field label="Colour"><Input value={teamColor} onChange={(e) => setTeamColor(e.target.value)} placeholder="#FF0000" /></Field>
            </div>
            <div className="flex items-center gap-3">
              {teamLogo && <img src={teamLogo} alt="" className="h-10 w-10 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 p-1 object-contain" />}
              <PhotoButton label={teamLogo ? "Replace logo" : "Upload logo"} onUploaded={(url) => setTeamLogo(url)} />
            </div>
            <Button type="submit" disabled={busy || !teamName.trim()} className={`w-full ${primaryBtn}`}>Add</Button>
          </form>
        </Card>
        {teams.map((t) => (
          <Card key={t.id} className="p-4 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-8 w-8 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 p-1 object-contain" /> : <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color || "#525252" }} />} {t.name}
            </span>
            <span className="flex items-center gap-1">
              <PhotoButton label={t.logoUrl ? "Replace logo" : "Upload logo"} onUploaded={(url) => run(() => api("PATCH", "teams", { logoUrl: url }, t.id))} />
              {t.logoUrl && (
                <button type="button" className="text-xs text-neutral-500 hover:text-red-500 cursor-pointer px-1.5" onClick={() => run(() => api("PATCH", "teams", { logoUrl: null }, t.id))}>
                  Remove
                </button>
              )}
            <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={async () => await confirmDialog(`Delete ${t.name}?`) && run(() => api("DELETE", "teams", undefined, t.id))}>
              <Trash2 className="h-4 w-4" />
            </button>
            </span>
          </Card>
        ))}
      </div>

      {racing && (
        <div className="space-y-4">
          <Card className={cardClass}>
            <h2 className="text-lg font-extrabold">Add driver</h2>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => api("POST", "drivers", { leagueId: league.id, name: driverName, number: driverNumber || null, teamId: driverTeam || null, robloxUsername: driverRoblox || null }))) {
                  setDriverName(""); setDriverNumber(""); setDriverRoblox("");
                }
              }}
            >
              <Field label="Name"><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></Field>
              <Field label="Roblox username (for the headshot)"><Input value={driverRoblox} onChange={(e) => setDriverRoblox(e.target.value)} placeholder="optional" /></Field>
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
            <Card key={d.id} className="p-4 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <span className="text-sm">
                <span className="font-semibold">{d.number != null ? `#${d.number} ` : ""}{d.name}</span>
                <span className="text-neutral-500 text-xs ml-2">{teams.find((t) => t.id === d.teamId)?.name ?? ""}{d.robloxUsername ? ` · @${d.robloxUsername}` : ""}</span>
              </span>
              <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={async () => await confirmDialog(`Delete ${d.name}?`) && run(() => api("DELETE", "drivers", undefined, d.id))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EventsTab({ league, data, articles, busy, run, initialEditing = null }: { league: SportsLeague; data: ReturnType<typeof useSportsData>["data"]; articles: SportsArticle[]; busy: boolean; run: RunFn; initialEditing?: string | null }) {
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const events = useMemo(
    () => data.events.filter((e) => e.leagueId === league.id).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [data.events, league.id]
  );
  const racing = league.kind === "racing";
  const [name, setName] = useState("");
  const [round, setRound] = useState("");
  const [venue, setVenue] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [editing, setEditing] = useState<string | null>(initialEditing);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <Card className={`${cardClass} self-start`}>
        <h2 className="text-lg font-extrabold">{racing ? "Add round" : "Add match"}</h2>
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
                venueId: venueId || null,
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
          <Field label="Venue (with photo)">
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className={selectClass}>
              <option value="">None</option>
              {data.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Location note (optional)"><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
          <Field label="Start (your local time)"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Button type="submit" disabled={busy || !startsAt || (!racing && (!home || !away))} className={`w-full ${primaryBtn}`}>Add</Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-extrabold">Schedule and results</h2>
        {events.length === 0 && <p className="text-xs text-neutral-500">No events yet.</p>}
        {events.map((e) => (
          <Card key={e.id} className="p-5 space-y-3 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
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
                  {data.venues.find((v) => v.id === e.venueId) ? ` · ${data.venues.find((v) => v.id === e.venueId)!.name}` : ""}
                  {broadcastLabel(e.id, data.broadcasts) ? ` · Broadcast: ${broadcastLabel(e.id, data.broadcasts)}` : ""}
                  {articles.find((a) => a.id === e.articleId) ? " · Report linked" : ""}
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
                <button type="button" title="Delete" className="text-neutral-400 hover:text-red-500 cursor-pointer p-1.5" onClick={async () => await confirmDialog("Delete this event?") && run(() => api("DELETE", "events", undefined, e.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {editing === e.id && (
              <ResultEditor
                event={e}
                racing={racing}
                league={league}
                venues={data.venues}
                articles={articles}
                broadcast={broadcastLabel(e.id, data.broadcasts)}
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
  league,
  venues,
  articles,
  broadcast,
  drivers,
  busy,
  run,
  onSaved,
}: {
  event: SportsEvent;
  racing: boolean;
  league: SportsLeague;
  venues: SportsVenue[];
  articles: SportsArticle[];
  broadcast: string | null;
  drivers: SportsDriver[];
  busy: boolean;
  run: RunFn;
  onSaved: () => void;
}) {
  const [homeScore, setHomeScore] = useState(String(event.homeScore ?? 0));
  const [awayScore, setAwayScore] = useState(String(event.awayScore ?? 0));
  const [overtime, setOvertime] = useState(event.overtime);
  const [startsAt, setStartsAt] = useState(toLocalInput(event.startsAt));
  const [videoUrl, setVideoUrl] = useState(event.videoUrl ?? "");
  const [venueId, setVenueId] = useState(event.venueId ?? "");
  const [articleId, setArticleId] = useState(event.articleId ?? "");
  const points = league.scoring === "points";

  // Racing: one row per finishing position, in order.
  type Row = { driverId: string; status: "finished" | "dnf" | "dsq"; fl: boolean; time: string };
  const existing = parseRaceResults(event.resultsJson).sort((a, b) => a.position - b.position);
  const [rows, setRows] = useState<Row[]>(
    existing.length > 0
      ? existing.map((r) => ({ driverId: r.driverId, status: r.status, fl: !!r.fastestLap, time: r.time ?? "" }))
      : drivers.map(() => ({ driverId: "", status: "finished", fl: false, time: "" }))
  );
  const patchRow = (i: number, patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  const save = async () => {
    const body: Record<string, unknown> = {
      status: "final",
      startsAt: new Date(startsAt).toISOString(),
      videoUrl: videoUrl || null,
      venueId: venueId || null,
      articleId: articleId || null,
    };
    if (racing) {
      const used = rows.filter((r) => r.driverId);
      if (new Set(used.map((r) => r.driverId)).size !== used.length) {
        toast("A driver appears more than once.");
        return;
      }
      body.results = used.map<RaceResultEntry>((r, i) => ({
        driverId: r.driverId,
        position: i + 1,
        status: r.status,
        fastestLap: points && r.fl,
        time: r.time.trim() || undefined,
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
        <Field label="Venue (with photo)">
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Round report (published article)">
          <select value={articleId} onChange={(e) => setArticleId(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-[11px] text-neutral-500">
        Broadcast: {broadcast ?? "none linked. Pick this event in the Schedule admin to show a Livestream or Radio badge."}
      </p>
      {racing ? (
        <div className="space-y-1.5">
          <label className={labelClass}>Finishing order{points ? "" : " (no points in this series)"}</label>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-right font-mono text-xs text-neutral-500">{i + 1}</span>
              <select value={r.driverId} onChange={(e) => patchRow(i, { driverId: e.target.value })} className={selectClass}>
                <option value="">-</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.number != null ? `#${d.number} ` : ""}{d.name}</option>)}
              </select>
              <Input value={r.time} onChange={(e) => patchRow(i, { time: e.target.value })} placeholder="48:12.4 or +6.8" className="w-36 font-mono" />
              <select value={r.status} onChange={(e) => patchRow(i, { status: e.target.value as Row["status"] })} className={`${selectClass} w-28`}>
                <option value="finished">Finished</option>
                <option value="dnf">DNF</option>
                <option value="dsq">DSQ</option>
              </select>
              {points && (
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="radio" name={`fl-${event.id}`} checked={r.fl} onChange={() => setRows(rows.map((x, j) => ({ ...x, fl: j === i })))} /> FL
                </label>
              )}
              <button type="button" title="Move up" className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" title="Move down" className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setRows([...rows, { driverId: "", status: "finished", fl: false, time: "" }])}>
            Add row
          </Button>
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

function Overview({ league, data, onEnterResult, onTab }: { league: SportsLeague; data: ReturnType<typeof useSportsData>["data"]; onEnterResult: (eventId: string) => void; onTab: (t: Tab) => void }) {
  const events = data.events.filter((e) => e.leagueId === league.id).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const drivers = data.drivers.filter((d) => d.leagueId === league.id);
  const now = Date.now();
  const needsResult = events.filter((e) => e.status === "scheduled" && +new Date(e.startsAt) < now);
  const upcoming = events.filter((e) => e.status === "scheduled" && +new Date(e.startsAt) >= now);
  const latest = events.filter((e) => e.status === "final").slice(-3).reverse();
  const racing = league.kind === "racing";
  const label = (e: SportsEvent) =>
    e.homeTeamId && e.awayTeamId
      ? `${teams.find((t) => t.id === e.homeTeamId)?.name ?? "?"} vs ${teams.find((t) => t.id === e.awayTeamId)?.name ?? "?"}`
      : `${e.round ? `Round ${e.round}: ` : ""}${e.name || (racing ? "Race" : "Match")}`;
  const card = "rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900";
  const kicker = "text-xs font-bold uppercase tracking-widest text-neutral-500";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={`${card} ${needsResult.length ? "border-[#16110a] bg-[#16110a] text-[#fff8e6] dark:border-black dark:bg-black" : ""}`}>
          <div className={needsResult.length ? "text-xs font-bold uppercase tracking-widest text-[#fff8e6]/70" : kicker}>Needs a result</div>
          {needsResult.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">Every finished {racing ? "race" : "match"} has its result entered.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#fff8e6]/15">
              {needsResult.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{label(e)}</div>
                    <div className="text-sm text-[#fff8e6]/70">{formatDateTime(e.startsAt)}</div>
                  </div>
                  <button type="button" onClick={() => onEnterResult(e.id)} className="h-10 shrink-0 cursor-pointer rounded-full bg-brand px-5 text-sm font-bold text-brand-ink hover:bg-brand-hover">
                    Enter result
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={card}>
          <div className={kicker}>Coming up</div>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">Nothing scheduled.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
              {upcoming.slice(0, 4).map((e) => (
                <li key={e.id} className="py-3">
                  <div className="truncate font-bold">{label(e)}</div>
                  <div className="text-sm text-neutral-500">{formatDateTime(e.startsAt)}</div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => onTab("events")} className="mt-4 h-10 cursor-pointer rounded-full border border-neutral-300 px-5 text-sm font-bold hover:border-neutral-500 dark:border-neutral-700">
            {racing ? "Add a round" : "Add a match"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <div className={kicker}>{racing ? "Constructors" : "Teams"}</div>
          <div className="gs-display mt-2 text-5xl font-extrabold leading-none">{teams.length}</div>
          <button type="button" onClick={() => onTab("roster")} className="mt-3 cursor-pointer text-sm font-bold underline">Manage</button>
        </div>
        {racing && (
          <div className={card}>
            <div className={kicker}>Drivers</div>
            <div className="gs-display mt-2 text-5xl font-extrabold leading-none">{drivers.length}</div>
            <button type="button" onClick={() => onTab("roster")} className="mt-3 cursor-pointer text-sm font-bold underline">Manage</button>
          </div>
        )}
        <div className={card}>
          <div className={kicker}>Played</div>
          <div className="gs-display mt-2 text-5xl font-extrabold leading-none">{events.filter((e) => e.status === "final").length}<span className="text-2xl text-neutral-400"> / {events.length}</span></div>
          <button type="button" onClick={() => onTab("events")} className="mt-3 cursor-pointer text-sm font-bold underline">Schedule</button>
        </div>
      </div>

      {latest.length > 0 && (
        <div className={card}>
          <div className={kicker}>Latest results</div>
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {latest.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                <span className="truncate font-bold">{label(e)}</span>
                <span className="shrink-0 text-sm text-neutral-500">
                  {e.homeTeamId && e.awayTeamId && e.homeScore != null ? `${e.homeScore}-${e.awayScore}${e.overtime ? " OT" : ""} · ` : ""}
                  {formatDateTime(e.startsAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
