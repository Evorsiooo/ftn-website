"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ListFilter, Plus, Radio, Tv, Users } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, PageBar, Pill, Screen, Seg, Sheet } from "@/components/admin/ui";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { canManageRadio } from "@/lib/rbac";
import { expandOccurrences, type Occurrence } from "@/lib/schedule-core";
import { ApiBroadcast, BroadcastRecord, ShowRecord, TAGS, addDays, describeWhen, localZone, mediumLabel, parseBroadcast, startOfWeek } from "@/lib/schedule-client";
import { ShowsTab } from "@/components/admin/schedule/shows-tab";
import { OnAirStrip } from "@/components/admin/schedule/on-air-strip";
import { BroadcastForm, type FormPreset } from "@/components/admin/schedule/broadcast-form";
import { ShowPanel } from "@/components/admin/schedule/show-panel";
import { DT_CLASS } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 3600 * 1000;
const hm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const dayShort = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" });
const monthDay = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

interface Filters {
  medium: "all" | "radio" | "stream";
  tag: string;
  showId: string;
  status: "all" | "active" | "cancelled";
  q: string;
}
const DEFAULT_FILTERS: Filters = { medium: "all", tag: "", showId: "", status: "all", q: "" };

function applyFilters(list: BroadcastRecord[], shows: ShowRecord[], f: Filters): BroadcastRecord[] {
  const showById = new Map(shows.map((s) => [s.id, s]));
  const q = f.q.trim().toLowerCase();
  return list.filter((b) => {
    if (f.medium === "radio" && !b.onRadio) return false;
    if (f.medium === "stream" && !b.onStream) return false;
    if (f.tag && b.tag !== f.tag) return false;
    if (f.showId && b.showId !== f.showId) return false;
    if (f.status === "active" && b.status === "cancelled") return false;
    if (f.status === "cancelled" && b.status !== "cancelled") return false;
    if (q) {
      const show = b.showId ? showById.get(b.showId) : null;
      if (!`${b.title ?? ""} ${show?.name ?? ""} ${show?.presenter ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Colour of a block: yellow for a show someone hosts on the radio, blue for a video stream, grey for what the radio plays by itself. */
function kindOf(o: Pick<Occurrence, "onRadio" | "onStream" | "plays">): "radio" | "stream" | "auto" {
  if (o.onRadio && o.plays === "hosted") return "radio";
  if (!o.onRadio && o.onStream) return "stream";
  return o.onStream ? "stream" : "auto";
}

interface Segment {
  occ: Occurrence;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

// Clip occurrences to one local day and lay overlapping ones out side by side.
function segmentsForDay(day: Date, occs: Occurrence[]): Segment[] {
  const dayStart = day.getTime();
  const dayEnd = addDays(day, 1).getTime();
  const raw = occs
    .filter((o) => o.start.getTime() < dayEnd && o.end.getTime() > dayStart)
    .map((occ) => ({
      occ,
      startMin: Math.max(0, (occ.start.getTime() - dayStart) / 60000),
      endMin: Math.min(24 * 60, (occ.end.getTime() - dayStart) / 60000),
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster: Segment[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((s) => s.lane + 1));
    cluster.forEach((s) => (s.lanes = lanes));
    cluster = [];
  };
  for (const seg of raw) {
    if (seg.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.endMin > seg.startMin).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    seg.lane = lane;
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.endMin);
  }
  flush();
  return raw;
}

/**
 * The week, fitted to the screen: hours run from 07:00 to 23:00 (wider when a show is earlier or later),
 * so the whole week is visible without scrolling.
 */
function WeekGrid({ weekStart, occs, onPick, onCreate }: { weekStart: Date; occs: Occurrence[]; onPick: (o: Occurrence) => void; onCreate: (start: Date) => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const segs = days.map((d) => segmentsForDay(d, occs));
  let first = 7;
  let last = 23;
  segs.flat().forEach((s) => {
    first = Math.min(first, Math.floor(s.startMin / 60));
    last = Math.max(last, Math.ceil(s.endMin / 60));
  });
  const rows = last - first;
  const pct = (min: number) => ((min - first * 60) / (rows * 60)) * 100;

  return (
    <div className="cal">
      <div className="corner" />
      {days.map((d) => {
        const today = d.toDateString() === now.toDateString();
        return (
          <div key={d.getTime()} className={cn("dh", today && "is-today")}>
            {dayShort(d)} <b>{d.getDate()}</b>
          </div>
        );
      })}
      <div className="hours" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i}>{i === 0 ? "" : `${String(first + i).padStart(2, "0")}:00`}</span>
        ))}
      </div>
      {days.map((day, di) => {
        const today = day.toDateString() === now.toDateString();
        const nowMin = (now.getTime() - day.getTime()) / 60000;
        return (
          <div
            key={day.getTime()}
            className={cn("day", today && "is-today")}
            style={{ backgroundSize: `100% calc(100% / ${rows})`, cursor: "cell" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mins = first * 60 + Math.floor((((e.clientY - rect.top) / rect.height) * rows * 60) / 30) * 30;
              onCreate(new Date(day.getTime() + mins * 60000));
            }}
            title="Click an empty spot to add a broadcast"
          >
            {segs[di].map((s) => {
              const o = s.occ;
              const k = kindOf(o);
              const past = o.end.getTime() < now.getTime();
              const live = o.start <= now && o.end > now;
              return (
                <button
                  key={`${o.broadcastId}-${o.start.getTime()}`}
                  type="button"
                  className={cn("ev", k, past && "past", live && "live")}
                  style={{
                    top: `${pct(s.startMin)}%`,
                    height: `max(20px, calc(${pct(s.endMin) - pct(s.startMin)}% - 2px))`,
                    left: `calc(${(s.lane / s.lanes) * 100}% + 3px)`,
                    width: `calc(${100 / s.lanes}% - 6px)`,
                    right: "auto",
                    textDecoration: o.status === "cancelled" ? "line-through" : undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(o);
                  }}
                  title={`${o.title} · ${hm(o.start)} – ${hm(o.end)}`}
                >
                  <b>
                    {k === "stream" ? <Tv className="ic-sm" style={{ display: "inline", width: 12, height: 12, marginRight: 3, verticalAlign: -1 }} /> : null}
                    {o.title}
                  </b>
                  <span>
                    {hm(o.start)} – {hm(o.end)}
                    {o.presenter ? ` · ${o.presenter}` : ""}
                  </span>
                </button>
              );
            })}
            {today && nowMin >= first * 60 && nowMin <= last * 60 && <div className="nowline" style={{ top: `${pct(nowMin)}%` }} />}
          </div>
        );
      })}
    </div>
  );
}

/** Phones: the same week as a list grouped by day. */
function Agenda({ weekStart, occs, onPick }: { weekStart: Date; occs: Occurrence[]; onPick: (o: Occurrence) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const now = new Date();
  return (
    <div className="agenda phone-only">
      {days.map((d) => {
        const list = occs.filter((o) => o.start.getTime() < d.getTime() + DAY_MS && o.end.getTime() > d.getTime()).sort((a, b) => +a.start - +b.start);
        return (
          <div key={d.getTime()}>
            <div className="dayh">
              {d.toDateString() === now.toDateString() ? "Today · " : ""}
              {d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
            </div>
            {list.length === 0 ? (
              <div className="a muted" style={{ cursor: "default" }}>
                Nothing scheduled
              </div>
            ) : (
              list.map((o) => {
                const k = kindOf(o);
                return (
                  <button key={`${o.broadcastId}-${o.start.getTime()}`} type="button" className="a" onClick={() => onPick(o)}>
                    <span className="tm">
                      {hm(o.start)} – {hm(o.end)}
                    </span>
                    <span className="stripe" style={{ background: k === "radio" ? "var(--a-accent)" : k === "stream" ? "var(--a-blue)" : "var(--a-grey)" }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="trunc" style={{ display: "block", fontWeight: 600, textDecoration: o.status === "cancelled" ? "line-through" : undefined }}>
                        {o.title}
                      </span>
                      <span className="t12 muted trunc" style={{ display: "block" }}>
                        {[o.presenter, mediumLabel(o)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {o.start <= now && o.end > now && <Pill tone="red">On air</Pill>}
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

function BroadcastTable({
  list,
  shows,
  selected,
  setSelected,
  onEdit,
}: {
  list: BroadcastRecord[];
  shows: ShowRecord[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onEdit: (id: string) => void;
}) {
  const showById = new Map(shows.map((s) => [s.id, s]));
  const allSelected = list.length > 0 && list.every((b) => selected.has(b.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const sorted = [...list].sort((a, b) => {
    const ka = a.kind === "once" ? a.startsAt?.getTime() ?? 0 : Infinity;
    const kb = b.kind === "once" ? b.startsAt?.getTime() ?? 0 : Infinity;
    return ka - kb || (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || (a.startMinute ?? 0) - (b.startMinute ?? 0);
  });
  if (list.length === 0) return <div className="empty">Nothing matches these filters.</div>;
  return (
    <table className="table phone-auto">
      <thead>
        <tr>
          <th style={{ width: 40 }}>
            <input type="checkbox" className="check" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((b) => b.id)))} aria-label="Select all" />
          </th>
          <th>Broadcast</th>
          <th style={{ width: "30%" }}>When</th>
          <th className="hide-m" style={{ width: 130 }}>
            Airs on
          </th>
          <th className="hide-m" style={{ width: 110 }}>
            Type
          </th>
          <th style={{ width: 110 }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((b) => {
          const show = b.showId ? showById.get(b.showId) : null;
          return (
            <tr key={b.id} className={cn("click", selected.has(b.id) && "on")} onClick={() => onEdit(b.id)}>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="check" checked={selected.has(b.id)} onChange={() => toggle(b.id)} aria-label="Select" />
              </td>
              <td>
                <span style={{ fontWeight: 600, textDecoration: b.status === "cancelled" ? "line-through" : undefined }}>{b.title?.trim() || show?.name || "Untitled"}</span>
                {show && <span className="muted"> · {show.presenter}</span>}
              </td>
              <td title={describeWhen(b)}>
                {describeWhen(b)}
                <span className="muted"> · {b.kind === "weekly" ? "weekly" : "once"}</span>
              </td>
              <td className="hide-m">{mediumLabel(b)}</td>
              <td className="hide-m" style={{ textTransform: "capitalize" }}>
                {b.tag}
              </td>
              <td>{b.status === "cancelled" ? <Pill tone="red">Cancelled</Pill> : <Pill tone="green">Scheduled</Pill>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SchedulePage() {
  const params = useSearchParams();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showsOpen, setShowsOpen] = useState(false);
  const [view, setView] = useState<"week" | "list">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ broadcastId?: string; preset?: FormPreset } | null>(null);
  const [picked, setPicked] = useState<Occurrence | null>(null);
  const [shiftHours, setShiftHours] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/broadcasts");
      if (res.ok) {
        const data = (await res.json()) as { shows: ShowRecord[]; broadcasts: ApiBroadcast[] };
        setShows(data.shows || []);
        setBroadcasts((data.broadcasts || []).map(parseBroadcast));
      }
    } catch (err) {
      console.error("Failed to load schedule:", err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // ?show=<id> (from the jump bar): only that show's broadcasts.
  useEffect(() => {
    const id = params.get("show");
    if (id) setFilters((f) => ({ ...f, showId: id }));
  }, [params]);

  const filtered = useMemo(() => applyFilters(broadcasts, shows, filters), [broadcasts, shows, filters]);
  const occs = useMemo(() => expandOccurrences(shows, filtered, addDays(weekStart, -1), addDays(weekStart, 8)), [shows, filtered, weekStart]);
  const editing = panel?.broadcastId ? broadcasts.find((b) => b.id === panel.broadcastId) : undefined;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const filterCount = (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length;
  const visibleSelected = filtered.filter((b) => selected.has(b.id)).map((b) => b.id);

  const closePanel = () => setPanel(null);
  const saved = async () => {
    closePanel();
    await load();
  };

  const deleteOne = async () => {
    if (!editing || !(await confirmDialog("Delete this broadcast? Weekly broadcasts are removed for every week.", { ok: "Delete", danger: true }))) return;
    const res = await fetch(`/api/admin/broadcasts/${editing.id}`, { method: "DELETE" });
    if (res.ok) await saved();
    else toast("Failed to delete");
  };

  const bulk = async (action: string, extra: Record<string, unknown> = {}) => {
    if (visibleSelected.length === 0) return;
    if (action === "delete" && !(await confirmDialog(`Delete ${visibleSelected.length} broadcast(s)? Weekly ones are removed for every week.`, { ok: "Delete", danger: true }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/broadcasts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: visibleSelected, action, ...extra }) });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        toast(data.error || "Bulk action failed");
        return;
      }
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  };

  const weekEnd = addDays(weekStart, 6);
  const range = weekStart.getMonth() === weekEnd.getMonth() ? `${weekStart.toLocaleDateString(undefined, { month: "short" })} ${weekStart.getDate()} – ${weekEnd.getDate()}` : `${monthDay(weekStart)} – ${monthDay(weekEnd)}`;
  const isThisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
  const weekNav = (
    <>
      <button type="button" className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
        <ChevronLeft className="ic" />
      </button>
      <span className="num" style={{ fontWeight: 600, whiteSpace: "nowrap", minWidth: 96, textAlign: "center" }}>
        {range}
      </span>
      <button type="button" className="iconbtn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
        <ChevronRight className="ic" />
      </button>
      <button type="button" className="btn sm" disabled={isThisWeek} onClick={() => setWeekStart(startOfWeek(new Date()))}>
        Today
      </button>
    </>
  );

  return (
    <Screen>
      <PageBar
        title="Schedule"
        tools={
          <>
            {view === "week" && weekNav}
            <Seg value={view} onChange={setView} options={[{ value: "week", label: "Week" }, { value: "list", label: "All broadcasts" }]} label="View" />
            <button type="button" className={cn("btn sm", filtersOpen ? "strong" : "ghost")} onClick={() => setFiltersOpen((v) => !v)} aria-pressed={filtersOpen}>
              <ListFilter className="ic-sm" /> Filters{filterCount ? ` · ${filterCount}` : ""}
            </button>
          </>
        }
        end={
          <>
            <button type="button" className="btn has-lbl-m" onClick={() => setShowsOpen(true)} aria-label="Shows and presenters">
              <Users className="ic" />
              <span className="lbl-m">Shows &amp; presenters</span>
            </button>
            <button type="button" className="btn primary has-lbl-m" onClick={() => setPanel({})} aria-label="New broadcast">
              <Plus className="ic" />
              <span className="lbl-m">New broadcast</span>
            </button>
          </>
        }
        mrow={
          <>
            {weekNav}
            <button type="button" className={cn("btn sm", filtersOpen ? "strong" : "ghost")} style={{ marginLeft: "auto" }} onClick={() => setFiltersOpen((v) => !v)} aria-label="Filters">
              <ListFilter className="ic-sm" />
              {filterCount ? filterCount : ""}
            </button>
          </>
        }
      />
      <OnAirStrip shows={shows} broadcasts={broadcasts} />
      {filtersOpen && (
        <div className="notice" style={{ flexWrap: "wrap", gap: 8 }}>
          <input className="input sm" style={{ width: 220 }} value={filters.q} onChange={(e) => set("q", e.target.value)} placeholder="Search title, show, presenter" aria-label="Search broadcasts" />
          <Select value={filters.medium} onChange={(e) => set("medium", e.target.value as Filters["medium"])} className="select sm h-8" aria-label="Airs on">
            <option value="all">Radio and streams</option>
            <option value="radio">Radio only</option>
            <option value="stream">Streams only</option>
          </Select>
          <Select value={filters.tag} onChange={(e) => set("tag", e.target.value)} className="select sm h-8" aria-label="Type">
            <option value="">Any type</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
          <Select value={filters.showId} onChange={(e) => set("showId", e.target.value)} className="select sm h-8" aria-label="Show">
            <option value="">All shows</option>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])} className="select sm h-8" aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          {view === "week" && (
            <DateTimeInput
              type="date"
              className={`${DT_CLASS} h-8 w-auto`}
              value={`${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`}
              onChange={(e) => e.target.value && setWeekStart(startOfWeek(new Date(`${e.target.value}T00:00`)))}
              aria-label="Jump to a week"
            />
          )}
          {filterCount > 0 && (
            <button type="button" className="btn sm ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear
            </button>
          )}
          <span className="t12 muted" style={{ marginLeft: "auto", display: "inline-flex", gap: 12, alignItems: "center" }}>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <Radio className="ic-sm" /> yellow: hosted radio
            </span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <Tv className="ic-sm" /> blue: video stream
            </span>
            <span>grey: playlist or relay</span>
            <span>Times in {localZone()}</span>
          </span>
        </div>
      )}
      {view === "list" && visibleSelected.length > 0 && (
        <div className="notice" style={{ flexWrap: "wrap", gap: 8 }}>
          <b>{visibleSelected.length} selected</b>
          <button type="button" className="btn sm" disabled={busy} onClick={() => bulk("cancel")}>
            Cancel
          </button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => bulk("restore")}>
            Restore
          </button>
          <Select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) bulk("setTag", { tag: e.target.value });
            }}
            className="select sm h-8"
            aria-label="Set type"
          >
            <option value="">Set type…</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            Move by
            <input type="number" value={shiftHours} step={0.5} onChange={(e) => setShiftHours(Number(e.target.value))} className="input sm" style={{ width: 64 }} aria-label="Hours to shift" />h
            <button type="button" className="btn sm" disabled={busy || !shiftHours} onClick={() => bulk("shift", { minutes: Math.round(shiftHours * 60) })}>
              Move
            </button>
          </span>
          <button type="button" className="btn sm ghost danger" disabled={busy} onClick={() => bulk("delete")}>
            Delete
          </button>
          <button type="button" className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}
      <Body scroll={view === "list"}>
        {loading ? (
          <div className="pane-empty">Loading the schedule…</div>
        ) : view === "week" ? (
          <>
            <WeekGrid weekStart={weekStart} occs={occs} onPick={setPicked} onCreate={(start) => setPanel({ preset: { start, end: new Date(start.getTime() + 2 * 3600000) } })} />
            <Agenda weekStart={weekStart} occs={occs} onPick={setPicked} />
          </>
        ) : broadcasts.length === 0 ? (
          <div className="empty">Nothing scheduled yet. Add a show under Shows &amp; presenters, then add a broadcast.</div>
        ) : (
          <BroadcastTable list={filtered} shows={shows} selected={selected} setSelected={setSelected} onEdit={(id) => setPanel({ broadcastId: id })} />
        )}
      </Body>

      {picked && !panel && (
        <ShowPanel
          occ={picked}
          onClose={() => setPicked(null)}
          onEdit={() => {
            setPanel({ broadcastId: picked.broadcastId });
            setPicked(null);
          }}
        />
      )}
      {panel && (
        <Sheet title={editing ? "Edit broadcast" : "New broadcast"} onClose={closePanel}>
          <BroadcastForm key={editing?.id ?? "new"} shows={shows} broadcast={editing} preset={panel.preset} onSaved={saved} onCancel={closePanel} onDelete={editing ? deleteOne : undefined} />
        </Sheet>
      )}
      {showsOpen && (
        <Sheet title="Shows & presenters" onClose={() => setShowsOpen(false)} wide>
          <ShowsTab shows={shows} loading={loading} reload={load} />
        </Sheet>
      )}
    </Screen>
  );
}

export default function AdminSchedulePage() {
  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Schedule">
      <React.Suspense fallback={null}>
        <SchedulePage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
