"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog, promptDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, DT_CLASS, Field, Line, PageBar, Pill, Screen, Section, Seg, Sheet, Switch, formatWhen } from "@/components/admin/ui";
import { canManageSports } from "@/lib/rbac";
import { useSportsData, type SportsArticle, type SportsDriver, type SportsEvent, type SportsLeague, type SportsTeam, type SportsVenue } from "@/lib/use-sports-data";
import { broadcastLabel } from "@/components/sports/sports-ui";
import { computeRacingStandings, computeTeamStandings, parseRaceResults, parseRules, type RacingRules, type RaceResultEntry, type TeamRules } from "@/lib/sports";

type Tab = "overview" | "events" | "roster" | "leagues" | "venues";
type Data = ReturnType<typeof useSportsData>["data"];
type RunFn = (fn: () => Promise<unknown>) => Promise<boolean>;
type SheetState =
  | null
  | { kind: "league" }
  | { kind: "league-edit"; id: string }
  | { kind: "venue" }
  | { kind: "team"; id?: string }
  | { kind: "driver"; id?: string }
  | { kind: "event" }
  | { kind: "result"; id: string };

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "events", label: "Schedule & results" },
  { value: "roster", label: "Teams & drivers" },
  { value: "leagues", label: "Leagues" },
  { value: "venues", label: "Venues" },
];

/** Adds a venue from a prompt and hands back its id, so a form can pick it straight away. */
async function quickVenue(run: RunFn, pick: (id: string) => void) {
  const name = ((await promptDialog("Name of the new venue", "", { ok: "Add venue" })) || "").trim();
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
function PhotoButton({ label = "Upload", onUploaded, small = true }: { label?: string; onUploaded: (url: string) => void | Promise<unknown>; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={small ? "btn sm" : "btn"} style={{ flex: "none" }}>
      {busy ? <Loader2 className="ic-sm spin" /> : <Upload className="ic-sm" />}
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
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

/** A field that edits in place and saves on blur or Enter. */
function InlineCell({ value, onSave, label, placeholder, style }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; style?: React.CSSProperties }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v.trim() !== value.trim()) onSave(v.trim());
  };
  return (
    <input
      value={v}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="input sm inline"
      style={{ minWidth: 0, ...style }}
    />
  );
}

function LogoDot({ url, color, text }: { url?: string | null; color?: string | null; text?: string }) {
  return (
    <span className="logo-dot" style={{ borderColor: color || undefined }}>
      {url ? <img src={url} alt="" /> : text ? text : <span style={{ width: 14, height: 14, borderRadius: "50%", background: color || "var(--a-grey)" }} />}
    </span>
  );
}

const eventTitle = (e: SportsEvent, teams: SportsTeam[], racing: boolean) =>
  e.homeTeamId && e.awayTeamId
    ? `${teams.find((t) => t.id === e.homeTeamId)?.name ?? "?"} vs ${teams.find((t) => t.id === e.awayTeamId)?.name ?? "?"}`
    : `${e.round ? `Round ${e.round}: ` : ""}${e.name || (racing ? "Race" : "Match")}`;

