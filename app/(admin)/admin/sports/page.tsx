"use client";
import { toast, confirmDialog, promptDialog } from "@/components/gs/dialogs";
import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { AdminRow, AdminSwitch } from "@/components/gs/admin-form";
import { AdminDrawer } from "@/components/gs/admin-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, ArrowDown, ArrowUp, Trophy, Trash2, Loader2, Upload } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canManageSports } from "@/lib/rbac";
import { useSportsData, type SportsArticle, type SportsDriver, type SportsEvent, type SportsLeague, type SportsVenue } from "@/lib/use-sports-data";
import { broadcastLabel } from "@/components/sports/sports-ui";
import { computeRacingStandings, computeTeamStandings, parseRaceResults, parseRules, type RacingRules, type RaceResultEntry, type TeamRules } from "@/lib/sports";
import { formatDateTime } from "@/lib/utils";

type Tab = "overview" | "events" | "roster" | "leagues" | "venues";

const labelClass = "block text-sm font-semibold mb-1";
const selectClass =
  "w-full h-10 rounded-full border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const cardClass = "p-5 sm:p-6 space-y-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:sticky lg:top-24 self-start";
const primaryBtn = "font-semibold bg-brand hover:bg-brand-hover text-brand-ink cursor-pointer shadow-sm disabled:opacity-50";

const listCard = "divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900";
const iconBtn = "cursor-pointer p-1.5 text-neutral-400 transition hover:text-red-500";

function SectionHead({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-extrabold">{title}{count !== undefined && <span className="ml-2 font-normal text-neutral-500">{count}</span>}</h2>
      {action}
    </div>
  );
}

