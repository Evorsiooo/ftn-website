"use client";
import React, { useEffect, useState } from "react";
import { Clock, User } from "lucide-react";

export interface ScheduleEntry {
  slotId: string;
  tag: "live" | "simulcast" | "rebroadcast";
  start: string;
  end: string;
  show: { id: string; name: string; presenter: string; description: string | null; artUrl: string | null };
}

const TAG_LABEL: Record<ScheduleEntry["tag"], string> = {
  live: "Live",
  simulcast: "Simulcast",
  rebroadcast: "Rebroadcast",
};

export function ScheduleList() {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/radio/schedule")
      .then((res) => res.json())
      .then((data: any) => setEntries(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => setEntries([]));
  }, []);

  if (entries === null) {
    return <div className="text-xs text-neutral-500">Loading schedule...</div>;
  }
  if (entries.length === 0) {
    return <div className="text-xs text-neutral-500">No shows are scheduled yet. Check back soon.</div>;
  }

  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

  const groups = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const key = dayFmt.format(new Date(entry.start));
    groups.set(key, [...(groups.get(key) || []), entry]);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([day, items]) => (
        <div key={day} className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{day}</h3>
          <div className="divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
            {items.map((entry) => (
              <div key={`${entry.slotId}-${entry.start}`} className="p-4 flex items-center gap-4">
                {entry.show.artUrl ? (
                  <img src={entry.show.artUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-neutral-800 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{entry.show.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <User className="h-3 w-3" /> {entry.show.presenter}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center justify-end gap-1.5 text-xs font-mono text-[#FFBB14]">
                    <Clock className="h-3 w-3" />
                    {timeFmt.format(new Date(entry.start))} – {timeFmt.format(new Date(entry.end))}
                  </div>
                  {entry.tag !== "live" && (
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">{TAG_LABEL[entry.tag]}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-neutral-500">Times shown in your local timezone.</p>
    </div>
  );
}