export default function AdminSportsConsole() {
  const { data, loading, reload } = useSportsData();
  const [tab, setTab] = useState<Tab>("overview");
  const [leagueId, setLeagueId] = useState("");
  const [busy, setBusy] = useState(false);
  const [articles, setArticles] = useState<SportsArticle[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);

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

  // ?result=<event id> (from Today) opens that event's result editor in its league.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || data.events.length === 0) return;
    setDeepLinked(true);
    const id = new URLSearchParams(window.location.search).get("result");
    const ev = id ? data.events.find((e) => e.id === id) : null;
    if (!ev) return;
    setLeagueId(ev.leagueId);
    setSheet({ kind: "result", id: ev.id });
    window.history.replaceState(null, "", "/admin/sports");
  }, [data.events, deepLinked]);

  const league = data.leagues.find((l) => l.id === leagueId);
  const racing = league?.kind === "racing";
  const perLeague = tab === "overview" || tab === "events" || tab === "roster";

  // Runs an API action, then refreshes; failures show as a toast.
  const run: RunFn = async (fn) => {
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

  const close = () => setSheet(null);
  const main: { label: string; open: SheetState } | null =
    tab === "leagues"
      ? { label: "New league", open: { kind: "league" } }
      : tab === "venues"
        ? { label: "Add venue", open: { kind: "venue" } }
        : !league
          ? null
          : tab === "roster"
            ? { label: racing ? "Add constructor" : "Add team", open: { kind: "team" } }
            : { label: racing ? "Add round" : "Add match", open: { kind: "event" } };

  const leaguePicker = (style?: React.CSSProperties) =>
    perLeague && data.leagues.length > 0 ? (
      <select className="select sm" style={style} value={leagueId} onChange={(e) => (e.target.value === "__new" ? setSheet({ kind: "league" }) : setLeagueId(e.target.value))} aria-label="League">
        {data.leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} {l.season}
          </option>
        ))}
        <option value="__new">+ New league…</option>
      </select>
    ) : null;

  const teams = league ? data.teams.filter((t) => t.leagueId === league.id) : [];
  const drivers = league ? data.drivers.filter((d) => d.leagueId === league.id) : [];
  const editingEvent = sheet?.kind === "result" ? data.events.find((e) => e.id === sheet.id) : undefined;
  const editingLeague = sheet?.kind === "league-edit" ? data.leagues.find((l) => l.id === sheet.id) : undefined;

  return (
    <AdminAuthGuard requiredPermission={canManageSports} featureTitle="Sports">
      <Screen>
        <PageBar
          title="Sports"
          tools={
            <>
              <Seg value={tab} onChange={setTab} options={TABS} label="Show" />
              {leaguePicker({ width: 220 })}
            </>
          }
          end={
            main && (
              <>
                {tab === "roster" && racing && (
                  <button type="button" className="btn has-lbl-m" onClick={() => setSheet({ kind: "driver" })} aria-label="Add driver">
                    <Plus className="ic" />
                    <span className="lbl-m">Add driver</span>
                  </button>
                )}
                <button type="button" className="btn primary has-lbl-m" onClick={() => setSheet(main.open)} aria-label={main.label}>
                  <Plus className="ic" />
                  <span className="lbl-m">{main.label}</span>
                </button>
              </>
            )
          }
          mrow={
            <>
              <select className="select sm" style={{ flex: 1, minWidth: 0 }} value={tab} onChange={(e) => setTab(e.target.value as Tab)} aria-label="Show">
                {TABS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {leaguePicker({ flex: 1, minWidth: 0 })}
            </>
          }
        />
        <Body scroll>
          <div className="today wide">
            {loading ? (
              <div className="empty">Loading…</div>
            ) : perLeague && !league ? (
              <div className="empty" style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                <span>No league yet. Create one to start entering teams, rounds and results.</span>
                <button type="button" className="btn primary" onClick={() => setSheet({ kind: "league" })}>
                  <Plus className="ic" /> New league
                </button>
              </div>
            ) : tab === "overview" && league ? (
              <Overview league={league} data={data} onEnterResult={(id) => setSheet({ kind: "result", id })} onTab={setTab} />
            ) : tab === "events" && league ? (
              <EventsTab league={league} data={data} articles={articles} busy={busy} run={run} onOpen={(id) => setSheet({ kind: "result", id })} />
            ) : tab === "roster" && league ? (
              <RosterTab league={league} teams={teams} drivers={drivers} run={run} />
            ) : tab === "leagues" ? (
              <LeaguesTab leagues={data.leagues} run={run} onEdit={(id) => setSheet({ kind: "league-edit", id })} />
            ) : tab === "venues" ? (
              <VenuesTab venues={data.venues} run={run} />
            ) : null}
          </div>
        </Body>

        {sheet?.kind === "league" && <NewLeague busy={busy} run={run} onClose={close} onCreated={(id) => id && setLeagueId(id)} />}
        {editingLeague && (
          <Sheet title={editingLeague.name} onClose={close} footer={<span className="t12 muted">Logo and banner save as soon as they&apos;re uploaded.</span>}>
            <RulesEditor key={editingLeague.id} league={editingLeague} busy={busy} run={run} onSaved={close} />
          </Sheet>
        )}
        {sheet?.kind === "venue" && <NewVenue busy={busy} run={run} onClose={close} />}
        {sheet?.kind === "team" && league && <TeamForm league={league} team={teams.find((t) => t.id === sheet.id)} busy={busy} run={run} onClose={close} />}
        {sheet?.kind === "driver" && league && <DriverForm league={league} teams={teams} driver={drivers.find((d) => d.id === sheet.id)} busy={busy} run={run} onClose={close} />}
        {sheet?.kind === "event" && league && <EventForm league={league} teams={teams} venues={data.venues} busy={busy} run={run} onClose={close} />}
        {editingEvent && league && (
          <ResultEditor
            key={editingEvent.id}
            event={editingEvent}
            title={eventTitle(editingEvent, teams, racing)}
            racing={racing}
            league={league}
            venues={data.venues}
            articles={articles}
            broadcast={broadcastLabel(editingEvent.id, data.broadcasts)}
            drivers={drivers}
            busy={busy}
            run={run}
            onClose={close}
          />
        )}
      </Screen>
    </AdminAuthGuard>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ league, data, onEnterResult, onTab }: { league: SportsLeague; data: Data; onEnterResult: (eventId: string) => void; onTab: (t: Tab) => void }) {
  const events = data.events.filter((e) => e.leagueId === league.id).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const drivers = data.drivers.filter((d) => d.leagueId === league.id);
  const now = Date.now();
  const needsResult = events.filter((e) => e.status === "scheduled" && +new Date(e.startsAt) < now);
  const upcoming = events.filter((e) => e.status === "scheduled" && +new Date(e.startsAt) >= now);
  const latest = events
    .filter((e) => e.status === "final")
    .slice(-3)
    .reverse();
  const racing = league.kind === "racing";
  const label = (e: SportsEvent) => eventTitle(e, teams, racing);

  // Top of the table, computed the same way as the public league page.
  const finals = events.filter((e) => e.status === "final");
  const rules = parseRules(league.kind, league.rulesJson);
  const standings: { id: string; name: string; value: string }[] = racing
    ? computeRacingStandings(
        drivers,
        teams.map((t) => t.id),
        finals,
        rules as RacingRules,
        league.scoring,
      )
        .drivers.sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums)
        .slice(0, 5)
        .map((r) => ({ id: r.driverId, name: drivers.find((d) => d.id === r.driverId)?.name ?? "?", value: league.scoring === "points" ? `${r.points} pts` : `${r.wins} wins` }))
    : computeTeamStandings(
        teams.map((t) => t.id),
        finals,
        rules as TeamRules,
      )
        .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff)
        .slice(0, 5)
        .map((r) => ({ id: r.teamId, name: teams.find((t) => t.id === r.teamId)?.name ?? "?", value: `${r.points} pts` }));

  const go = (t: Tab) => (e: React.MouseEvent) => {
    e.preventDefault();
    onTab(t);
  };

  return (
    <>
      <p className="greet" style={{ fontWeight: 500 }}>
        {needsResult.length
          ? `${needsResult.length} ${needsResult.length === 1 ? (racing ? "race needs" : "match needs") : racing ? "races need" : "matches need"} a result.`
          : `Every finished ${racing ? "race" : "match"} has its result.`}{" "}
        <span className="muted">
          {teams.length} {racing ? (teams.length === 1 ? "constructor" : "constructors") : teams.length === 1 ? "team" : "teams"}
          {racing ? ` · ${drivers.length} ${drivers.length === 1 ? "driver" : "drivers"}` : ""} · {finals.length} of {events.length} played
        </span>
      </p>

      {needsResult.length > 0 && (
        <section className="todo">
          <h2>
            Needs a result <span className="c">{needsResult.length}</span>
            <a href="#" onClick={go("events")}>
              Schedule & results
            </a>
          </h2>
          <div className="rows">
            {needsResult.map((e) => (
              <div key={e.id} className="r">
                <span className="dot amber" />
                <span className="grow">
                  <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                    {label(e)}
                  </span>
                  <span className="t12 muted">{formatWhen(e.startsAt)}</span>
                </span>
                <button type="button" className="btn sm strong" onClick={() => onEnterResult(e.id)}>
                  Enter result
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="todo">
        <h2>
          Coming up <span className="c">{upcoming.length}</span>
          <a href="#" onClick={go("events")}>
            {racing ? "All rounds" : "All matches"}
          </a>
        </h2>
        {upcoming.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing scheduled.
          </p>
        ) : (
          <div className="rows">
            {upcoming.slice(0, 5).map((e) => (
              <div key={e.id} className="r">
                <span className="t12 num muted" style={{ width: 120, flex: "none" }}>
                  {formatWhen(e.startsAt)}
                </span>
                <span className="grow trunc" style={{ fontWeight: 600 }}>
                  {label(e)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {finals.length > 0 && (
        <div className="two" style={{ alignItems: "start" }}>
          {standings.length > 0 && (
            <section className="todo">
              <h2>{racing ? "Drivers' standings" : "Standings"}</h2>
              <div className="rows">
                {standings.map((r, i) => (
                  <div key={r.id} className="r">
                    <span className="num" style={{ width: 20, textAlign: "center", fontWeight: 700 }}>
                      {i + 1}
                    </span>
                    <span className="grow trunc" style={{ fontWeight: 600 }}>
                      {r.name}
                    </span>
                    <span className="t12 muted num">{r.value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {latest.length > 0 && (
            <section className="todo">
              <h2>Latest results</h2>
              <div className="rows">
                {latest.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="r"
                    style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--a-border)", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
                    onClick={() => onEnterResult(e.id)}
                  >
                    <span className="grow">
                      <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                        {label(e)}
                      </span>
                      <span className="t12 muted">
                        {e.homeTeamId && e.awayTeamId && e.homeScore != null ? `${e.homeScore}-${e.awayScore}${e.overtime ? " OT" : ""} · ` : ""}
                        {formatWhen(e.startsAt)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {finals.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Standings and latest results show here after the first {racing ? "race" : "match"} result is entered.
        </p>
      )}
    </>
  );
}

/* ---------------- Schedule & results ---------------- */

function EventsTab({ league, data, articles, busy, run, onOpen }: { league: SportsLeague; data: Data; articles: SportsArticle[]; busy: boolean; run: RunFn; onOpen: (id: string) => void }) {
  const teams = data.teams.filter((t) => t.leagueId === league.id);
  const events = useMemo(() => data.events.filter((e) => e.leagueId === league.id).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)), [data.events, league.id]);
  const racing = league.kind === "racing";

  const now = Date.now();
  const needs = events.filter((e) => e.status === "scheduled" && +new Date(e.startsAt) < now);
  const upcoming = events.filter((e) => (e.status === "scheduled" && +new Date(e.startsAt) >= now) || (e.status !== "final" && e.status !== "scheduled"));
  const done = events.filter((e) => e.status === "final").reverse();

  const row = (e: SportsEvent) => {
    const venueName = data.venues.find((v) => v.id === e.venueId)?.name;
    const bc = broadcastLabel(e.id, data.broadcasts);
    return (
      <div key={e.id} className="r wrap">
        <span className="grow" style={{ minWidth: 200 }}>
          <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
            {eventTitle(e, teams, racing)}
            {e.status === "final" && e.homeScore != null && (
              <span className="muted" style={{ fontWeight: 500 }}>
                {" "}
                {e.homeScore}-{e.awayScore}
                {e.overtime ? " OT" : ""}
              </span>
            )}
          </span>
          <span className="t12 muted" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {e.status !== "scheduled" && e.status !== "final" && <Pill tone="grey">{e.status === "postponed" ? "Postponed" : e.status === "cancelled" ? "Cancelled" : e.status}</Pill>}
            <span>
              {formatWhen(e.startsAt, { year: true })}
              {venueName ? ` · ${venueName}` : e.venue ? ` · ${e.venue}` : ""}
              {bc ? ` · ${bc}` : ""}
              {articles.find((a) => a.id === e.articleId) ? " · Report linked" : ""}
            </span>
          </span>
        </span>
        <span style={{ display: "flex", gap: 6, flex: "none", marginLeft: "auto" }}>
          {e.status === "scheduled" && (
            <button type="button" className="btn sm ghost" disabled={busy} onClick={() => run(() => api("PATCH", "events", { status: "postponed" }, e.id))}>
              Postpone
            </button>
          )}
          {e.status !== "scheduled" && e.status !== "final" && (
            <button type="button" className="btn sm ghost" disabled={busy} onClick={() => run(() => api("PATCH", "events", { status: "scheduled" }, e.id))}>
              Reschedule
            </button>
          )}
          <button
            type="button"
            className="btn sm ghost danger"
            aria-label="Delete event"
            onClick={async () => (await confirmDialog("Delete this event?", { ok: "Delete", danger: true })) && run(() => api("DELETE", "events", undefined, e.id))}
          >
            <Trash2 className="ic-sm" />
          </button>
          <button type="button" className={e.status === "final" ? "btn sm" : "btn sm strong"} onClick={() => onOpen(e.id)}>
            {e.status === "final" ? "Edit result" : "Enter result"}
          </button>
        </span>
      </div>
    );
  };

  const group = (label: string, list: SportsEvent[]) =>
    list.length === 0 ? null : (
      <section className="todo">
        <h2>
          {label} <span className="c">{list.length}</span>
        </h2>
        <div className="rows">{list.map(row)}</div>
      </section>
    );

  return (
    <>
      {events.length === 0 && <div className="empty">No {racing ? "rounds" : "matches"} yet.</div>}
      {group("Needs a result", needs)}
      {group("Coming up", upcoming)}
      {group("Finished", done)}
    </>
  );
}

function EventForm({ league, teams, venues, busy, run, onClose }: { league: SportsLeague; teams: SportsTeam[]; venues: SportsVenue[]; busy: boolean; run: RunFn; onClose: () => void }) {
  const racing = league.kind === "racing";
  const [name, setName] = useState("");
  const [round, setRound] = useState("");
  const [venue, setVenue] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const label = racing ? "Add round" : "Add match";
  const submit = async (e: React.FormEvent) => {
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
      }),
    );
    if (ok) onClose();
  };
  return (
    <Sheet
      title={label}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sports-event" className="btn primary" disabled={busy || !startsAt || (!racing && (!home || !away))}>
            {label}
          </button>
        </>
      }
    >
      <form id="sports-event" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        {racing ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 12 }}>
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal Rally" />
            </Field>
            <Field label="Round">
              <input className="input" value={round} onChange={(e) => setRound(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        ) : (
          <div className="two">
            <Field label="Home">
              <Select value={home} onChange={(e) => setHome(e.target.value)} className="select">
                <option value="">Pick a team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Away">
              <Select value={away} onChange={(e) => setAway(e.target.value)} className="select">
                <option value="">Pick a team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Starts" help="Your local time.">
          <DateTimeInput type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={DT_CLASS} />
        </Field>
        <Field label="Venue" help="Venues have a photo that shows on the Sports pages.">
          <Select value={venueId} onChange={(e) => (e.target.value === "__new" ? quickVenue(run, setVenueId) : setVenueId(e.target.value))} className="select">
            <option value="">None</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            <option value="__new">+ New venue…</option>
          </Select>
        </Field>
        <Field label="Location note" help="Optional, shown next to the venue.">
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}

function ResultEditor({
  event,
  title,
  racing,
  league,
  venues,
  articles,
  broadcast,
  drivers,
  busy,
  run,
  onClose,
}: {
  event: SportsEvent;
  title: string;
  racing: boolean;
  league: SportsLeague;
  venues: SportsVenue[];
  articles: SportsArticle[];
  broadcast: string | null;
  drivers: SportsDriver[];
  busy: boolean;
  run: RunFn;
  onClose: () => void;
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
      : drivers.map(() => ({ driverId: "", status: "finished", fl: false, time: "" })),
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
    if (await run(() => api("PATCH", "events", body, event.id))) onClose();
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            Save result
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 20 }}>
        <Section title={racing ? "Finishing order" : "Score"} desc={racing && !points ? "No points in this series: only the order counts." : "Saving marks the event as final."}>
          {racing ? (
            <div className="rows">
              {rows.map((r, i) => (
                <div key={i} className="r wrap" style={{ gap: 8, padding: "8px 10px" }}>
                  <span className="num" style={{ width: 22, textAlign: "center", fontWeight: 700, flex: "none" }}>
                    {i + 1}
                  </span>
                  <Select
                    value={r.driverId}
                    onChange={(e) => patchRow(i, { driverId: e.target.value })}
                    className="select sm"
                    style={{ flex: "1 1 180px", minWidth: 0 }}
                    aria-label={`Driver in position ${i + 1}`}
                  >
                    <option value="">Driver</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.number != null ? `#${d.number} ` : ""}
                        {d.name}
                      </option>
                    ))}
                  </Select>
                  <input
                    className="input sm num"
                    style={{ width: 96, flex: "none" }}
                    value={r.time}
                    onChange={(e) => patchRow(i, { time: e.target.value })}
                    placeholder="48:12.4"
                    aria-label={`Time for position ${i + 1}`}
                  />
                  <Select
                    value={r.status}
                    onChange={(e) => patchRow(i, { status: e.target.value as Row["status"] })}
                    className="select sm"
                    style={{ width: 104, flex: "none" }}
                    aria-label={`Status for position ${i + 1}`}
                  >
                    <option value="finished">Finished</option>
                    <option value="dnf">DNF</option>
                    <option value="dsq">DSQ</option>
                  </Select>
                  <span style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", flex: "none" }}>
                    {points && (
                      <label className="t12" style={{ display: "inline-flex", gap: 4, alignItems: "center", marginRight: 6, whiteSpace: "nowrap", cursor: "pointer" }} title="Fastest lap">
                        <input type="radio" name={`fl-${event.id}`} checked={r.fl} onChange={() => setRows(rows.map((x, j) => ({ ...x, fl: j === i })))} /> Fastest lap
                      </label>
                    )}
                    <button type="button" className="iconbtn" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp className="ic-sm" />
                    </button>
                    <button type="button" className="iconbtn" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                      <ArrowDown className="ic-sm" />
                    </button>
                  </span>
                </div>
              ))}
              <div className="r">
                <button type="button" className="btn sm ghost" onClick={() => setRows([...rows, { driverId: "", status: "finished", fl: false, time: "" }])}>
                  <Plus className="ic-sm" /> Add a row
                </button>
              </div>
            </div>
          ) : (
            <div className="three" style={{ alignItems: "end" }}>
              <Field label="Home score">
                <input className="input" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Away score">
                <input className="input" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} inputMode="numeric" />
              </Field>
              <Line label="Overtime">
                <Switch checked={overtime} onChange={setOvertime} label="Overtime" />
              </Line>
            </div>
          )}
        </Section>

        <Section title="Details">
          <div className="two">
            <Field label="Starts" help="Your local time.">
              <DateTimeInput type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={DT_CLASS} />
            </Field>
            <Field label="Video link" help="Optional.">
              <input className="input" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="/plus/watch/…" />
            </Field>
            <Field label="Venue">
              <Select value={venueId} onChange={(e) => (e.target.value === "__new" ? quickVenue(run, setVenueId) : setVenueId(e.target.value))} className="select">
                <option value="">None</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                <option value="__new">+ New venue…</option>
              </Select>
            </Field>
            <Field label="Round report" help="A published article.">
              <Select value={articleId} onChange={(e) => setArticleId(e.target.value)} className="select">
                <option value="">None</option>
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="help" style={{ margin: 0 }}>
            Broadcast: {broadcast ?? "none linked. Pick this event on a broadcast in the Schedule to show a Livestream or Radio badge."}
          </p>
        </Section>
      </div>
    </Sheet>
  );
}

/* ---------------- Teams & drivers ---------------- */

function RosterTab({ league, teams, drivers, run }: { league: SportsLeague; teams: SportsTeam[]; drivers: SportsDriver[]; run: RunFn }) {
  const racing = league.kind === "racing";
  return (
    <>
      <section className="todo">
        <h2>
          {racing ? "Constructors" : "Teams"} <span className="c">{teams.length}</span>
        </h2>
        {teams.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nobody here yet.
          </p>
        ) : (
          <div className="rows">
            {teams.map((t) => {
              const n = drivers.filter((d) => d.teamId === t.id).length;
              return (
                <div key={t.id} className="r wrap" style={{ gap: 8 }}>
                  <LogoDot url={t.logoUrl} color={t.color} />
                  <InlineCell value={t.name} label={`Name of ${t.name}`} style={{ flex: "1 1 180px" }} onSave={(v) => v && run(() => api("PATCH", "teams", { name: v }, t.id))} />
                  <InlineCell
                    value={t.shortName ?? ""}
                    label={`Short name of ${t.name}`}
                    placeholder="Short"
                    style={{ width: 80, flex: "none" }}
                    onSave={(v) => run(() => api("PATCH", "teams", { shortName: v }, t.id))}
                  />
                  <InlineCell
                    value={t.color ?? ""}
                    label={`Colour of ${t.name}`}
                    placeholder="#FF0000"
                    style={{ width: 104, flex: "none" }}
                    onSave={(v) => run(() => api("PATCH", "teams", { color: v }, t.id))}
                  />
                  {racing && (
                    <span className="t12 muted" style={{ width: 64, flex: "none" }}>
                      {n} {n === 1 ? "driver" : "drivers"}
                    </span>
                  )}
                  <span style={{ display: "flex", gap: 6, marginLeft: "auto", flex: "none" }}>
                    <PhotoButton label={t.logoUrl ? "Replace logo" : "Upload logo"} onUploaded={(url) => run(() => api("PATCH", "teams", { logoUrl: url }, t.id))} />
                    {t.logoUrl && (
                      <button type="button" className="btn sm ghost" onClick={() => run(() => api("PATCH", "teams", { logoUrl: null }, t.id))}>
                        Remove logo
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn sm ghost danger"
                      aria-label={`Delete ${t.name}`}
                      onClick={async () => (await confirmDialog(`Delete ${t.name}?`, { ok: "Delete", danger: true })) && run(() => api("DELETE", "teams", undefined, t.id))}
                    >
                      <Trash2 className="ic-sm" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {racing && (
        <section className="todo">
          <h2>
            Drivers <span className="c">{drivers.length}</span>
          </h2>
          {drivers.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No drivers yet.
            </p>
          ) : (
            <div className="rows">
              {drivers.map((d) => (
                <div key={d.id} className="r wrap" style={{ gap: 8 }}>
                  <InlineCell
                    value={d.number != null ? String(d.number) : ""}
                    label={`Number of ${d.name}`}
                    placeholder="#"
                    style={{ width: 52, flex: "none", textAlign: "center" }}
                    onSave={(v) => run(() => api("PATCH", "drivers", { number: v || null }, d.id))}
                  />
                  <InlineCell value={d.name} label={`Name of ${d.name}`} style={{ flex: "1 1 180px" }} onSave={(v) => v && run(() => api("PATCH", "drivers", { name: v }, d.id))} />
                  <Select
                    aria-label={`Constructor of ${d.name}`}
                    value={d.teamId ?? ""}
                    onChange={(e) => run(() => api("PATCH", "drivers", { teamId: e.target.value || null }, d.id))}
                    className="select sm"
                    style={{ width: 180, flex: "none" }}
                  >
                    <option value="">No constructor</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <InlineCell
                    value={d.robloxUsername ?? ""}
                    label={`Roblox username of ${d.name}`}
                    placeholder="Roblox name"
                    style={{ width: 150, flex: "none" }}
                    onSave={(v) => run(() => api("PATCH", "drivers", { robloxUsername: v || null }, d.id))}
                  />
                  <button
                    type="button"
                    className="btn sm ghost danger"
                    style={{ marginLeft: "auto" }}
                    aria-label={`Delete ${d.name}`}
                    onClick={async () => (await confirmDialog(`Delete ${d.name}?`, { ok: "Delete", danger: true })) && run(() => api("DELETE", "drivers", undefined, d.id))}
                  >
                    <Trash2 className="ic-sm" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function TeamForm({ league, team, busy, run, onClose }: { league: SportsLeague; team?: SportsTeam; busy: boolean; run: RunFn; onClose: () => void }) {
  const racing = league.kind === "racing";
  const [teamName, setTeamName] = useState(team?.name ?? "");
  const [shortName, setShortName] = useState(team?.shortName ?? "");
  const [teamColor, setTeamColor] = useState(team?.color ?? "");
  const [teamLogo, setTeamLogo] = useState(team?.logoUrl ?? "");
  const noun = racing ? "constructor" : "team";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: teamName, shortName, color: teamColor, logoUrl: teamLogo || null };
    if (await run(() => (team ? api("PATCH", "teams", body, team.id) : api("POST", "teams", { leagueId: league.id, ...body })))) onClose();
  };
  return (
    <Sheet
      title={team ? `Edit ${noun}` : `Add ${noun}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sports-team" className="btn primary" disabled={busy || !teamName.trim()}>
            {team ? "Save changes" : `Add ${noun}`}
          </button>
        </>
      }
    >
      <form id="sports-team" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <Field label="Name">
          <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} autoFocus />
        </Field>
        <div className="two">
          <Field label="Short name">
            <input className="input" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="ABC" />
          </Field>
          <Field label="Colour">
            <input className="input" value={teamColor} onChange={(e) => setTeamColor(e.target.value)} placeholder="#FF0000" />
          </Field>
        </div>
        <Field label="Logo">
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {teamLogo && <LogoDot url={teamLogo} />}
            <PhotoButton small={false} label={teamLogo ? "Replace logo" : "Upload logo"} onUploaded={(url) => setTeamLogo(url)} />
          </span>
        </Field>
      </form>
    </Sheet>
  );
}

function DriverForm({ league, teams, driver, busy, run, onClose }: { league: SportsLeague; teams: SportsTeam[]; driver?: SportsDriver; busy: boolean; run: RunFn; onClose: () => void }) {
  const [driverName, setDriverName] = useState(driver?.name ?? "");
  const [driverNumber, setDriverNumber] = useState(driver?.number != null ? String(driver.number) : "");
  const [driverTeam, setDriverTeam] = useState(driver?.teamId ?? "");
  const [driverRoblox, setDriverRoblox] = useState(driver?.robloxUsername ?? "");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: driverName, number: driverNumber || null, teamId: driverTeam || null, robloxUsername: driverRoblox || null };
    if (await run(() => (driver ? api("PATCH", "drivers", body, driver.id) : api("POST", "drivers", { leagueId: league.id, ...body })))) onClose();
  };
  return (
    <Sheet
      title={driver ? "Edit driver" : "Add driver"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sports-driver" className="btn primary" disabled={busy || !driverName.trim()}>
            {driver ? "Save changes" : "Add driver"}
          </button>
        </>
      }
    >
      <form id="sports-driver" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <Field label="Name">
          <input className="input" value={driverName} onChange={(e) => setDriverName(e.target.value)} autoFocus />
        </Field>
        <Field label="Roblox username" help="Optional. Used for the driver's headshot.">
          <input className="input" value={driverRoblox} onChange={(e) => setDriverRoblox(e.target.value)} />
        </Field>
        <div className="two">
          <Field label="Number">
            <input className="input" value={driverNumber} onChange={(e) => setDriverNumber(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Constructor">
            <Select value={driverTeam} onChange={(e) => setDriverTeam(e.target.value)} className="select">
              <option value="">None</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------------- Leagues ---------------- */

function LeaguesTab({ leagues, run, onEdit }: { leagues: SportsLeague[]; run: RunFn; onEdit: (id: string) => void }) {
  if (leagues.length === 0) return <div className="empty">No leagues yet.</div>;
  return (
    <div className="rows">
      {leagues.map((l) => (
        <div key={l.id} className="r">
          <LogoDot url={l.logoUrl} color={l.color} text={l.name.slice(0, 2).toUpperCase()} />
          <span className="grow">
            <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
              {l.name}
            </span>
            <span className="t12 muted trunc" style={{ display: "block" }}>
              {l.kind === "racing" ? "Racing" : "Team sport"} · {l.sport} · Season {l.season}
              {l.kind === "racing" && ` · ${l.scoring === "points" ? "points table" : "wins, then podiums"}`}
            </span>
          </span>
          <button
            type="button"
            className="btn sm ghost danger"
            aria-label={`Delete ${l.name}`}
            onClick={async () => {
              if (await confirmDialog(`Delete ${l.name} and all its teams, drivers and events?`, { ok: "Delete league", danger: true })) run(() => api("DELETE", "leagues", undefined, l.id));
            }}
          >
            <Trash2 className="ic-sm" />
          </button>
          <button type="button" className="btn sm" onClick={() => onEdit(l.id)}>
            Edit
          </button>
        </div>
      ))}
    </div>
  );
}

function NewLeague({ busy, run, onClose, onCreated }: { busy: boolean; run: RunFn; onClose: () => void; onCreated: (id?: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"racing" | "team">("racing");
  const [sport, setSport] = useState("Rally");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [color, setColor] = useState("#FFBB14");
  const [scoring, setScoring] = useState<"points" | "order">("points");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let id: string | undefined;
    if (
      await run(async () => {
        const json = (await api("POST", "leagues", { name, kind, sport, season, color, scoring: kind === "racing" ? scoring : "points" })) as { item?: { id?: string } };
        id = json.item?.id;
      })
    ) {
      onCreated(id);
      onClose();
    }
  };
  return (
    <Sheet
      title="New league"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sports-league" className="btn primary" disabled={busy || !name.trim()}>
            Create league
          </button>
        </>
      }
    >
      <form id="sports-league" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Harrison Rallying Championship" autoFocus />
        </Field>
        <div className="two">
          <Field label="Sport">
            <input className="input" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Rally, Hockey…" />
          </Field>
          <Field label="Season">
            <input className="input" value={season} onChange={(e) => setSeason(e.target.value)} />
          </Field>
        </div>
        <Field label="Type">
          <Seg
            value={kind}
            onChange={setKind}
            options={[
              { value: "racing", label: "Racing" },
              { value: "team", label: "Team sport" },
            ]}
            label="Type"
          />
        </Field>
        {kind === "racing" && (
          <Field label="Scoring">
            <Select value={scoring} onChange={(e) => setScoring(e.target.value as any)} className="select">
              <option value="points">Points table (championship)</option>
              <option value="order">Finishing order only (no points)</option>
            </Select>
          </Field>
        )}
        <Field label="Colour">
          <input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#FFBB14" />
        </Field>
        <p className="help" style={{ margin: 0 }}>
          Logo, banner and scoring rules are set afterwards with Edit.
        </p>
      </form>
    </Sheet>
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
    if (
      await run(() =>
        api(
          "PATCH",
          "leagues",
          {
            kind: league.kind,
            color: color || null,
            ...(racing ? { scoring, constructors } : {}),
            rules: racing
              ? {
                  points: points
                    .split(/[,\s]+/)
                    .filter(Boolean)
                    .map(Number),
                  fastestLapPoint: Number(fl),
                }
              : { win: Number(win), draw: Number(draw), loss: Number(loss), overtimeLoss: Number(otl) },
          },
          league.id,
        ),
      )
    )
      onSaved?.();
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Section title="Look">
        <Field label="Accent colour">
          <input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#2DD4BF" />
        </Field>
        <Field label="Logo" help="Shown on a transparent background; a PNG with transparency works best. Initials are used until one is uploaded.">
          <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {league.logoUrl && <LogoDot url={league.logoUrl} />}
            <PhotoButton small={false} label={league.logoUrl ? "Replace" : "Upload"} onUploaded={(url) => run(() => api("PATCH", "leagues", { logoUrl: url }, league.id))} />
            {league.logoUrl && (
              <button type="button" className="btn ghost" onClick={() => run(() => api("PATCH", "leagues", { logoUrl: null }, league.id))}>
                Remove
              </button>
            )}
          </span>
        </Field>
        <Field label="Banner photo">
          <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {league.bannerUrl && <img src={league.bannerUrl} alt="" style={{ width: 96, height: 54, objectFit: "cover", borderRadius: 6 }} />}
            <PhotoButton small={false} label={league.bannerUrl ? "Replace" : "Upload"} onUploaded={(url) => run(() => api("PATCH", "leagues", { bannerUrl: url }, league.id))} />
          </span>
        </Field>
      </Section>
      <Section title="Scoring">
        {racing && (
          <Field label="How the table is ranked">
            <Select value={scoring} onChange={(e) => setScoring(e.target.value as any)} className="select">
              <option value="points">Points table (championship)</option>
              <option value="order">Finishing order only: ranked by wins, then podiums</option>
            </Select>
          </Field>
        )}
        {racing && scoring === "points" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px", gap: 12 }}>
            <Field label="Points by position" help="1st, 2nd, 3rd… separated by commas.">
              <input className="input" value={points} onChange={(e) => setPoints(e.target.value)} />
            </Field>
            <Field label="Fastest lap bonus">
              <input className="input" value={fl} onChange={(e) => setFl(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        )}
        {racing && (
          <Line label="Constructors' standings" help="Also rank teams, not just drivers.">
            <Switch checked={constructors} onChange={setConstructors} label="Constructors' standings" />
          </Line>
        )}
        {!racing && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            <Field label="Win">
              <input className="input" value={win} onChange={(e) => setWin(e.target.value)} />
            </Field>
            <Field label="Draw">
              <input className="input" value={draw} onChange={(e) => setDraw(e.target.value)} />
            </Field>
            <Field label="Loss">
              <input className="input" value={loss} onChange={(e) => setLoss(e.target.value)} />
            </Field>
            <Field label="OT loss">
              <input className="input" value={otl} onChange={(e) => setOtl(e.target.value)} />
            </Field>
          </div>
        )}
        <div>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            Save league settings
          </button>
        </div>
      </Section>
    </div>
  );
}

/* ---------------- Venues ---------------- */

function VenuesTab({ venues, run }: { venues: SportsVenue[]; run: RunFn }) {
  if (venues.length === 0) return <div className="empty">No venues yet. Tracks and stages go here, with a photo for the Sports pages.</div>;
  return (
    <div className="rows">
      {venues.map((v) => (
        <div key={v.id} className="r">
          {v.photoUrl ? (
            <img src={v.photoUrl} alt="" className="thumb" style={{ width: 72, height: 40, objectFit: "cover", flex: "none" }} />
          ) : (
            <span className="thumb" style={{ width: 72, height: 40, flex: "none", background: "var(--a-sunken)" }} />
          )}
          <span className="grow trunc" style={{ fontWeight: 600 }}>
            {v.name}
          </span>
          <PhotoButton label={v.photoUrl ? "Replace photo" : "Upload photo"} onUploaded={(url) => run(() => api("PATCH", "venues", { photoUrl: url }, v.id))} />
          <button
            type="button"
            className="btn sm ghost danger"
            aria-label={`Delete ${v.name}`}
            onClick={async () => (await confirmDialog(`Delete ${v.name}?`, { ok: "Delete", danger: true })) && run(() => api("DELETE", "venues", undefined, v.id))}
          >
            <Trash2 className="ic-sm" />
          </button>
        </div>
      ))}
    </div>
  );
}

function NewVenue({ busy, run, onClose }: { busy: boolean; run: RunFn; onClose: () => void }) {
  const [name, setName] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => api("POST", "venues", { name }))) onClose();
  };
  return (
    <Sheet
      title="Add venue"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sports-venue" className="btn primary" disabled={busy || !name.trim()}>
            Add venue
          </button>
        </>
      }
    >
      <form id="sports-venue" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <Field label="Name" help="Add the photo from the list afterwards.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coastal Pass" autoFocus />
        </Field>
      </form>
    </Sheet>
  );
}