/** Adds a venue from a prompt and hands back its id, so a form can pick it straight away. */
async function quickVenue(run: (fn: () => Promise<unknown>) => Promise<boolean>, pick: (id: string) => void) {
  const name = ((await promptDialog("Name of the new venue:")) || "").trim();
  if (!name) return;
  await run(async () => {
    const json = (await api("POST", "venues", { name })) as { item?: { id?: string } };
    if (json.item?.id) pick(json.item.id);
  });
}

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
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer rounded-full border border-neutral-300 dark:border-neutral-700 px-4 py-2">
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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const editingLeague = leagues.find((l) => l.id === editing);

  return (
    <div className="space-y-4">
      <SectionHead title="Leagues" count={leagues.length} action={<Button size="sm" onClick={() => setCreating(true)} className={`h-10 px-5 text-sm ${primaryBtn}`}>New league</Button>} />
      {leagues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">No leagues yet.</div>
      ) : (
        <ul className={listCard}>
          {leagues.map((l) => (
            <li key={l.id} className="flex items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 p-1.5 dark:border-neutral-700 dark:bg-neutral-800" style={{ borderColor: l.color || undefined }}>
                {l.logoUrl ? <img src={l.logoUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-xs font-extrabold">{l.name.slice(0, 2).toUpperCase()}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{l.name}</div>
                <div className="text-xs text-neutral-500">
                  {l.kind === "racing" ? "Racing" : "Team sport"} · {l.sport} · Season {l.season}
                  {l.kind === "racing" && ` · ${l.scoring === "points" ? "points table" : "wins, then podiums"}`}
                </div>
              </div>
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setEditing(l.id)}>Edit</Button>
              <button
                type="button"
                title="Delete league"
                className={iconBtn}
                onClick={async () => {
                  if (await confirmDialog(`Delete ${l.name} and all its teams, drivers and events?`)) run(() => api("DELETE", "leagues", undefined, l.id));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <AdminDrawer title="New league" onClose={() => setCreating(false)}>
          <p className="text-sm text-neutral-500">A season of racing or a team sport. Logo, banner and scoring rules are set afterwards with Edit.</p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("POST", "leagues", { name, kind, sport, season, color, scoring: kind === "racing" ? scoring : "points" }))) {
                setName("");
                setCreating(false);
              }
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
        </AdminDrawer>
      )}

      {editingLeague && (
        <AdminDrawer title={editingLeague.name} onClose={() => setEditing(null)}>
          <RulesEditor key={editingLeague.id} league={editingLeague} busy={busy} run={run} onSaved={() => setEditing(null)} />
        </AdminDrawer>
      )}
    </div>
  );
}

function RulesEditor({ league, busy, run, onSaved }: { league: SportsLeague; busy: boolean; run: RunFn; onSaved?: () => void }) {
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

  const save = async () => {
    if (await run(() =>
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
    )) onSaved?.();
  };

  return (
    <div className="space-y-4">
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
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <SectionHead title="Venues" count={venues.length} action={<Button size="sm" onClick={() => setAdding(true)} className={`h-10 px-5 text-sm ${primaryBtn}`}>Add venue</Button>} />
      <p className="text-sm text-neutral-500">Tracks and stages. The photo shows on the Sports hub, calendar and league overview.</p>
      {venues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">No venues yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <Card key={v.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className="h-32 bg-neutral-200 dark:bg-neutral-800">{v.photoUrl && <img src={v.photoUrl} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex items-center justify-between gap-2 p-3">
                <span className="truncate text-sm font-semibold">{v.name}</span>
                <div className="flex items-center gap-2">
                  <PhotoButton label={v.photoUrl ? "Replace" : "Upload"} onUploaded={(url) => run(() => api("PATCH", "venues", { photoUrl: url }, v.id))} />
                  <button type="button" title="Delete" className={iconBtn} onClick={async () => (await confirmDialog(`Delete ${v.name}?`)) && run(() => api("DELETE", "venues", undefined, v.id))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {adding && (
        <AdminDrawer title="Add venue" onClose={() => setAdding(false)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("POST", "venues", { name }))) {
                setName("");
                setAdding(false);
              }
            }}
          >
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal Pass" /></Field>
            <Button type="submit" disabled={busy || !name.trim()} className={`w-full ${primaryBtn}`}>Add venue</Button>
          </form>
        </AdminDrawer>
      )}
    </div>
  );
}

/** A table cell that edits in place and saves on blur or Enter. */
function InlineCell({ value, onSave, label, placeholder, className = "" }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v.trim() !== value.trim()) onSave(v.trim()); };
  return (
    <input
      value={v}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); } }}
      className={`h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-transparent px-2 text-sm font-semibold hover:border-neutral-400 dark:border-neutral-800 focus:border-brand focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:border-neutral-600 dark:focus:bg-neutral-950 ${className}`}
    />
  );
}

