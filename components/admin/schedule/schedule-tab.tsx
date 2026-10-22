"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Radio, Tv } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { expandOccurrences, Occurrence } from "@/lib/schedule-core";
import {
  BroadcastRecord,
  ShowRecord,
  TAGS,
  addDays,
  describeWhen,
  fmtDay,
  fmtRange,
  fmtTime,
  localZone,
  mediumClasses,
  mediumLabel,
  startOfWeek,
} from "@/lib/schedule-client";
import { BroadcastForm, FormPreset } from "./broadcast-form";
import { selectClass } from "./styles";

const HOUR_PX = 44;
const DAY_MS = 24 * 3600 * 1000;

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
      const hay = `${b.title ?? ""} ${show?.name ?? ""} ${show?.presenter ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

interface Segment {
  occ: Occurrence;
  startMin: number; // minutes from the top of the day column
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

function WeekGrid({
  weekStart,
  occs,
  onPick,
  onCreate,
}: {
  weekStart: Date;
  occs: Occurrence[];
  onPick: (id: string) => void;
  onCreate: (start: Date) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-neutral-200 dark:border-neutral-800 text-[11px] font-semibold">
        <div />
        {days.map((d) => {
          const today = d.toDateString() === now.toDateString();
          return (
            <div key={d.getTime()} className={`px-2 py-2 text-center ${today ? "text-blue-600 dark:text-blue-400" : "text-neutral-600 dark:text-neutral-400"}`}>
              {fmtDay(d)}
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="overflow-y-auto max-h-[68vh]">
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] relative" style={{ height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-1.5 text-[10px] text-neutral-500 -translate-y-1/2" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const segs = segmentsForDay(day, occs);
            const today = day.toDateString() === now.toDateString();
            const nowMin = (now.getTime() - day.getTime()) / 60000;
            return (
              <div
                key={day.getTime()}
                className="relative border-l border-neutral-200 dark:border-neutral-800 cursor-cell"
                style={{
                  backgroundImage: "linear-gradient(to bottom, rgba(128,128,128,0.18) 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mins = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
                  onCreate(new Date(day.getTime() + mins * 60000));
                }}
              >
                {segs.map((s) => {
                  const o = s.occ;
                  const cancelled = o.status === "cancelled";
                  return (
                    <button
                      key={`${o.broadcastId}-${o.start.getTime()}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(o.broadcastId);
                      }}
                      title={`${o.title} · ${fmtRange(o.start, o.end)}`}
                      className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[10px] leading-tight cursor-pointer hover:brightness-110 ${mediumClasses(o)} ${cancelled ? "opacity-50 line-through" : ""}`}
                      style={{
                        top: (s.startMin / 60) * HOUR_PX,
                        height: Math.max(18, ((s.endMin - s.startMin) / 60) * HOUR_PX - 1),
                        left: `calc(${(s.lane / s.lanes) * 100}% + 1px)`,
                        width: `calc(${100 / s.lanes}% - 2px)`,
                      }}
                    >
                      <div className="font-bold truncate">{o.title}</div>
                      <div className="opacity-90 truncate">
                        {fmtTime(o.start)}
                        {o.tag !== "live" ? ` · ${o.tag}` : ""}
                      </div>
                    </button>
                  );
                })}
                {today && nowMin >= 0 && nowMin <= 1440 && (
                  <div className="absolute left-0 right-0 border-t-2 border-red-500 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_PX }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
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

  if (list.length === 0) {
    return <Card className="p-6 text-xs text-neutral-500 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">Nothing matches these filters.</Card>;
  }
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto bg-white dark:bg-neutral-950">
      <table className="w-full text-xs">
        <thead className="text-left text-[11px] uppercase text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
          <tr>
            <th className="p-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((b) => b.id)))}
                aria-label="Select all"
              />
            </th>
            <th className="p-3">Broadcast</th>
            <th className="p-3">When</th>
            <th className="p-3">Airs on</th>
            <th className="p-3">Type</th>
            <th className="p-3">Status</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const show = b.showId ? showById.get(b.showId) : null;
            return (
              <tr key={b.id} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} aria-label="Select" />
                </td>
                <td className="p-3">
                  <div className={`font-semibold ${b.status === "cancelled" ? "line-through opacity-60" : ""}`}>{b.title?.trim() || show?.name || "Untitled"}</div>
                  {show && <div className="text-neutral-500">{show.presenter}</div>}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {describeWhen(b)}
                  <div className="text-neutral-500">{b.kind === "weekly" ? "Weekly" : "One-off"}</div>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${mediumClasses(b)}`}>{mediumLabel(b)}</span>
                </td>
                <td className="p-3 capitalize">{b.tag}</td>
                <td className="p-3">{b.status === "cancelled" ? <span className="text-red-600 dark:text-red-400">Cancelled</span> : "Scheduled"}</td>
                <td className="p-3 text-right">
                  <button type="button" onClick={() => onEdit(b.id)} className="underline font-semibold cursor-pointer">
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduleTab({
  shows,
  broadcasts,
  reload,
}: {
  shows: ShowRecord[];
  broadcasts: BroadcastRecord[];
  reload: () => Promise<void>;
}) {
  const [view, setView] = useState<"week" | "list">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ broadcastId?: string; preset?: FormPreset } | null>(null);
  const [shiftHours, setShiftHours] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 768) setView("list");
  }, []);

  const filtered = useMemo(() => applyFilters(broadcasts, shows, filters), [broadcasts, shows, filters]);
  const occs = useMemo(
    () => expandOccurrences(shows, filtered, addDays(weekStart, -1), addDays(weekStart, 8)),
    [shows, filtered, weekStart]
  );
  const editing = panel?.broadcastId ? broadcasts.find((b) => b.id === panel.broadcastId) : undefined;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const visibleSelected = filtered.filter((b) => selected.has(b.id)).map((b) => b.id);

  const closePanel = () => setPanel(null);
  const saved = async () => {
    closePanel();
    await reload();
  };

  const deleteOne = async () => {
    if (!editing || !confirm("Delete this broadcast? Weekly broadcasts are removed for every week.")) return;
    const res = await fetch(`/api/admin/broadcasts/${editing.id}`, { method: "DELETE" });
    if (res.ok) await saved();
    else alert("Failed to delete");
  };

  const bulk = async (action: string, extra: Record<string, unknown> = {}) => {
    if (visibleSelected.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${visibleSelected.length} broadcast(s)? Weekly ones are removed for every week.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/broadcasts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: visibleSelected, action, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        alert(data.error || "Bulk action failed");
        return;
      }
      setSelected(new Set());
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const weekEnd = addDays(weekStart, 6);
  const input = "h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 text-xs";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {view === "week" && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week" className="cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-xs cursor-pointer">
              Today
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week" className="cursor-pointer">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <input
              type="date"
              className={input}
              value={`${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`}
              onChange={(e) => e.target.value && setWeekStart(startOfWeek(new Date(`${e.target.value}T00:00`)))}
              aria-label="Jump to date"
            />
            <span className="text-sm font-bold ml-1">
              {fmtDay(weekStart)} – {fmtDay(weekEnd)}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-800 overflow-hidden text-xs font-semibold">
            {(["week", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-2 cursor-pointer ${view === v ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : ""}`}
              >
                {v === "week" ? "Week" : "All broadcasts"}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" onClick={() => setPanel({})} className="text-xs gap-1.5 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={filters.q} onChange={(e) => set("q", e.target.value)} placeholder="Search title, show, presenter" className="h-9 w-56 text-xs" />
        <select value={filters.medium} onChange={(e) => set("medium", e.target.value as Filters["medium"])} className={`${selectClass} !w-auto`}>
          <option value="all">Radio and streams</option>
          <option value="radio">Radio only</option>
          <option value="stream">Streams only</option>
        </select>
        <select value={filters.tag} onChange={(e) => set("tag", e.target.value)} className={`${selectClass} !w-auto`}>
          <option value="">Any type</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select value={filters.showId} onChange={(e) => set("showId", e.target.value)} className={`${selectClass} !w-auto`}>
          <option value="">All shows</option>
          {shows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])} className={`${selectClass} !w-auto`}>
          <option value="all">Any status</option>
          <option value="active">Scheduled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {filtersActive && (
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs underline cursor-pointer">
            Clear filters
          </button>
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1"><Radio className="h-3 w-3 text-blue-500" /> Radio</span>
          <span className="inline-flex items-center gap-1"><Tv className="h-3 w-3 text-purple-500" /> Stream</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-500" /> Both</span>
          <span>Times in {localZone()}</span>
        </span>
      </div>

      {view === "list" && visibleSelected.length > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-2 border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40">
          <span className="text-xs font-bold">{visibleSelected.length} selected</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("cancel")} className="text-xs cursor-pointer">Cancel</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("restore")} className="text-xs cursor-pointer">Restore</Button>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) bulk("setTag", { tag: e.target.value });
              e.target.value = "";
            }}
            className={`${selectClass} !w-auto`}
          >
            <option value="">Set type…</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <span className="inline-flex items-center gap-1">
            <input type="number" value={shiftHours} step={0.5} onChange={(e) => setShiftHours(Number(e.target.value))} className={`${input} w-16`} aria-label="Hours to shift" />
            <span className="text-xs">h</span>
            <Button size="sm" variant="outline" disabled={busy || !shiftHours} onClick={() => bulk("shift", { minutes: Math.round(shiftHours * 60) })} className="text-xs cursor-pointer">
              Shift
            </Button>
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("delete")} className="text-xs text-red-600 cursor-pointer">Delete</Button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs underline ml-auto cursor-pointer">Clear selection</button>
        </Card>
      )}

      {broadcasts.length === 0 ? (
        <Card className="p-6 text-xs text-neutral-500 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          Nothing scheduled yet. Create a show in the Shows tab for radio, then add a broadcast.
        </Card>
      ) : view === "week" ? (
        <>
          <WeekGrid
            weekStart={weekStart}
            occs={occs}
            onPick={(id) => setPanel({ broadcastId: id })}
            onCreate={(start) => setPanel({ preset: { start, end: new Date(start.getTime() + 2 * 3600000) } })}
          />
          <p className="text-[11px] text-neutral-500">Click a block to edit it, or an empty spot to add a broadcast there. Use “All broadcasts” for bulk actions.</p>
        </>
      ) : (
        <BroadcastTable list={filtered} shows={shows} selected={selected} setSelected={setSelected} onEdit={(id) => setPanel({ broadcastId: id })} />
      )}

      {panel && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-20" onClick={closePanel}>
          <Card
            className="w-full max-w-xl p-6 space-y-4 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? "Edit broadcast" : "New broadcast"}</h2>
              <button type="button" onClick={closePanel} aria-label="Close" className="cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <BroadcastForm
              key={editing?.id ?? "new"}
              shows={shows}
              broadcast={editing}
              preset={panel.preset}
              onSaved={saved}
              onCancel={closePanel}
              onDelete={editing ? deleteOne : undefined}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