function RosterTab({ league, data, busy, run }: { league: SportsLeague; data: ReturnType<typeof useSportsData>["data"]; busy: boolean; run: RunFn }) {
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const drivers = data.drivers.filter((d) => d.leagueId === league.id);
  const [drawer, setDrawer] = useState<null | "team" | "driver">(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [teamColor, setTeamColor] = useState("");
  const [teamLogo, setTeamLogo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverNumber, setDriverNumber] = useState("");
  const [driverTeam, setDriverTeam] = useState("");
  const [driverRoblox, setDriverRoblox] = useState("");
  const racing = league.kind === "racing";
  const openTeam = (t?: (typeof teams)[number]) => {
    setEditId(t?.id ?? null);
    setTeamName(t?.name ?? ""); setShortName(t?.shortName ?? ""); setTeamColor(t?.color ?? ""); setTeamLogo(t?.logoUrl ?? "");
    setDrawer("team");
  };
  const openDriver = (d?: (typeof drivers)[number]) => {
    setEditId(d?.id ?? null);
    setDriverName(d?.name ?? ""); setDriverNumber(d?.number != null ? String(d.number) : ""); setDriverTeam(d?.teamId ?? ""); setDriverRoblox(d?.robloxUsername ?? "");
    setDrawer("driver");
  };

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <SectionHead title={racing ? "Constructors" : "Teams"} count={teams.length} action={<Button size="sm" onClick={() => openTeam()} className={`h-10 px-5 text-sm ${primaryBtn}`}>{racing ? "Add constructor" : "Add team"}</Button>} />
        {teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">Nobody here yet.</div>
        ) : (
          <ul className={listCard}>
            {teams.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 pl-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-700 dark:bg-neutral-800">
                  {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-full w-full object-contain" /> : <span className="h-4 w-4 rounded-full" style={{ backgroundColor: t.color || "#525252" }} />}
                </span>
                <div className="min-w-[10rem] flex-1">
                  <InlineCell value={t.name} label={`Name of ${t.name}`} onSave={(v) => v && run(() => api("PATCH", "teams", { name: v }, t.id))} />
                </div>
                <div className="w-20"><InlineCell value={t.shortName ?? ""} label={`Short name of ${t.name}`} placeholder="Short" onSave={(v) => run(() => api("PATCH", "teams", { shortName: v }, t.id))} /></div>
                <div className="w-28"><InlineCell value={t.color ?? ""} label={`Colour of ${t.name}`} placeholder="#FF0000" onSave={(v) => run(() => api("PATCH", "teams", { color: v }, t.id))} /></div>
                {racing && <span className="w-20 text-xs text-neutral-500">{drivers.filter((d) => d.teamId === t.id).length} {drivers.filter((d) => d.teamId === t.id).length === 1 ? "driver" : "drivers"}</span>}
                <PhotoButton label={t.logoUrl ? "Replace logo" : "Upload logo"} onUploaded={(url) => run(() => api("PATCH", "teams", { logoUrl: url }, t.id))} />
                {t.logoUrl && (
                  <button type="button" className="cursor-pointer text-xs text-neutral-500 hover:text-red-500" onClick={() => run(() => api("PATCH", "teams", { logoUrl: null }, t.id))}>
                    Remove
                  </button>
                )}
                <button type="button" title="Delete" className={iconBtn} onClick={async () => (await confirmDialog(`Delete ${t.name}?`)) && run(() => api("DELETE", "teams", undefined, t.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {racing && (
        <section className="space-y-4">
          <SectionHead title="Drivers" count={drivers.length} action={<Button size="sm" onClick={() => openDriver()} className={`h-10 px-5 text-sm ${primaryBtn}`}>Add driver</Button>} />
          {drivers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">No drivers yet.</div>
          ) : (
            <ul className={listCard}>
              {drivers.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 pl-4">
                  <div className="w-14"><InlineCell value={d.number != null ? String(d.number) : ""} label={`Number of ${d.name}`} placeholder="#" className="gs-display text-center text-lg font-extrabold text-brand-text" onSave={(v) => run(() => api("PATCH", "drivers", { number: v || null }, d.id))} /></div>
                  <div className="min-w-[10rem] flex-1"><InlineCell value={d.name} label={`Name of ${d.name}`} onSave={(v) => v && run(() => api("PATCH", "drivers", { name: v }, d.id))} /></div>
<div className="w-48">
                    <select
                      aria-label={`Constructor of ${d.name}`}
                      value={d.teamId ?? ""}
                      onChange={(e) => run(() => api("PATCH", "drivers", { teamId: e.target.value || null }, d.id))}
                      className={`${selectClass} h-9`}
                    >
                      <option value="">No constructor</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="w-36"><InlineCell value={d.robloxUsername ?? ""} label={`Roblox username of ${d.name}`} placeholder="Roblox name" onSave={(v) => run(() => api("PATCH", "drivers", { robloxUsername: v || null }, d.id))} /></div>
                  <button type="button" title="Delete" className={iconBtn} onClick={async () => (await confirmDialog(`Delete ${d.name}?`)) && run(() => api("DELETE", "drivers", undefined, d.id))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {drawer === "team" && (
        <AdminDrawer title={editId ? "Edit " + (racing ? "constructor" : "team") : racing ? "Add constructor" : "Add team"} onClose={() => setDrawer(null)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => (editId ? api("PATCH", "teams", { name: teamName, shortName, color: teamColor, logoUrl: teamLogo || null }, editId) : api("POST", "teams", { leagueId: league.id, name: teamName, shortName, color: teamColor, logoUrl: teamLogo || null })))) {
                setTeamName(""); setShortName(""); setTeamColor(""); setTeamLogo("");
                setDrawer(null);
              }
            }}
          >
            <Field label="Name"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Short name"><Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="ABC" /></Field>
              <Field label="Colour"><Input value={teamColor} onChange={(e) => setTeamColor(e.target.value)} placeholder="#FF0000" /></Field>
            </div>
            <div className="flex items-center gap-3">
              {teamLogo && <img src={teamLogo} alt="" className="h-10 w-10 rounded-full border border-neutral-300 bg-neutral-100 p-1 object-contain dark:border-neutral-700 dark:bg-neutral-900" />}
              <PhotoButton label={teamLogo ? "Replace logo" : "Upload logo"} onUploaded={(url) => setTeamLogo(url)} />
            </div>
            <Button type="submit" disabled={busy || !teamName.trim()} className={`w-full ${primaryBtn}`}>{editId ? "Save changes" : racing ? "Add constructor" : "Add team"}</Button>
          </form>
        </AdminDrawer>
      )}

      {drawer === "driver" && (
        <AdminDrawer title={editId ? "Edit driver" : "Add driver"} onClose={() => setDrawer(null)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => (editId ? api("PATCH", "drivers", { name: driverName, number: driverNumber || null, teamId: driverTeam || null, robloxUsername: driverRoblox || null }, editId) : api("POST", "drivers", { leagueId: league.id, name: driverName, number: driverNumber || null, teamId: driverTeam || null, robloxUsername: driverRoblox || null })))) {
                setDriverName(""); setDriverNumber(""); setDriverRoblox("");
                setDrawer(null);
              }
            }}
          >
            <Field label="Name"><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></Field>
            <Field label="Roblox username (for the headshot)"><Input value={driverRoblox} onChange={(e) => setDriverRoblox(e.target.value)} placeholder="optional" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Number"><Input value={driverNumber} onChange={(e) => setDriverNumber(e.target.value)} /></Field>
              <Field label="Constructor">
                <select value={driverTeam} onChange={(e) => setDriverTeam(e.target.value)} className={selectClass}>
                  <option value="">None</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            </div>
            <Button type="submit" disabled={busy || !driverName.trim()} className={`w-full ${primaryBtn}`}>{editId ? "Save changes" : "Add driver"}</Button>
          </form>
        </AdminDrawer>
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
  const [adding, setAdding] = useState(false);
  const editingEvent = events.find((e) => e.id === editing);

  const title = (e: SportsEvent) =>
    e.homeTeamId && e.awayTeamId
      ? `${teams.find((t) => t.id === e.homeTeamId)?.name ?? "?"} vs ${teams.find((t) => t.id === e.awayTeamId)?.name ?? "?"}`
      : `${e.round ? `Round ${e.round}: ` : ""}${e.name || "Race"}`;

  const now = Date.now();
  const needs = events.filter((e) => e.status === "scheduled" && +new Date(e.startsAt) < now);
  const upcoming = events.filter((e) => (e.status === "scheduled" && +new Date(e.startsAt) >= now) || e.status === "postponed" || (e.status !== "final" && e.status !== "scheduled"));
  const done = events.filter((e) => e.status === "final").reverse();

  const row = (e: SportsEvent) => {
    const venueName = data.venues.find((v) => v.id === e.venueId)?.name;
    const bc = broadcastLabel(e.id, data.broadcasts);
    return (
      <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">
            {title(e)}
            {e.status === "final" && e.homeScore != null && <span className="ml-2 text-neutral-500">{e.homeScore}-{e.awayScore}{e.overtime ? " OT" : ""}</span>}
          </div>
          <div className="text-xs text-neutral-500">
            {formatDateTime(e.startsAt)}
            {e.status !== "scheduled" && e.status !== "final" && <> · <span className="font-bold capitalize">{e.status}</span></>}
            {venueName ? ` · ${venueName}` : e.venue ? ` · ${e.venue}` : ""}
            {bc ? ` · ${bc}` : ""}
            {articles.find((a) => a.id === e.articleId) ? " · Report linked" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={e.status === "final" ? "outline" : "default"} className={e.status === "final" ? "cursor-pointer" : `cursor-pointer ${primaryBtn}`} onClick={() => setEditing(e.id)}>
            {e.status === "final" ? "Edit result" : "Enter result"}
          </Button>
          {e.status === "scheduled" && (
            <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => run(() => api("PATCH", "events", { status: "postponed" }, e.id))}>Postpone</Button>
          )}
          {e.status !== "scheduled" && e.status !== "final" && (
            <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => run(() => api("PATCH", "events", { status: "scheduled" }, e.id))}>Reschedule</Button>
          )}
          <button type="button" title="Delete" className={iconBtn} onClick={async () => (await confirmDialog("Delete this event?")) && run(() => api("DELETE", "events", undefined, e.id))}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  };

  const group = (label: string, note: string, list: SportsEvent[]) =>
    list.length === 0 ? null : (
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-extrabold">{label} <span className="font-normal text-neutral-500">{list.length}</span></h3>
          <p className="text-xs text-neutral-500">{note}</p>
        </div>
        <ul className={listCard}>{list.map(row)}</ul>
      </section>
    );

  return (
    <div className="space-y-8">
      <SectionHead title="Schedule & results" action={<Button size="sm" onClick={() => setAdding(true)} className={`h-10 px-5 text-sm ${primaryBtn}`}>{racing ? "Add round" : "Add match"}</Button>} />
      {events.length === 0 && <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">No events yet.</div>}
      {group("Needs a result", "Started already, no result entered.", needs)}
      {group("Coming up", "Scheduled, postponed or in progress.", upcoming)}
      {group("Finished", "Latest first.", done)}

      {adding && (
        <AdminDrawer title={racing ? "Add round" : "Add match"} onClose={() => setAdding(false)}>
          <form
            className="space-y-4"
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
              if (ok) { setName(""); setRound(""); setVenue(""); setAdding(false); }
            }}
          >
            {racing ? (
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal Rally" /></Field>
                <Field label="Round"><Input value={round} onChange={(e) => setRound(e.target.value)} /></Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            )}
            <Field label="Venue (with photo)">
              <select value={venueId} onChange={(e) => (e.target.value === "__new" ? quickVenue(run, setVenueId) : setVenueId(e.target.value))} className={selectClass}>
                <option value="">None</option>
                {data.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                <option value="__new">+ New venue…</option>
              </select>
            </Field>
            <Field label="Location note (optional)"><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
            <Field label="Start (your local time)"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
            <Button type="submit" disabled={busy || !startsAt || (!racing && (!home || !away))} className={`w-full ${primaryBtn}`}>{racing ? "Add round" : "Add match"}</Button>
          </form>
        </AdminDrawer>
      )}

      {editingEvent && (
        <AdminDrawer title={title(editingEvent)} wide onClose={() => setEditing(null)}>
          <ResultEditor
            key={editingEvent.id}
            event={editingEvent}
            racing={racing}
            league={league}
            venues={data.venues}
            articles={articles}
            broadcast={broadcastLabel(editingEvent.id, data.broadcasts)}
            drivers={data.drivers.filter((d) => d.leagueId === league.id)}
            busy={busy}
            run={run}
            onSaved={() => setEditing(null)}
          />
        </AdminDrawer>
      )}
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
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-extrabold">{racing ? `Finishing order${points ? "" : " (no points in this series)"}` : "Score"}</h3>
        {racing ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[2rem_minmax(0,1fr)_8rem] items-center gap-2 rounded-2xl border border-neutral-200 p-2 dark:border-neutral-800 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_6.5rem_auto]">
                <span className="gs-display text-center text-lg font-extrabold text-brand-text">{i + 1}</span>
                <select value={r.driverId} onChange={(e) => patchRow(i, { driverId: e.target.value })} className={selectClass}>
                  <option value="">Driver</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.number != null ? `#${d.number} ` : ""}{d.name}</option>)}
                </select>
                <Input value={r.time} onChange={(e) => patchRow(i, { time: e.target.value })} placeholder="48:12.4" className="font-mono" />
                <select value={r.status} onChange={(e) => patchRow(i, { status: e.target.value as Row["status"] })} className={`${selectClass} col-span-3 sm:col-span-1`}>
                  <option value="finished">Finished</option>
                  <option value="dnf">DNF</option>
                  <option value="dsq">DSQ</option>
                </select>
                <span className="col-span-3 flex items-center justify-end gap-2 sm:col-span-1">
                  {points && (
                    <label className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold">
                      <input type="radio" name={`fl-${event.id}`} checked={r.fl} onChange={() => setRows(rows.map((x, j) => ({ ...x, fl: j === i })))} /> FL
                    </label>
                  )}
                  <button type="button" title="Move up" className="cursor-pointer p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" title="Move down" className="cursor-pointer p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                </span>
              </div>
            ))}
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setRows([...rows, { driverId: "", status: "finished", fl: false, time: "" }])}>
              Add row
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 items-end gap-3">
            <Field label="Home score"><Input value={homeScore} onChange={(e) => setHomeScore(e.target.value)} /></Field>
            <Field label="Away score"><Input value={awayScore} onChange={(e) => setAwayScore(e.target.value)} /></Field>
            <AdminRow label="Overtime"><AdminSwitch checked={overtime} onChange={setOvertime} label="Overtime" /></AdminRow>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
        <h3 className="text-base font-extrabold">Details</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Start (local)"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Field label="Video link (optional)"><Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="/plus/watch/..." /></Field>
          <Field label="Venue (with photo)">
            <select value={venueId} onChange={(e) => (e.target.value === "__new" ? quickVenue(run, setVenueId) : setVenueId(e.target.value))} className={selectClass}>
              <option value="">None</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="__new">+ New venue…</option>
            </select>
          </Field>
          <Field label="Round report (published article)">
            <select value={articleId} onChange={(e) => setArticleId(e.target.value)} className={selectClass}>
              <option value="">None</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-neutral-500">Broadcast: {broadcast ?? "none linked. Pick this event in the Schedule admin to show a Livestream or Radio badge."}</p>
      </section>

      <Button disabled={busy} onClick={save} className={`w-full ${primaryBtn}`}>Save result (marks final)</Button>
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

  // Top of the table, computed the same way as the public league page.
  const finals = events.filter((e) => e.status === "final");
  const rules = parseRules(league.kind, league.rulesJson);
  const standings: { id: string; name: string; value: string }[] = racing
    ? computeRacingStandings(drivers, teams.map((t) => t.id), finals, rules as RacingRules, league.scoring).drivers
        .sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums)
        .slice(0, 5)
        .map((r) => ({ id: r.driverId, name: drivers.find((d) => d.id === r.driverId)?.name ?? "?", value: league.scoring === "points" ? `${r.points} pts` : `${r.wins} wins` }))
    : computeTeamStandings(teams.map((t) => t.id), finals, rules as TeamRules)
        .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff)
        .slice(0, 5)
        .map((r) => ({ id: r.teamId, name: teams.find((t) => t.id === r.teamId)?.name ?? "?", value: `${r.points} pts` }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={needsResult.length ? "rounded-2xl border border-[#16110a] bg-[#16110a] p-6 text-[#fff8e6] dark:border-brand/60 dark:bg-black" : card}>
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

      {finals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Standings and latest results appear here after the first {racing ? "race" : "match"} result is entered.
        </div>
      )}

      {finals.length > 0 && standings.length > 0 && (
        <div className={card}>
          <div className={kicker}>{racing ? "Drivers' standings" : "Standings"}</div>
          <ol className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {standings.map((r, i) => (
              <li key={r.id} className="flex items-center gap-4 py-2.5">
                <span className="gs-display w-6 text-center text-lg font-extrabold text-brand-text">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                <span className="text-sm text-neutral-500">{r.value}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

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
